import { FIELD, attackingGoal } from '../data/constants';
import type { HomeField, TeamData } from '../data/teams';
import { FIELD_MARGIN } from './camera';

export interface VenueTheme {
  grassA: string;
  grassB: string;
  line: string;
  crease: string;
  surround: string;
  track: string;
  stand: string;
  standDark: string;
  /** Full-screen tint applied after the world is drawn. */
  tint: string | null;
  tintAlpha: number;
  crowdDensity: number;
}

export function venueTheme(field: HomeField): VenueTheme {
  const base: VenueTheme = {
    grassA: '#3d9a55',
    grassB: '#328a49',
    line: '#f4f8f4',
    crease: '#b6d9c1',
    surround: '#20402c',
    track: '#8b5340',
    stand: '#2b3140',
    standDark: '#1d2230',
    tint: null,
    tintAlpha: 0,
    crowdDensity: field.crowd,
  };
  if (field.time === 'evening') {
    return {
      ...base,
      grassA: '#3a8f50', grassB: '#2f8045', crease: '#a9cfb5',
      tint: '#ff9a4d', tintAlpha: 0.12,
    };
  }
  if (field.time === 'night') {
    return {
      ...base,
      grassA: '#2f7a44', grassB: '#276b3b', crease: '#89b498',
      surround: '#152a1d', track: '#6b4030', stand: '#1b2029', standDark: '#12161d',
      tint: '#0d2044', tintAlpha: 0.2,
    };
  }
  return base;
}

/** Pre-renders the entire pitch, surround and stands once so each frame is one blit. */
export class FieldLayer {
  canvas: HTMLCanvasElement;
  ppy = 0;
  private key = '';

  constructor() {
    this.canvas = document.createElement('canvas');
  }

  get originX(): number {
    return FIELD_MARGIN * this.ppy;
  }
  get originY(): number {
    return FIELD_MARGIN * this.ppy;
  }

  build(ppy: number, theme: VenueTheme, home: TeamData, away: TeamData, seed: number): void {
    const key = `${ppy.toFixed(2)}|${theme.grassA}|${theme.tint}|${home.id}|${away.id}`;
    if (key === this.key) return;
    this.key = key;
    this.ppy = ppy;

    const w = Math.ceil((FIELD.length + FIELD_MARGIN * 2) * ppy);
    const h = Math.ceil((FIELD.width + FIELD_MARGIN * 2) * ppy);
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const ox = this.originX;
    const oy = this.originY;
    const X = (yd: number) => ox + yd * ppy;
    const Y = (yd: number) => oy + yd * ppy;
    const px = Math.max(1, Math.round(ppy / 3.6));

    // --- surround, track, stands
    ctx.fillStyle = theme.surround;
    ctx.fillRect(0, 0, w, h);

    const standDepth = FIELD_MARGIN * 0.62 * ppy;
    ctx.fillStyle = theme.stand;
    ctx.fillRect(0, 0, w, standDepth);
    ctx.fillRect(0, h - standDepth, w, standDepth);
    ctx.fillStyle = theme.standDark;
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      ctx.fillRect(0, Math.round(t * standDepth), w, 1);
      ctx.fillRect(0, Math.round(h - standDepth + t * standDepth), w, 1);
    }
    drawCrowd(ctx, w, standDepth, theme, home, away, seed);

    // Track ring
    ctx.fillStyle = theme.track;
    ctx.fillRect(X(-5.5), Y(-5.5), (FIELD.length + 11) * ppy, (FIELD.width + 11) * ppy);

    // --- grass with mowed stripes running the length of the field
    const stripe = 6.875; // 16 stripes across the 110-yard field
    const gTop = Math.round(Y(0));
    const gBottom = Math.round(Y(FIELD.width));
    for (let i = 0; i * stripe < FIELD.length; i++) {
      ctx.fillStyle = i % 2 === 0 ? theme.grassA : theme.grassB;
      // Round both edges, never the width: rounding the width independently
      // leaves one-pixel seams that show the surround through the turf.
      const x0 = Math.round(X(i * stripe));
      const x1 = Math.round(X(Math.min(FIELD.length, (i + 1) * stripe)));
      ctx.fillRect(x0, gTop, x1 - x0, gBottom - gTop);
    }
    // A darker apron of grass outside the lines so the boundary reads clearly.
    ctx.fillStyle = theme.grassB;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(X(-4.5), Y(-4.5), (FIELD.length + 9) * ppy, 4.5 * ppy);
    ctx.fillRect(X(-4.5), Y(FIELD.width), (FIELD.length + 9) * ppy, 4.5 * ppy);
    ctx.fillRect(X(-4.5), Y(0), 4.5 * ppy, FIELD.width * ppy);
    ctx.fillRect(X(FIELD.length), Y(0), 4.5 * ppy, FIELD.width * ppy);
    ctx.globalAlpha = 1;
    // Shadow just inside the sidelines gives the pitch a little depth.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(X(0), Y(0), FIELD.length * ppy, Math.max(1, ppy * 0.9));
    ctx.fillRect(X(0), Y(FIELD.width - 0.9), FIELD.length * ppy, Math.max(1, ppy * 0.9));

