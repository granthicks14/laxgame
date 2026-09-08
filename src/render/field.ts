import { FIELD, attackingGoal } from '../data/constants';
import type { GameTeam, HomeField } from '../data/teams';
import { emblemFor } from '../data/emblems';
import { stadiumFor, type StadiumConfig } from '../data/stadiums';
import { FIELD_MARGIN } from './camera';

/** Yards from the sideline to the front row of the stands. */
const STAND_INNER = 4.6;
import { drawEmblem, pixelText } from './emblem';
import type { Weather } from './weather';

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
  /** Multiplies the light on the pitch: dusk and rain darken the turf. */
  light: number;
  /** Stadium lights on: pools of light on the grass, lit towers. */
  lights: boolean;
}

/** Scales a hex colour's brightness. Used to relight the whole palette at once. */
function relight(hex: string, mul: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * mul)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * mul)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * mul)));
  return `rgb(${r},${g},${b})`;
}

export function venueTheme(field: HomeField, weather?: Weather | null): VenueTheme {
  const light = weather?.light ?? 1;
  const base: VenueTheme = {
    grassA: relight('#3d9a55', light),
    grassB: relight('#328a49', light),
    line: relight('#f4f8f4', Math.min(1, light + 0.06)),
    crease: relight('#b6d9c1', light),
    surround: relight('#20402c', light),
    track: relight('#8b5340', light),
    stand: relight('#2b3140', light),
    standDark: relight('#1d2230', light),
    tint: weather?.tint ?? null,
    tintAlpha: weather?.alpha ?? 0,
    crowdDensity: field.crowd,
    light,
    lights: weather?.lights ?? field.time !== 'day',
  };
  return base;
}

