import { FIELD, type Side } from './field';
import type { FieldCamera } from './camera';
import type { Team } from './data';

/* ---------------------------------------------------------------------------
 * THE STADIUM
 * ---------------------------------------------------------------------------
 * Everything that does not move: the turf and its mowing, a hundred yards of
 * markings, two end zones wearing somebody's colours, the posts, the benches and
 * a bowl of people around the whole thing.
 *
 * WHY THE MARKINGS ARE THE PRIORITY. A football field is the only playing
 * surface in this hub that a player reads NUMERICALLY. He is not judging
 * distance by eye the way he does in lacrosse — he is asked "third and seven"
 * and has to know where seven yards is, forty times a game. Every yard line,
 * every hash and every number on this field is load-bearing, and they are drawn
 * before anything decorative gets a single pixel.
 *
 * It is all painted by hand with no assets, like the rest of the hub: a retro
 * game should look drawn rather than photographed, and a canvas that loads
 * nothing starts instantly.
 * ------------------------------------------------------------------------- */

export const TURF = {
  grass: '#1f5a2c',
  grassAlt: '#23652f',
  line: '#e8efe6',
  lineDim: 'rgba(232,239,230,0.42)',
  dirt: '#2a2018',
  bowl: '#161a20',
  bowlLip: '#232935',
} as const;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number): number => Math.round(
    amount >= 1 ? c + (255 - c) * (amount - 1) : c * amount,
  );
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Fill a world-space rectangle, whichever way the camera is facing. */
function worldRect(
  ctx: CanvasRenderingContext2D, cam: FieldCamera,
  x0: number, y0: number, x1: number, y1: number,
): void {
  const ax = cam.projectX(x0, y0);
  const ay = cam.projectY(x0, y0);
  const bx = cam.projectX(x1, y1);
  const by = cam.projectY(x1, y1);
  ctx.fillRect(
    Math.round(Math.min(ax, bx)), Math.round(Math.min(ay, by)),
    Math.max(1, Math.round(Math.abs(bx - ax))), Math.max(1, Math.round(Math.abs(by - ay))),
  );
}

/**
 * THE BOWL.
 *
 * Drawn first and simply: a dark ring of stands with a lit lip, and a crowd
 * suggested by thousands of two-pixel specks rather than drawn as people. The
 * specks are placed from a fixed pseudo-random sequence so the crowd does not
 * boil between frames — a stand that reshuffles every frame is the single most
 * distracting thing a sports game can put on screen.
 */
export function paintBowl(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, w: number, h: number, time: number,
  roar: number,
): void {
  ctx.fillStyle = TURF.bowl;
  ctx.fillRect(0, 0, w, h);

  const left = cam.projectX(0, FIELD.centerX);
  const right = cam.projectX(FIELD.width, FIELD.centerX);
  const x0 = Math.min(left, right);
  const x1 = Math.max(left, right);
  const ppy = cam.ppy;

  // The two banks of stands beyond the sidelines, in rows that climb away.
  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? x0 : x1;
    const outward = side < 0 ? -1 : 1;
    const depth = Math.max(x0, w - x1) + ppy * 6;
    for (let r = 0; r < 12; r++) {
      const t = r / 12;
      const rowX = edge + outward * (ppy * 1.6 + t * depth);
      const rowW = outward * Math.max(2, (depth / 12) * 1.08);
      ctx.fillStyle = shade(TURF.bowlLip, 0.92 - t * 0.42);
      ctx.fillRect(
        Math.round(Math.min(rowX, rowX + rowW)), 0,
        Math.max(1, Math.round(Math.abs(rowW))), h,
      );
    }
  }

  /* THE CROWD. A hash of the seat's own coordinates, so every speck is in the
   * same seat on every frame and the stand stops shimmering. The roar only
   * changes how many of them are standing up. */
  const step = Math.max(3, Math.round(ppy * 0.55));
  const lively = 0.22 + roar * 0.5;
  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? x0 : x1;
    const outward = side < 0 ? -1 : 1;
    const depth = Math.max(x0, w - x1) + ppy * 6;
    for (let px = ppy * 2; px < depth; px += step) {
      for (let py = 0; py < h; py += step) {
        const seat = ((px * 73856093) ^ (py * 19349663)) >>> 0;
        const rand = ((seat % 1000) / 1000);
        if (rand > 0.82) continue;
        const sx = edge + outward * px;
        if (sx < -2 || sx > w + 2) continue;
        const up = rand < lively;
        const bob = up ? Math.sin(time * 5 + rand * 30) * 1.2 : 0;
        const tone = 0.35 + rand * 0.5;
        ctx.fillStyle = `rgba(${Math.round(190 * tone)},${Math.round(180 * tone)},${Math.round(200 * tone)},${0.5 + rand * 0.4})`;
        ctx.fillRect(Math.round(sx), Math.round(py + bob), 2, 2);
      }
    }
  }
}

