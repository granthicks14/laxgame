/** Original inline SVG marks. Drawn on a chunky grid so they sit alongside the
 *  pixel field art rather than looking like borrowed emoji. */

function svg(viewBox: string, body: string, size: number, color: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.style.display = 'inline-block';
  wrap.style.lineHeight = '0';
  wrap.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="${color}" `
    + `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
  return wrap;
}

export function trophyIcon(size = 56, color = 'var(--accent)'): HTMLElement {
  return svg('0 0 16 16', `
    <rect x="3" y="1" width="10" height="2"/>
    <rect x="3" y="3" width="10" height="4"/>
    <rect x="4" y="7" width="8" height="2"/>
    <rect x="1" y="3" width="2" height="3"/>
    <rect x="13" y="3" width="2" height="3"/>
    <rect x="7" y="9" width="2" height="3"/>
    <rect x="4" y="12" width="8" height="2"/>
    <rect x="3" y="14" width="10" height="1"/>`, size, color);
}

/** Crossed lacrosse sticks. */
export function sticksIcon(size = 56, color = 'var(--accent)'): HTMLElement {
  return svg('0 0 16 16', `
    <rect x="2" y="1" width="2" height="2"/><rect x="4" y="3" width="2" height="2"/>
    <rect x="6" y="5" width="2" height="2"/><rect x="8" y="7" width="2" height="2"/>
    <rect x="10" y="9" width="2" height="2"/><rect x="12" y="11" width="2" height="3"/>
    <rect x="12" y="1" width="2" height="2"/><rect x="10" y="3" width="2" height="2"/>
    <rect x="8" y="5" width="2" height="2"/><rect x="6" y="7" width="2" height="2"/>
    <rect x="4" y="9" width="2" height="2"/><rect x="2" y="11" width="2" height="3"/>
    <rect x="7" y="0" width="2" height="2" opacity="0.55"/>`, size, color);
}

/** A clipboard, for drill results that fell short. */
export function clipboardIcon(size = 56, color = 'var(--text-2)'): HTMLElement {
  return svg('0 0 16 16', `
    <rect x="3" y="1" width="10" height="14"/>
    <rect x="6" y="0" width="4" height="2"/>
    <rect x="5" y="4" width="6" height="1" fill="#0d1219"/>
    <rect x="5" y="7" width="6" height="1" fill="#0d1219"/>
    <rect x="5" y="10" width="4" height="1" fill="#0d1219"/>`, size, color);
}

/** Pause bars for the in-game button. */
export function pauseIcon(size = 15, color = 'currentColor'): HTMLElement {
  return svg('0 0 16 16', `<rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/>`, size, color);
}
