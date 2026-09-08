import type { Emblem } from '../data/emblems';

/** Chunky pixel-friendly text. The buffer is upscaled with nearest-neighbour,
 *  so a condensed face at buffer resolution reads as retro signage. */
export function pixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'center',
  weight = 700,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.font = `${weight} ${Math.max(4, Math.round(size))}px "Arial Narrow", "Helvetica Neue", Impact, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.restore();
}

/** Paints an original team mark. Everything is drawn from the emblem spec, so
 *  there is never a missing image or an empty logo box. */
export function drawEmblem(
  ctx: CanvasRenderingContext2D, e: Emblem, cx: number, cy: number, r: number, alpha = 1,
  flat = false,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.lineJoin = 'miter';

  path(ctx, e.shape, cx, cy, r);
  ctx.fillStyle = e.body;
  ctx.fill();

  // Motif inside the shape, clipped so it never spills over the edge.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = e.edge;
  const m = e.motif;
  if (m === 'bar') {
    ctx.fillRect(cx - r, cy - r * 0.22, r * 2, r * 0.44);
  } else if (m === 'stripe') {
    ctx.fillRect(cx - r * 0.22, cy - r, r * 0.44, r * 2);
  } else if (m === 'cross') {
    ctx.fillRect(cx - r, cy - r * 0.16, r * 2, r * 0.32);
    ctx.fillRect(cx - r * 0.16, cy - r, r * 0.32, r * 2);
  } else if (m === 'chevron') {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r * 0.15);
    ctx.lineTo(cx, cy - r * 0.35);
    ctx.lineTo(cx + r, cy + r * 0.15);
    ctx.lineTo(cx + r, cy + r * 0.55);
    ctx.lineTo(cx, cy + r * 0.05);
    ctx.lineTo(cx - r, cy + r * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Edge. Field paint has no raised edge, so the flat variant skips it.
  if (!flat) {
    path(ctx, e.shape, cx, cy, r);
    ctx.lineWidth = Math.max(1, Math.round(r * 0.14));
    ctx.strokeStyle = e.edge;
    ctx.stroke();
  }

  pixelText(ctx, e.glyph, cx, cy + r * 0.04, r * 1.05, e.ink);
  ctx.restore();
}

function path(ctx: CanvasRenderingContext2D, shape: Emblem['shape'], cx: number, cy: number, r: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.44;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'hex': {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'banner':
      ctx.moveTo(cx - r, cy - r * 0.85);
      ctx.lineTo(cx + r, cy - r * 0.85);
      ctx.lineTo(cx + r, cy + r * 0.5);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy + r * 0.5);
      ctx.closePath();
      break;
    case 'shield':
    default:
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.25);
      ctx.quadraticCurveTo(cx + r * 0.9, cy + r * 0.85, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.9, cy + r * 0.85, cx - r, cy + r * 0.25);
      ctx.closePath();
      break;
  }
}
