type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  disabled?: boolean;
  type?: string;
  value?: string;
  min?: string;
  max?: string;
  step?: string;
  checked?: boolean;
  href?: string;
  title?: string;
  role?: string;
  tabIndex?: number;
  ariaLabel?: string;
  /** Decorative layers — confetti, washes — must not be read out. */
  ariaHidden?: boolean;
  dataset?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: never) => void>>;
}

/**
 * Makes a non-button element behave like one: clickable, focusable, and
 * operable from the keyboard. A table row that only answers the mouse is a
 * control half the players cannot reach.
 */
export function activatable(el: HTMLElement, run: () => void): HTMLElement {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', run);
  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    run();
  });
  return el;
}

/** Tiny hyperscript helper. Keeps screens declarative without pulling in a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs?: Attrs | null, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    if (attrs.class) el.className = attrs.class;
    if (attrs.id) el.id = attrs.id;
    if (attrs.text !== undefined) el.textContent = attrs.text;
    if (attrs.html !== undefined) el.innerHTML = attrs.html;
    if (attrs.title) el.title = attrs.title;
    if (attrs.role) el.setAttribute('role', attrs.role);
    if (attrs.ariaLabel) el.setAttribute('aria-label', attrs.ariaLabel);
    if (attrs.ariaHidden) el.setAttribute('aria-hidden', 'true');
    if (attrs.tabIndex !== undefined) el.tabIndex = attrs.tabIndex;
    if (attrs.style) {
      if (typeof attrs.style === 'string') el.setAttribute('style', attrs.style);
      else Object.assign(el.style, attrs.style);
    }
    if (attrs.dataset) for (const [k, v] of Object.entries(attrs.dataset)) el.dataset[k] = v;
    if (attrs.disabled !== undefined) (el as HTMLButtonElement).disabled = attrs.disabled;
    if (attrs.type) (el as HTMLInputElement).type = attrs.type;
    if (attrs.value !== undefined) (el as HTMLInputElement).value = attrs.value;
    if (attrs.min !== undefined) (el as HTMLInputElement).min = attrs.min;
    if (attrs.max !== undefined) (el as HTMLInputElement).max = attrs.max;
    if (attrs.step !== undefined) (el as HTMLInputElement).step = attrs.step;
    if (attrs.checked !== undefined) (el as HTMLInputElement).checked = attrs.checked;
    if (attrs.href !== undefined) (el as HTMLAnchorElement).href = attrs.href;
    if (attrs.on) {
      for (const [k, fn] of Object.entries(attrs.on)) {
        if (fn) el.addEventListener(k, fn as EventListener);
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c))
      : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const frag = (...children: Child[]): DocumentFragment => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};