/**
 * THE FIELD ITSELF.
 *
 * Mowing stripes first, then a hundred yards of paint. The stripes run across
 * the field in five-yard bands because that is how a groundsman cuts them, and
 * they do a second job for free: they give the eye something to measure distance
 * against when the camera is moving.
 */
export function paintField(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, home: Team, away: Team,
): void {
  // Turf, in mown bands.
  for (let y = 0; y < FIELD.length; y += 5) {
    ctx.fillStyle = (y / 5) % 2 === 0 ? TURF.grass : TURF.grassAlt;
    worldRect(ctx, cam, -1.5, y, FIELD.width + 1.5, Math.min(FIELD.length, y + 5));
  }

  // The apron outside the sidelines, where the benches are.
  ctx.fillStyle = TURF.dirt;
  worldRect(ctx, cam, -4.5, 0, 0, FIELD.length);
  worldRect(ctx, cam, FIELD.width, 0, FIELD.width + 4.5, FIELD.length);

  paintEndZone(ctx, cam, 'home', home);
  paintEndZone(ctx, cam, 'away', away);

  const px = cam.ppy;
  const thin = Math.max(1, Math.round(px * 0.1));
  const thick = Math.max(1, Math.round(px * 0.18));

  /* EVERY YARD FROM ONE GOAL LINE TO THE OTHER.
   *
   * The short ticks at each single yard are not decoration — they are how a
   * player eyeballs "and three" without counting five-yard lines, and a field
   * with only the fives on it reads as a diagram rather than as a field. */
  ctx.fillStyle = TURF.lineDim;
  for (let y = FIELD.homeGoal + 1; y < FIELD.awayGoal; y++) {
    if (y % 5 === 0) continue;
    for (const hx of [FIELD.hashLeft, FIELD.hashRight]) {
      worldRect(ctx, cam, hx - 0.35, y - 0.06, hx + 0.35, y + 0.06);
    }
    worldRect(ctx, cam, 0.4, y - 0.05, 1.5, y + 0.05);
    worldRect(ctx, cam, FIELD.width - 1.5, y - 0.05, FIELD.width - 0.4, y + 0.05);
  }

  // The fives, all the way across.
  ctx.fillStyle = TURF.line;
  for (let y = FIELD.homeGoal; y <= FIELD.awayGoal; y += 5) {
    const w = y % 10 === 0 ? thick : thin;
    const half = (w / px) / 2;
    worldRect(ctx, cam, 0, y - half, FIELD.width, y + half);
  }

  // Goal lines, heavier than anything else on the field.
  const goalW = (Math.max(2, Math.round(px * 0.3)) / px) / 2;
  for (const y of [FIELD.homeGoal, FIELD.awayGoal]) {
    worldRect(ctx, cam, 0, y - goalW, FIELD.width, y + goalW);
  }
  // Sidelines.
  worldRect(ctx, cam, -0.5, FIELD.homeGoal - 10, 0, FIELD.awayGoal + 10);
  worldRect(ctx, cam, FIELD.width, FIELD.homeGoal - 10, FIELD.width + 0.5, FIELD.awayGoal + 10);

  paintNumbers(ctx, cam);
  paintPosts(ctx, cam, 'home');
  paintPosts(ctx, cam, 'away');
}

