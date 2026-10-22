// A very small DOM for driving the app's screens under node --test (the project has no dependencies, so no jsdom).
// It implements only what app/js/ui and app/js/boot.js use: elements with attributes, classes, dataset, children, text and events
// (bubbling), getElementById, a hash location, and a parser for the plain markup of app/index.html and demo/index.html.
//
//   const dom = installFakeDom({ html: readFileSync('app/index.html', 'utf8') });
//   ... await startApp({ mode: 'local' }) ...
//   dom.byId('sync-button')   dom.click(el)   dom.text(el)   dom.find(root, predicate)   dom.uninstall()

const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);

class TextNode {
  constructor(text) { this.textContent = String(text); this.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
}

class ClassList {
  constructor(el) { this.el = el; }
  list() { return this.el.className.split(/\s+/).filter(Boolean); }
  add(...names) { this.el.className = [...new Set([...this.list(), ...names])].join(' '); }
  remove(...names) { this.el.className = this.list().filter((n) => !names.includes(n)).join(' '); }
  contains(name) { return this.list().includes(name); }
  toggle(name, force) {
    const on = force ?? !this.contains(name);
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this.classList = new ClassList(this);
    this.className = '';
    this.hidden = false;
    this.scrollTop = 0;
    this.offsetWidth = 100;
  }
  get id() { return this.attributes.get('id') ?? ''; }
  set id(value) { this.attributes.set('id', String(value)); }
  get children() { return this.childNodes.filter((n) => n instanceof Element); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.replaceChildren(...(value === '' || value == null ? [] : [String(value)])); }
  setAttribute(name, value) {
    if (name === 'class') this.className = String(value);
    else this.attributes.set(name, String(value));
  }
  getAttribute(name) { return name === 'class' ? this.className : (this.attributes.get(name) ?? null); }
  removeAttribute(name) { this.attributes.delete(name); }
  adopt(node) {
    const n = typeof node === 'string' || typeof node === 'number' ? new TextNode(node) : node;
    n.parentNode?.removeChild(n);
    n.parentNode = this;
    return n;
  }
  append(...nodes) { for (const node of nodes) this.childNodes.push(this.adopt(node)); }
  prepend(...nodes) { this.childNodes.unshift(...nodes.map((n) => this.adopt(n))); }
  appendChild(node) { this.append(node); return node; }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  replaceChildren(...nodes) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  before(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const adopted = nodes.map((n) => parent.adopt(n));
    parent.childNodes.splice(parent.childNodes.indexOf(this), 0, ...adopted);
  }
  remove() { this.parentNode?.removeChild(this); }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ??= this;
    for (let n = this; n && !event.stopped; n = n.parentNode) {
      event.currentTarget = n;
      for (const fn of [...(n.listeners?.get(event.type) ?? [])]) fn(event);
      if (event.bubbles === false) break;
    }
    return !event.defaultPrevented;
  }
  click() { return this.dispatchEvent(makeEvent('click')); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0 }; }
  setPointerCapture() {}
  scrollTo(x, y) { this.scrollTop = typeof x === 'object' ? (x.top ?? 0) : (y ?? 0); }
  scrollIntoView() {}
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const test = selectorTest(selector);
    const out = [];
    const walk = (node) => { for (const c of node.children) { if (test(c)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
}

// Supports "tag", ".class", "#id", "[attr]" and "[attr=value]" on their own: all the app uses.
function selectorTest(selector) {
  const s = selector.trim();
  if (s.startsWith('.')) return (e) => e.classList.contains(s.slice(1));
  if (s.startsWith('#')) return (e) => e.id === s.slice(1);
  const attr = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(s);
  if (attr) return (e) => (attr[2] === undefined ? e.attributes.has(attr[1]) : e.getAttribute(attr[1]) === attr[2]);
  return (e) => e.tagName === s.toUpperCase();
}

export function makeEvent(type, extra = {}) {
  return { type, bubbles: true, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
}

function parseAttributes(text) {
  const attrs = [];
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (let m; (m = re.exec(text));) attrs.push([m[1], m[2] ?? m[3] ?? m[4] ?? '']);
  return attrs;
}

// Parses plain, well-formed markup (the body of the entry pages) into `parent`. No scripts, entities or implied tags.
function parseInto(parent, html, document) {
  const re = /<!--[\s\S]*?-->|<\/(\w+)\s*>|<(\w+)((?:\s+[^<>]*?)?)\s*(\/?)>|([^<]+)/g;
  const stack = [parent];
  for (let m; (m = re.exec(html));) {
    const top = stack[stack.length - 1];
    if (m[1]) stack.pop();
    else if (m[2]) {
      const el = document.createElement(m[2]);
      for (const [name, value] of parseAttributes(m[3])) {
        if (name === 'hidden') el.hidden = true;
        else el.setAttribute(name, value);
      }
      top.append(el);
      if (!VOID.has(m[2].toLowerCase()) && !m[4]) stack.push(el);
    } else if (m[5] && m[5].trim()) top.append(m[5].replace(/\s+/g, ' '));
  }
}

const realSetInterval = globalThis.setInterval;
const realSetTimeout = globalThis.setTimeout;

export function installFakeDom({ html = '<header id="app-header" hidden></header><main><div id="screen"></div></main>' } = {}) {
  const saved = {};
  const globals = {};
  const document = new Element('#document', null);
  document.ownerDocument = document;
  document.createElement = (tag) => new Element(tag, document);
  document.createElementNS = (_ns, tag) => new Element(tag, document);
  document.documentElement = new Element('html', document);
  document.body = new Element('body', document);
  document.documentElement.parentNode = document;
  document.childNodes = [document.documentElement];
  document.documentElement.append(document.body);
  document.getElementById = (id) => document.body.querySelectorAll(`#${id}`)[0] ?? null;
  document.hidden = false;
  document.activeElement = null;
  Object.defineProperty(document, 'isConnected', { value: true });
  const bodyHtml = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? html;
  parseInto(document.body, bodyHtml, document);

  const windowListeners = new Map();
  const location = {
    _hash: '',
    get hash() { return this._hash; },
    set hash(value) {
      this._hash = String(value).startsWith('#') ? String(value) : `#${value}`;
      queueMicrotask(() => windowListeners.get('hashchange')?.forEach((fn) => fn(makeEvent('hashchange'))));
    },
    reload() { location.reloaded = (location.reloaded ?? 0) + 1; },
  };
  Object.assign(globals, {
    document,
    location,
    window: globalThis,
    scrollY: 0,
    scrollTo() {},
    scrollBy() {},
    addEventListener: (type, fn) => (windowListeners.get(type) ?? windowListeners.set(type, new Set()).get(type)).add(fn),
    removeEventListener: (type, fn) => windowListeners.get(type)?.delete(fn),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    // Timers the screens leave running (the rest ticker) must not keep the test process alive.
    setInterval: (...args) => realSetInterval(...args).unref(),
    setTimeout: (...args) => realSetTimeout(...args).unref(),
  });
  for (const [key, value] of Object.entries(globals)) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  const walk = (node, fn) => { for (const c of node.children ?? []) { fn(c); walk(c, fn); } };
  return {
    document,
    location,
    windowListeners,
    byId: (id) => document.getElementById(id),
    click(el) { return el.click(); },
    text: (el) => el.textContent,
    find(root, predicate) { const out = []; walk(root, (e) => { if (predicate(e)) out.push(e); }); return out; },
    findByText(root, text, tag) { return this.find(root, (e) => (!tag || e.tagName === tag.toUpperCase()) && e.textContent.trim() === text); },
    uninstall() {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    },
  };
}
