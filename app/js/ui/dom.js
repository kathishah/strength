// A small element builder, so the screens never build markup from strings (nothing typed by the person, and nothing from
// the log, can become HTML). h('button', { class: 'btn', onclick: fn }, 'Text', child)

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'open']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

// Replaces an element's children with these (arrays are flattened, null and false are skipped). Element.replaceChildren would turn
// null into the text "null" and an array into text.
export function fill(parent, ...children) {
  parent.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return parent;
}

// Two taps to confirm: the first arms the button (its text changes), the second within 4 s runs it.
export function armedButton(button, { armedText, onConfirm, ms = 4000 }) {
  const normal = button.textContent;
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = normal;
    delete button.dataset.armed;
  };
  button.addEventListener('click', () => {
    if (timer === null) {
      button.textContent = armedText;
      button.dataset.armed = 'true';
      timer = setTimeout(disarm, ms);
    } else {
      disarm();
      onConfirm();
    }
  });
  return button;
}

// A row of 0-10 buttons for a back pain rating; tapping the chosen one again clears it (the rating is optional).
// Returns { el, set(value) }.
export function painChips({ label, value = null, onChange }) {
  const buttons = [];
  let current = value;
  const paint = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(current === i)));
  for (let i = 0; i <= 10; i++) {
    buttons.push(h('button', {
      type: 'button', class: 'chip', 'aria-label': `${label}: ${i} out of 10`,
      onclick() {
        current = current === i ? null : i;
        paint();
        onChange(current);
      },
    }, String(i)));
  }
  paint();
  return {
    el: h('div', { class: 'chips', role: 'group', 'aria-label': label }, buttons),
    set(v) { current = v; paint(); },
  };
}