/** A team's end zone, in that team's colours, with its name across it. */
function paintEndZone(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, side: Side, team: Team,
): void {
  const y0 = side === 'home' ? 0 : FIELD.awayGoal;
  const y1 = side === 'home' ? FIELD.homeGoal : FIELD.length;
  ctx.fillStyle = team.primary;
  worldRect(ctx, cam, 0, y0, FIELD.width, y1);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let y = y0; y < y1; y += 2.5) {
    if (((y - y0) / 2.5) % 2 === 0) continue;
    worldRect(ctx, cam, 0, y, FIELD.width, y + 2.5);
  }
  ctx.globalAlpha = 1;

  /* THE WORDMARK.
   *
   * Rotated to lie along the field the way a real end zone is painted, and
   * counter-rotated against the camera's mirror so it reads the right way up
   * from wherever the coach is standing. A club name printed upside down in its
   * own end zone is the kind of detail whose absence is invisible and whose
   * presence is the difference between a field and a rectangle.
   */
  const cx = cam.projectX(FIELD.centerX, (y0 + y1) / 2);
  const cy = cam.projectY(FIELD.centerX, (y0 + y1) / 2);
  const px = cam.ppy;
  if (px < 3.2) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = team.secondary;
  ctx.globalAlpha = 0.9;
  ctx.font = `bold ${Math.round(px * 4.4)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = team.name.toUpperCase();
  const maxW = FIELD.width * px * 0.86;
  const m = ctx.measureText(text);
  if (m.width > maxW) ctx.scale(maxW / m.width, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * THE NUMBERS, and they count the way a real field counts — up to fifty from
 * each end and back down again, so the same "30" appears twice and tells a
 * player which forty he is on only in combination with which way he is facing.
 */
function paintNumbers(ctx: CanvasRenderingContext2D, cam: FieldCamera): void {
  const px = cam.ppy;
  if (px < 4) return;
  ctx.fillStyle = TURF.line;
  ctx.globalAlpha = 0.85;
  ctx.font = `bold ${Math.round(px * 2.2)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let yard = 10; yard <= 90; yard += 10) {
    const y = FIELD.homeGoal + yard;
    const label = String(yard <= 50 ? yard : 100 - yard);
    for (const x of [8.5, FIELD.width - 8.5]) {
      const sx = cam.projectX(x, y);
      const sy = cam.projectY(x, y);
      ctx.save();
      ctx.translate(sx, sy);
      // Numbers on a real field face the nearest sideline.
      ctx.rotate(x < FIELD.centerX ? Math.PI / 2 : -Math.PI / 2);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** The uprights, standing on the end line and drawn as seen from above and behind. */
function paintPosts(ctx: CanvasRenderingContext2D, cam: FieldCamera, side: Side): void {
  const y = side === 'home' ? 0.6 : FIELD.length - 0.6;
  const px = cam.ppy;
  const half = FIELD.postWidth / 2;
  ctx.fillStyle = '#f2c531';
  // The crossbar, and the two uprights running back away from the field.
  worldRect(ctx, cam, FIELD.centerX - half, y - 0.16, FIELD.centerX + half, y + 0.16);
  const depth = side === 'home' ? -2.6 : 2.6;
  for (const x of [FIELD.centerX - half, FIELD.centerX + half]) {
    worldRect(ctx, cam, x - 0.16, y, x + 0.16, y + depth);
  }
  // The gooseneck down to the base.
  worldRect(ctx, cam, FIELD.centerX - 0.16, y, FIELD.centerX + 0.16, y + depth * 1.3);
  void px;
}

/**
 * THE TWO LINES THAT MATTER MOST, and they are drawn last, over everything.
 *
 * Nothing else on the screen tells a player where the ball is and where it has
 * to get to. They are the television lines rather than real paint — no such
 * lines exist on a real field — and this game keeps them for exactly the reason
 * television invented them: without the yellow line, a player cannot tell
 * whether the run he just made was a first down.
 */
export function paintDownLines(
  ctx: CanvasRenderingContext2D, cam: FieldCamera,
  los: number, firstDown: number, showFirst: boolean,
): void {
  const px = cam.ppy;
  const w = (Math.max(2, Math.round(px * 0.26)) / px) / 2;

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#3f7fe8';
  worldRect(ctx, cam, -0.5, los - w, FIELD.width + 0.5, los + w);

  if (showFirst && firstDown > FIELD.homeGoal && firstDown < FIELD.awayGoal) {
    ctx.fillStyle = '#f5d312';
    worldRect(ctx, cam, -0.5, firstDown - w, FIELD.width + 0.5, firstDown + w);
  }
  ctx.globalAlpha = 1;
}

/** The chain crew and the down marker, on the near sideline. */
export function paintSideline(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, los: number, down: number,
): void {
  const px = cam.ppy;
  if (px < 5) return;
  const x = FIELD.width + 2.2;
  const sx = cam.projectX(x, los);
  const sy = cam.projectY(x, los);
  ctx.fillStyle = '#f5a623';
  ctx.fillRect(Math.round(sx - px * 0.28), Math.round(sy - px * 1.5),
    Math.max(2, Math.round(px * 0.56)), Math.max(2, Math.round(px * 1.5)));
  ctx.fillStyle = '#1a1208';
  ctx.font = `bold ${Math.round(px * 0.9)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.min(4, down)), Math.round(sx), Math.round(sy - px * 0.75));
}