    // --- markings
    ctx.fillStyle = theme.line;
    const rect = (x: number, y: number, ww: number, hh: number) =>
      ctx.fillRect(Math.round(X(x)), Math.round(Y(y)), Math.max(px, Math.round(ww * ppy)), Math.max(px, Math.round(hh * ppy)));

    // Boundary
    rect(0, 0, FIELD.length, 0.001);
    rect(0, FIELD.width, FIELD.length, 0.001);
    rect(0, 0, 0.001, FIELD.width);
    rect(FIELD.length, 0, 0.001, FIELD.width);
    // Center + restraining lines
    rect(FIELD.centerX, 0, 0.001, FIELD.width);
    rect(FIELD.restrainHome, 0, 0.001, FIELD.width);
    rect(FIELD.restrainAway, 0, 0.001, FIELD.width);
    // Wing lines (20 yd long, 10 yd in from each sideline)
    rect(FIELD.centerX - 10, FIELD.wingOffset, 20, 0.001);
    rect(FIELD.centerX - 10, FIELD.width - FIELD.wingOffset, 20, 0.001);
    // Faceoff X
    rect(FIELD.centerX - 1, FIELD.centerY, 2, 0.001);
    rect(FIELD.centerX, FIELD.centerY - 1, 0.001, 2);
    // Substitution box
    rect(FIELD.centerX - 5, -1.6, 10, 0.001);
    rect(FIELD.centerX - 5, -1.6, 0.001, 1.6);
    rect(FIELD.centerX + 5, -1.6, 0.001, 1.6);

    // Creases + goal lines
    for (const side of ['home', 'away'] as const) {
      const goal = attackingGoal(side === 'home' ? 'away' : 'home');
      // Crease fill
      ctx.beginPath();
      ctx.fillStyle = theme.crease;
      ctx.globalAlpha = 0.4;
      ctx.arc(X(goal.x), Y(goal.y), FIELD.creaseRadius * ppy, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Crease outline
      ctx.beginPath();
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = Math.max(1, px);
      ctx.arc(X(goal.x), Y(goal.y), FIELD.creaseRadius * ppy, 0, Math.PI * 2);
      ctx.stroke();
      // Goal line across the crease
      ctx.fillStyle = theme.line;
      ctx.fillRect(
        Math.round(X(goal.x)) - Math.floor(px / 2),
        Math.round(Y(goal.y - FIELD.creaseRadius)),
        px,
        Math.round(FIELD.creaseRadius * 2 * ppy),
      );
    }

    // Midfield mark: a lone star in the home team's colours.
    drawStar(ctx, X(FIELD.centerX), Y(FIELD.centerY), ppy * 5.2, home.primary, 0.3);
    drawStar(ctx, X(FIELD.centerX), Y(FIELD.centerY), ppy * 5.2, '#ffffff', 0.1);

    // Endzone paint behind each cage, in that end's colours.
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = home.primary;
    ctx.fillRect(X(0.4), Y(FIELD.centerY - 11), 10 * ppy, 22 * ppy);
    ctx.fillStyle = away.primary;
    ctx.fillRect(X(FIELD.length - 10.4), Y(FIELD.centerY - 11), 10 * ppy, 22 * ppy);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = theme.line;
    ctx.fillRect(X(0.4), Y(FIELD.centerY - 11), 10 * ppy, px);
    ctx.fillRect(X(0.4), Y(FIELD.centerY + 11), 10 * ppy, px);
    ctx.fillRect(X(FIELD.length - 10.4), Y(FIELD.centerY - 11), 10 * ppy, px);
    ctx.fillRect(X(FIELD.length - 10.4), Y(FIELD.centerY + 11), 10 * ppy, px);
    ctx.restore();

    if (theme.tint) {
      ctx.globalAlpha = theme.tintAlpha;
      ctx.fillStyle = theme.tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}

function drawCrowd(
  ctx: CanvasRenderingContext2D, w: number, depth: number,
  theme: VenueTheme, home: TeamData, away: TeamData, seed: number,
): void {
  const colors = [home.primary, home.secondary, away.primary, '#d8d8d8', '#8b8f9a', '#31363f'];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const count = Math.floor((w * depth) / 190 * (0.35 + theme.crowdDensity));
  const size = Math.max(1, Math.round(depth / 22));
  for (let i = 0; i < count; i++) {
    const top = rnd() < 0.5;
    const x = Math.floor(rnd() * w);
    const y = top
      ? Math.floor(rnd() * (depth - size * 2)) + size
      : Math.floor(w * 0 + (rnd() * (depth - size * 2))) + (ctx.canvas.height - depth) + size;
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(x, y, size, size);
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
