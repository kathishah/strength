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

// A small outline icon from path strings (createElementNS, so no markup is parsed).
export function svgIcon(paths, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, String(v));
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// An icon button that needs two taps: the first shows armedText beside the icon for a few seconds, the second runs onConfirm.
export function armedIconButton({ label, armedText, className, icon, onConfirm, ms = 4000 }) {
  const words = h('span', { class: 'armed-text' });
  const button = h('button', { type: 'button', class: className, 'aria-label': label }, icon, words);
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    words.textContent = '';
    button.classList.remove('armed');
    button.setAttribute('aria-label', label);
  };
  button.addEventListener('click', () => {
    if (timer === null) {
      words.textContent = armedText;
      button.classList.add('armed');
      button.setAttribute('aria-label', `${label}: tap again to confirm`);
      timer = setTimeout(disarm, ms);
    } else {
      disarm();
      onConfirm();
    }
  });
  return button;
}