/** Pre-renders the pitch, its surround, the stands and every piece of branding
 *  once, so a frame costs one blit. Rebuilt only when the scale or venue
 *  changes — never per frame. */
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

  build(ppy: number, theme: VenueTheme, home: GameTeam, away: GameTeam, seed: number): void {
    const key = `${ppy.toFixed(2)}|${theme.grassA}|${theme.tint}|${theme.light.toFixed(2)}|${home.id}|${away.id}`;
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

    const stadium = stadiumFor(home);
    const ox = this.originX;
    const oy = this.originY;
    const X = (yd: number) => ox + yd * ppy;
    const Y = (yd: number) => oy + yd * ppy;
    const px = Math.max(1, Math.round(ppy / 3.6));
    const rnd = makeRng(seed);

    drawGround(ctx, w, h, theme, stadium);
    drawStands(ctx, w, h, ppy, theme, stadium, home, away, rnd);
    drawScoreboard(ctx, X, Y, ppy, theme, stadium, home, away);
    drawTrack(ctx, X, Y, ppy, theme, stadium);
    drawTurf(ctx, X, Y, ppy, theme);
    drawBranding(ctx, X, Y, ppy, theme, stadium, home, away);
    drawMarkings(ctx, X, Y, ppy, px, theme);
    drawSidelineFurniture(ctx, X, Y, ppy, theme, home, away);
    if (theme.lights) drawLightPools(ctx, X, Y, ppy);

    if (theme.tint) {
      ctx.globalAlpha = theme.tintAlpha;
      ctx.fillStyle = theme.tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}

type Proj = (yd: number) => number;

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ ground */

function drawGround(
  ctx: CanvasRenderingContext2D, w: number, h: number, theme: VenueTheme, st: StadiumConfig,
): void {
  ctx.fillStyle = theme.surround;
  ctx.fillRect(0, 0, w, h);
  // Club complexes and school fields sit on scrub and asphalt rather than a
  // manicured stadium apron, which is most of what tells them apart at a glance.
  if (st.style === 'complex' || st.style === 'bleachers') {
    ctx.fillStyle = relight(st.style === 'complex' ? '#4a4f45' : '#3a4a34', theme.light);
    ctx.fillRect(0, 0, w, h);
  }
}

/* ------------------------------------------------------------------ stands */

function drawStands(
  ctx: CanvasRenderingContext2D, w: number, h: number, ppy: number,
  theme: VenueTheme, st: StadiumConfig, home: GameTeam, away: GameTeam, rnd: () => number,
): void {
  // Stands are anchored a fixed distance off each sideline and grow outward, so
  // the front rows are in shot whenever play reaches a boundary. Bigger venues
  // are deeper, not further away.
  const inner = STAND_INNER * ppy;
  const maxDepth = (FIELD_MARGIN - STAND_INNER) * ppy;
  const homeDepth = Math.round(maxDepth * st.homeDepth);
  const awayDepth = Math.round(maxDepth * st.awayDepth);
  const homeTop = Math.round(h - inner - homeDepth);
  const awayBottom = Math.round(inner + awayDepth);

  // The main stand sits behind the benches and the scorer's table, the way a
  // school's home side does; the visitors' bleachers face it across the field.
  stand(ctx, 0, Math.round(inner), w, awayDepth, theme, st, away, false, rnd, ppy);
  stand(ctx, 0, homeTop, w, homeDepth, theme, st, home, true, rnd, ppy);

  if (st.pressBox) {
    const bw = Math.round(w * 0.26);
    const bh = Math.max(3, Math.round(ppy * 1.5));
    const bx = Math.round(w / 2 - bw / 2);
    const by = awayBottom;
    ctx.fillStyle = relight('#3b4354', theme.light);
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = relight('#151a24', theme.light);
    ctx.fillRect(bx + 2, by + 1, bw - 4, Math.max(1, Math.round(bh * 0.45)));
    ctx.fillStyle = home.primary;
    ctx.fillRect(bx, by + bh - 1, bw, 1);
    if (bw > ppy * 8) {
      pixelText(ctx, st.name.toUpperCase(), bx + bw / 2, by + bh * 0.74, ppy * 0.62, '#e7ecf4');
    }
  }

  if (st.lightTowers) {
    for (const cx of [w * 0.16, w * 0.84]) {
      for (const cy of [awayBottom, homeTop + homeDepth]) {
        lightTower(ctx, Math.round(cx), Math.round(cy), ppy, theme);
      }
    }
  }

  if (st.treeLine) {
    const top = Math.round(inner * 0.4);
    for (let i = 0; i < Math.round(w / (ppy * 2.2)); i++) {
      const x = Math.round(i * ppy * 2.2 + rnd() * ppy);
      const r = ppy * (0.9 + rnd() * 0.7);
      ctx.fillStyle = relight(rnd() < 0.5 ? '#22401f' : '#2c4a26', theme.light);
      ctx.beginPath();
      ctx.arc(x, top + r * 0.2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function stand(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, depth: number,
  theme: VenueTheme, st: StadiumConfig, team: GameTeam, isHome: boolean,
  rnd: () => number, ppy: number,
): void {
  if (depth <= 2) return;
  ctx.fillStyle = theme.stand;
  ctx.fillRect(x, y, w, depth);

  // Rows. Bleachers get open gaps between planks; permanent stands are solid
  // with a step shadow on every row.
  const rows = Math.max(3, Math.round(depth / Math.max(2, ppy * 0.55)));
  const rowH = depth / rows;
  for (let i = 0; i < rows; i++) {
    const ry = Math.round(y + i * rowH);
    ctx.fillStyle = i % 2 === 0 ? theme.standDark : theme.stand;
    ctx.fillRect(x, ry, w, Math.max(1, Math.round(rowH)));
  }

  // Aisles break the block up and read as real seating.
  const aisles = st.style === 'bowl' ? 6 : 3;
  ctx.fillStyle = relight('#4a5162', theme.light);
  for (let i = 1; i < aisles; i++) {
    ctx.fillRect(Math.round(x + (w * i) / aisles), y, Math.max(1, Math.round(ppy * 0.18)), depth);
  }

  crowd(ctx, x, y, w, depth, theme, team, rnd, ppy);

  // Front rail, in the home team's colours on the home side.
  ctx.fillStyle = isHome ? team.primary : relight('#5b6376', theme.light);
  const railY = isHome ? y : y + depth - Math.max(1, Math.round(ppy * 0.22));
  ctx.fillRect(x, railY, w, Math.max(1, Math.round(ppy * 0.22)));

  if (st.banners) {
    const count = Math.max(2, Math.round(w / (ppy * 16)));
    for (let i = 0; i < count; i++) {
      const bw = Math.round(ppy * 5.2);
      const bh = Math.max(2, Math.round(ppy * 0.9));
      const bx = Math.round(x + (w * (i + 0.5)) / count - bw / 2);
      const by = isHome ? y + Math.round(ppy * 0.3) : y + depth - bh - Math.round(ppy * 0.3);
      ctx.fillStyle = i % 2 === 0 ? team.primary : team.secondary;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = i % 2 === 0 ? team.secondary : team.primary;
      ctx.fillRect(bx, by, bw, 1);
      if (bw > ppy * 4 && isHome) {
        pixelText(ctx, team.abbr, bx + bw / 2, by + bh / 2, bh * 0.95, team.trim);
      }
    }
  }
}

function crowd(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, depth: number,
  theme: VenueTheme, team: GameTeam, rnd: () => number, ppy: number,
): void {
  const size = Math.max(1, Math.round(ppy * 0.22));
  const cols = Math.floor(w / (size * 2));
  const rows = Math.floor(depth / (size * 2));
  // Supporters cluster in team colours near the middle and thin out at the ends.
  const palette = [team.primary, team.secondary, '#d8d8d8', '#8b8f9a', '#31363f', '#c9c3b6'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const centreBias = 1 - Math.abs(c / cols - 0.5) * 1.5;
      if (rnd() > theme.crowdDensity * (0.45 + centreBias * 0.7)) continue;
      const teamish = rnd() < 0.34 + centreBias * 0.3;
      ctx.fillStyle = teamish
        ? (rnd() < 0.6 ? team.primary : team.secondary)
        : palette[Math.floor(rnd() * palette.length)];
      ctx.fillRect(x + c * size * 2 + size / 2, y + r * size * 2 + size / 2, size, size);
    }
  }
}

function lightTower(
  ctx: CanvasRenderingContext2D, x: number, y: number, ppy: number, theme: VenueTheme,
): void {
  const poleH = Math.round(ppy * 3.4);
  const poleW = Math.max(1, Math.round(ppy * 0.22));
  ctx.fillStyle = relight('#565e6c', theme.light);
  ctx.fillRect(x - poleW / 2, y - poleH, poleW, poleH);
  const bankW = Math.round(ppy * 1.7);
  const bankH = Math.max(2, Math.round(ppy * 0.6));
  ctx.fillStyle = relight('#6c7583', theme.light);
  ctx.fillRect(x - bankW / 2, y - poleH - bankH, bankW, bankH);
  if (theme.lights) {
    ctx.fillStyle = '#fff6cf';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(Math.round(x - bankW / 2 + 1 + i * (bankW / 4)), y - poleH - bankH + 1, Math.max(1, Math.round(bankW / 6)), Math.max(1, bankH - 2));
    }
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(x, y - poleH, ppy * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* -------------------------------------------------------------- scoreboard */

function drawScoreboard(
  ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number,
  theme: VenueTheme, st: StadiumConfig, home: GameTeam, away: GameTeam,
): void {
  if (st.scoreboard === 'none') return;
  const big = st.scoreboard === 'big';
  const w = ppy * (big ? 20 : 13);
  const hgt = ppy * (big ? 7.5 : 5);
  const cx = st.scoreboardEnd === 'home' ? X(-7.5) : X(FIELD.length + 7.5);
  const cy = Y(FIELD.centerY);
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - hgt / 2);

  // Support legs
  ctx.fillStyle = relight('#4a5162', theme.light);
  ctx.fillRect(Math.round(cx - w * 0.34), y, Math.max(1, Math.round(ppy * 0.3)), Math.round(hgt));
  ctx.fillRect(Math.round(cx + w * 0.34), y, Math.max(1, Math.round(ppy * 0.3)), Math.round(hgt));

  ctx.fillStyle = relight('#12161e', theme.light);
  ctx.fillRect(x, y, Math.round(w), Math.round(hgt));
  ctx.strokeStyle = home.primary;
  ctx.lineWidth = Math.max(1, Math.round(ppy * 0.22));
  ctx.strokeRect(x + 0.5, y + 0.5, Math.round(w) - 1, Math.round(hgt) - 1);

  // Header band carries the venue's own branding.
  ctx.fillStyle = home.primary;
  ctx.fillRect(x, y, Math.round(w), Math.round(hgt * 0.3));
  pixelText(ctx, st.name.toUpperCase(), cx, y + hgt * 0.16, hgt * 0.2, home.trim);

  // HOME / GUEST rows with the two marks.
  const rowY = y + hgt * 0.62;
  drawEmblem(ctx, emblemFor(home), x + w * 0.16, rowY, hgt * 0.2);
  drawEmblem(ctx, emblemFor(away), x + w * 0.62, rowY, hgt * 0.2);
  pixelText(ctx, home.abbr, x + w * 0.3, rowY, hgt * 0.24, '#ffd34d', 'left');
  pixelText(ctx, away.abbr, x + w * 0.76, rowY, hgt * 0.24, '#ffd34d', 'left');
  pixelText(ctx, 'HOME', x + w * 0.16, y + hgt * 0.92, hgt * 0.13, '#8d98a8');
  pixelText(ctx, 'GUEST', x + w * 0.62, y + hgt * 0.92, hgt * 0.13, '#8d98a8');
}

/* --------------------------------------------------------------- surface */

function drawTrack(
  ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number, theme: VenueTheme, st: StadiumConfig,
): void {
  const pad = STAND_INNER - 0.4;
  ctx.fillStyle = st.style === 'bowl' || st.style === 'grandstand'
    ? theme.track
    : relight('#4f5a44', theme.light);
  ctx.fillRect(X(-pad), Y(-pad), (FIELD.length + pad * 2) * ppy, (FIELD.width + pad * 2) * ppy);
  if (st.fence) {
    ctx.strokeStyle = relight('#71798a', theme.light);
    ctx.lineWidth = 1;
    ctx.strokeRect(X(-pad) + 0.5, Y(-pad) + 0.5, (FIELD.length + pad * 2) * ppy - 1, (FIELD.width + pad * 2) * ppy - 1);
  }
}

function drawTurf(
  ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number, theme: VenueTheme,
): void {
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
  const apron = 2.2;
  ctx.fillRect(X(-apron), Y(-apron), (FIELD.length + apron * 2) * ppy, apron * ppy);
  ctx.fillRect(X(-apron), Y(FIELD.width), (FIELD.length + apron * 2) * ppy, apron * ppy);
  ctx.fillRect(X(-apron), Y(0), apron * ppy, FIELD.width * ppy);
  ctx.fillRect(X(FIELD.length), Y(0), apron * ppy, FIELD.width * ppy);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(X(0), Y(0), FIELD.length * ppy, Math.max(1, ppy * 0.9));
  ctx.fillRect(X(0), Y(FIELD.width - 0.9), FIELD.length * ppy, Math.max(1, ppy * 0.9));
}

/* -------------------------------------------------------------- branding */

function drawBranding(
  ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number,
  theme: VenueTheme, st: StadiumConfig, home: GameTeam, away: GameTeam,
): void {
  // Painted end zones in each end's colours, with the programme name across
  // the home end — the clearest "whose field is this" cue on the pitch.
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = home.primary;
  ctx.fillRect(X(0.4), Y(FIELD.centerY - 11), 10 * ppy, 22 * ppy);
  ctx.fillStyle = away.primary;
  ctx.fillRect(X(FIELD.length - 10.4), Y(FIELD.centerY - 11), 10 * ppy, 22 * ppy);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = theme.line;
  const px = Math.max(1, Math.round(ppy / 3.6));
  ctx.fillRect(X(0.4), Y(FIELD.centerY - 11), 10 * ppy, px);
  ctx.fillRect(X(0.4), Y(FIELD.centerY + 11), 10 * ppy, px);
  ctx.fillRect(X(FIELD.length - 10.4), Y(FIELD.centerY - 11), 10 * ppy, px);
  ctx.fillRect(X(FIELD.length - 10.4), Y(FIELD.centerY + 11), 10 * ppy, px);
  ctx.restore();

  if (st.endzoneText) {
    // Painted across the end zone, scaled to fit between the crease and the
    // end line so a long programme name never bleeds onto the field of play.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(X(5.4), Y(FIELD.centerY));
    ctx.rotate(-Math.PI / 2);
    const text = home.short.toUpperCase();
    const size = Math.min(ppy * 2.6, (ppy * 20) / Math.max(4, text.length * 0.62));
    pixelText(ctx, text, 0, 0, size, theme.line);
    ctx.restore();
  }

  if (st.midfieldLogo) {
    // Field paint: flat, low contrast, and small enough that play always reads
    // over the top of it.
    drawEmblem(ctx, emblemFor(home), X(FIELD.centerX), Y(FIELD.centerY), ppy * 4.2, 0.15, true);
  }
}

/* -------------------------------------------------------------- markings */

function drawMarkings(
  ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number, px: number, theme: VenueTheme,
): void {
  ctx.fillStyle = theme.line;
  const rect = (x: number, y: number, ww: number, hh: number, weight = 1) =>
    ctx.fillRect(
      Math.round(X(x)), Math.round(Y(y)),
      Math.max(px * weight, Math.round(ww * ppy)), Math.max(px * weight, Math.round(hh * ppy)),
    );

  // Boundary: sidelines and end lines are painted heavier than inside lines.
  rect(0, 0, FIELD.length, 0.001, 1.6);
  rect(0, FIELD.width, FIELD.length, 0.001, 1.6);
  rect(0, 0, 0.001, FIELD.width, 1.6);
  rect(FIELD.length, 0, 0.001, FIELD.width, 1.6);

  // Midfield line, then the restraining lines that box in the offensive halves.
  rect(FIELD.centerX, 0, 0.001, FIELD.width, 1.4);
  rect(FIELD.restrainHome, 0, 0.001, FIELD.width);
  rect(FIELD.restrainAway, 0, 0.001, FIELD.width);

  // Wing lines either side of the faceoff.
  rect(FIELD.centerX - 10, FIELD.wingOffset, 20, 0.001);
  rect(FIELD.centerX - 10, FIELD.width - FIELD.wingOffset, 20, 0.001);

  // Faceoff X at the centre.
  rect(FIELD.centerX - 1, FIELD.centerY, 2, 0.001);
  rect(FIELD.centerX, FIELD.centerY - 1, 0.001, 2);

  // Sideline ticks every five yards give the eye a sense of distance.
  for (let x = 5; x < FIELD.length; x += 5) {
    const long = x % 10 === 0;
    rect(x, 0, 0.001, long ? 1.6 : 1);
    rect(x, FIELD.width - (long ? 1.6 : 1), 0.001, long ? 1.6 : 1);
  }

  // Substitution box and the two coaches' boxes flanking it, on the bench side.
  // These are painted on the surround, so they are chalk rather than field line.
  ctx.globalAlpha = 0.55;
  rect(FIELD.centerX - 5, -1.6, 10, 0.001);
  rect(FIELD.centerX - 5, -1.6, 0.001, 1.6);
  rect(FIELD.centerX + 5, -1.6, 0.001, 1.6);
  rect(FIELD.centerX - 25, -3.2, 0.001, 3.2);
  rect(FIELD.centerX + 25, -3.2, 0.001, 3.2);
  rect(FIELD.centerX - 25, -3.2, 20, 0.001);
  rect(FIELD.centerX + 5, -3.2, 20, 0.001);
  ctx.globalAlpha = 1;

  // Creases, goal lines and the goal-line extended stubs behind each cage.
  for (const side of ['home', 'away'] as const) {
    const goal = attackingGoal(side === 'home' ? 'away' : 'home');
    ctx.beginPath();
    ctx.fillStyle = theme.crease;
    ctx.globalAlpha = 0.4;
    ctx.arc(X(goal.x), Y(goal.y), FIELD.creaseRadius * ppy, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = Math.max(1, px);
    ctx.arc(X(goal.x), Y(goal.y), FIELD.creaseRadius * ppy, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = theme.line;
    ctx.fillRect(
      Math.round(X(goal.x)) - Math.floor(px / 2),
      Math.round(Y(goal.y - FIELD.creaseRadius)),
      px,
      Math.round(FIELD.creaseRadius * 2 * ppy),
    );
    // Goal line extended, out to the sidelines, as a thin broken line.
    for (let y = 2; y < FIELD.width; y += 4) {
      if (Math.abs(y - goal.y) < FIELD.creaseRadius) continue;
      ctx.fillRect(Math.round(X(goal.x)) - Math.floor(px / 2), Math.round(Y(y)), px, Math.round(ppy * 1.2));
    }
  }
}

/* ------------------------------------------------------- bench furniture */

function drawSidelineFurniture(
  ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number,
  theme: VenueTheme, home: GameTeam, away: GameTeam,
): void {
  // Team areas sit either side of the substitution box on the bench side, home
  // to the right of the box and visitors to the left, as they do in real games.
  bench(ctx, X(FIELD.centerX + 6), Y(-2.6), ppy * 18, ppy * 2.0, home, theme, 'HOME');
  bench(ctx, X(FIELD.centerX - 24), Y(-2.6), ppy * 18, ppy * 2.0, away, theme, 'VISITOR');

  // Scorer's table between the two boxes.
  const tw = ppy * 8;
  const th = ppy * 1.4;
  const ty = Y(-4.3);
  ctx.fillStyle = relight('#3a4150', theme.light);
  ctx.fillRect(Math.round(X(FIELD.centerX) - tw / 2), Math.round(ty), Math.round(tw), Math.round(th));
  ctx.fillStyle = relight('#e2e7ef', theme.light);
  ctx.fillRect(Math.round(X(FIELD.centerX) - tw / 2), Math.round(ty), Math.round(tw), 1);
  pixelText(ctx, 'TABLE', X(FIELD.centerX), ty + th * 0.6, th * 0.72, '#c9d2e0');
}

function bench(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  team: GameTeam, theme: VenueTheme, label: string,
): void {
  const rx = Math.round(x);
  const ry = Math.round(y - h);
  const rw = Math.round(w);
  const rh = Math.round(h);
  // Bench slab in the team's colour, with a row of seated figures on it.
  ctx.fillStyle = relight('#2a2f3a', theme.light);
  ctx.fillRect(rx, ry, rw, rh);
  ctx.fillStyle = team.primary;
  ctx.fillRect(rx, ry, rw, Math.max(1, Math.round(rh * 0.22)));
  const seat = Math.max(1, Math.round(rh * 0.3));
  for (let i = 0; i * seat * 2 < rw - seat; i++) {
    ctx.fillStyle = i % 3 === 0 ? team.secondary : team.primary;
    ctx.fillRect(rx + 2 + i * seat * 2, ry + Math.round(rh * 0.4), seat, seat);
  }
  if (rw > seat * 14) {
    pixelText(ctx, label, rx + rw / 2, ry + Math.round(rh * 0.11), Math.max(3, rh * 0.24), team.trim);
  }
}

/* ------------------------------------------------------------ night light */

function drawLightPools(ctx: CanvasRenderingContext2D, X: Proj, Y: Proj, ppy: number): void {
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = '#fff4d0';
  for (const fx of [0.25, 0.75]) {
    ctx.beginPath();
    ctx.ellipse(X(FIELD.length * fx), Y(FIELD.centerY), ppy * 30, ppy * 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
