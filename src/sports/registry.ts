import type { ScreenFactory } from '../ui/App';
import type { ControlScheme } from '../state/keybinds';
import type { SoundPack } from '../audio/Audio';

/* ---------------------------------------------------------------------------
 * THE SPORT REGISTRY
 * ---------------------------------------------------------------------------
 * What the hub knows about a sport before that sport has loaded, and how to
 * load it.
 *
 * The split matters for how fast the hub opens. Everything in a MANIFEST — the
 * name, the colours, the blurb, the little painted court on the card — lives in
 * the hub's own bundle and costs a few hundred bytes. Everything that IS the
 * sport lives behind `load()`, a dynamic import Vite turns into a separate
 * chunk: lacrosse's twenty-odd thousand lines of career, recruiting and match
 * engine are not downloaded, parsed or run by a player who opened the hub to
 * play basketball.
 *
 * A sport's module is its three contracts with the shared foundation, and
 * nothing more: the screen its own menu starts at, the controls it declares, and
 * the sounds it makes. Everything else about how it plays is its own business —
 * that is the whole point of the architecture.
 * ------------------------------------------------------------------------- */

export type SportId =
  | 'lacrosse' | 'basketball' | 'football' | 'baseball'
  | 'soccer' | 'hockey' | 'tennis' | 'volleyball';

/** What a sport hands the hub when it loads. */
export interface SportModule {
  /** The sport's own front screen. The hub pushes this and steps back. */
  menu: ScreenFactory;
  controls: ControlScheme;
  sounds: SoundPack;
  /**
   * One-time work the sport needs done before its menu opens: validating its own
   * data, retiring saves it can no longer read. Run once, and never allowed to
   * stop the sport opening — a warning in the console is the right outcome for a
   * check that fails, not a dead screen.
   */
  init?: () => void;
}

/** Accent colours applied as CSS variables while a sport is on screen. */
export interface SportTheme {
  /** The sport's primary accent — buttons, marks, highlights. */
  accent: string;
  /** Ink that reads on top of the accent. */
  accentInk: string;
  /** The playing surface, used by the card art and the sport's backdrop. */
  surface: string;
  /** A second surface tone for lines and shading. */
  surfaceLine: string;
  /** Deep background behind the sport's screens. */
  backdrop: string;
}

/** Paints a sport's surface onto a card. Cheap, no assets, retro by hand. */
export type PreviewPainter = (
  ctx: CanvasRenderingContext2D, w: number, h: number, theme: SportTheme,
) => void;

export interface SportManifest {
  id: SportId;
  /** What the hub calls it. */
  name: string;
  /** The game's own title, shown once the player is inside it. */
  title: string;
  /** One line on the card. */
  tagline: string;
  /** Two or three sentences: what this game actually is. */
  blurb: string;
  /** The modes it really has. Only ever what is built. */
  modes: string[];
  theme: SportTheme;
  preview: PreviewPainter;
  /** A playable sport has a loader. A planned one says so and has none. */
  load?: () => Promise<SportModule>;
  /** For the roadmap strip: what is being built, honestly stated. */
  plannedNote?: string;
}

export const isPlayable = (s: SportManifest): boolean => !!s.load;

/* ------------------------------------------------------------------ artwork */

/** Shared card-art scaffolding: the surface, a border, and a centre line. */
function surface(
  ctx: CanvasRenderingContext2D, w: number, h: number, theme: SportTheme,
  inset = 6,
): { x: number; y: number; w: number; h: number } {
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, w, h);
  const r = { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 };
  ctx.strokeStyle = theme.surfaceLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  return r;
}

const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void => {
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
};

const circle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
};

const lacrossePreview: PreviewPainter = (ctx, w, h, theme) => {
  const r = surface(ctx, w, h, theme);
  const cx = r.x + r.w / 2;
  line(ctx, cx, r.y, cx, r.y + r.h);
  circle(ctx, cx, r.y + r.h / 2, Math.min(r.w, r.h) * 0.1);
  // Restraining lines and the two creases with their cages.
  for (const t of [0.28, 0.72]) line(ctx, r.x + r.w * t, r.y, r.x + r.w * t, r.y + r.h);
  ctx.strokeStyle = theme.accent;
  for (const t of [0.13, 0.87]) {
    const gx = r.x + r.w * t;
    circle(ctx, gx, r.y + r.h / 2, r.h * 0.16);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(gx - 1, r.y + r.h / 2 - 3, 2, 6);
  }
};

/**
 * A football field, laid down for the card: end zones, a yard line every five,
 * the hashes down the middle and a set of posts at each end. It is the only one
 * of these that has to read as COUNTED rather than as a shape, because counting
 * is what the sport is.
 */
const footballPreview: PreviewPainter = (ctx, w, h, theme) => {
  const r = surface(ctx, w, h, theme);
  const endW = r.w * 0.1;
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(r.x, r.y, endW, r.h);
  ctx.fillRect(r.x + r.w - endW, r.y, endW, r.h);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = theme.surfaceLine;
  const play = r.w - endW * 2;
  for (let i = 0; i <= 20; i++) {
    const x = r.x + endW + (play * i) / 20;
    ctx.globalAlpha = i % 2 === 0 ? 0.85 : 0.35;
    line(ctx, x, r.y, x, r.y + r.h);
  }
  ctx.globalAlpha = 1;
  // The hashes, a short tick at each yard down two lines through the middle.
  for (const t of [0.38, 0.62]) {
    const y = r.y + r.h * t;
    for (let i = 0; i < 40; i++) {
      const x = r.x + endW + (play * i) / 40;
      line(ctx, x, y - 1.5, x, y + 1.5);
    }
  }
  // Posts.
  ctx.strokeStyle = theme.accent;
  for (const dir of [1, -1] as const) {
    const bx = dir === 1 ? r.x + 2 : r.x + r.w - 2;
    line(ctx, bx, r.y + r.h * 0.38, bx, r.y + r.h * 0.62);
  }
};

const basketballPreview: PreviewPainter = (ctx, w, h, theme) => {
  const r = surface(ctx, w, h, theme);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  line(ctx, cx, r.y, cx, r.y + r.h);
  circle(ctx, cx, cy, Math.min(r.w, r.h) * 0.13);
  // Keys, three-point arcs and rims at both ends.
  for (const dir of [1, -1] as const) {
    const base = dir === 1 ? r.x : r.x + r.w;
    const keyW = r.w * 0.14;
    const keyH = r.h * 0.4;
    ctx.strokeRect(
      (dir === 1 ? base : base - keyW) + 0.5, cy - keyH / 2 + 0.5, keyW - 1, keyH - 1,
    );
    ctx.beginPath();
    ctx.arc(base + dir * r.w * 0.055, cy, r.h * 0.46, -Math.PI / 2.05, Math.PI / 2.05, dir === -1);
    ctx.stroke();
    ctx.strokeStyle = theme.accent;
    circle(ctx, base + dir * r.w * 0.075, cy, 2.5);
    ctx.strokeStyle = theme.surfaceLine;
  }
};

/** A planned sport still gets real art, so the roadmap looks like the product. */
const genericPreview = (marks: 'ends' | 'net' | 'diamond' | 'ring'): PreviewPainter =>
  (ctx, w, h, theme) => {
    const r = surface(ctx, w, h, theme);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.strokeStyle = theme.surfaceLine;
    if (marks === 'ends') {
      for (let i = 1; i < 10; i++) line(ctx, r.x + (r.w * i) / 10, r.y, r.x + (r.w * i) / 10, r.y + r.h);
    } else if (marks === 'net') {
      line(ctx, cx, r.y, cx, r.y + r.h);
      circle(ctx, cx, cy, Math.min(r.w, r.h) * 0.14);
    } else if (marks === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(cx, r.y + r.h * 0.85);
      ctx.lineTo(r.x + r.w * 0.2, cy);
      ctx.lineTo(cx, r.y + r.h * 0.15);
      ctx.lineTo(r.x + r.w * 0.8, cy);
      ctx.closePath();
      ctx.stroke();
    } else {
      circle(ctx, cx, cy, Math.min(r.w, r.h) * 0.36);
    }
  };

/* ---------------------------------------------------------------- the board */

export const SPORTS: SportManifest[] = [
  {
    id: 'lacrosse',
    name: 'Lacrosse',
    title: 'Lone Star Lax',
    tagline: 'The one that started the hub.',
    blurb: 'Arcade lacrosse with a coaching career underneath it: recruit, develop, '
      + 'take a bottom-of-the-district programme to the professional game, or just '
      + 'pick two teams and drop the ball.',
    modes: ['Play Now', 'Season', 'Dynasty', 'Challenge', 'Practice'],
    theme: {
      accent: '#ffc53d', accentInk: '#1a1200',
      surface: '#2f7d42', surfaceLine: '#68b183', backdrop: '#090d12',
    },
    preview: lacrossePreview,
    load: async () => (await import('./lacrosse/index')).LACROSSE,
  },
  {
    id: 'basketball',
    name: 'Basketball',
    title: 'Hardwood',
    tagline: 'Five on five, and a shot you have to time.',
    blurb: 'Half-court basketball with real rim physics and a release window you '
      + 'either hit or do not. Spacing, screens, help defence and the fast break, '
      + 'over a full season.',
    modes: ['Play Now', 'Season'],
    theme: {
      accent: '#ff8c42', accentInk: '#1a0d00',
      surface: '#b9793f', surfaceLine: '#e6c9a3', backdrop: '#0c0a09',
    },
    preview: basketballPreview,
    load: async () => (await import('./basketball/index')).BASKETBALL,
  },
  {
    id: 'football',
    name: 'Football',
    title: 'Gridiron',
    tagline: 'Four downs, a playbook, and ten yards.',
    blurb: 'Call the play, throw the ball, and live with it. Routes that are '
      + 'really run, coverage that reads what you keep calling, and a pass rush '
      + 'that has to beat a block to reach you.',
    modes: ['Play Now', 'Dynasty', 'Challenge'],
    theme: {
      accent: '#7ad151', accentInk: '#08160a',
      surface: '#2c6b3f', surfaceLine: '#d8e6dc', backdrop: '#0a0f0b',
    },
    preview: footballPreview,
    load: async () => (await import('./football/index')).FOOTBALL,
  },
  {
    id: 'soccer',
    name: 'Soccer',
    title: 'Touchline',
    tagline: 'Shape, space, and one goal that changes everything.',
    blurb: 'Formations that hold their shape, through balls, and a keeper worth '
      + 'beating.',
    modes: [],
    theme: {
      accent: '#4ad2c0', accentInk: '#04201d',
      surface: '#2a7d48', surfaceLine: '#e2f0e6', backdrop: '#081110',
    },
    preview: genericPreview('net'),
    plannedNote: 'Formation shape and set pieces.',
  },
  {
    id: 'hockey',
    name: 'Hockey',
    title: 'Blue Line',
    tagline: 'Skating is not running.',
    blurb: 'Momentum you have to plan for, the puck off the boards, and line '
      + 'changes that cost you if you get them wrong.',
    modes: [],
    theme: {
      accent: '#6fb3ff', accentInk: '#021024',
      surface: '#dfe9f2', surfaceLine: '#9db4c8', backdrop: '#070d14',
    },
    preview: genericPreview('net'),
    plannedNote: 'Skating momentum and puck physics off the boards.',
  },
  {
    id: 'baseball',
    name: 'Baseball',
    title: 'Ninth Inning',
    tagline: 'One pitch at a time.',
    blurb: 'Pitch selection and location against swing timing, with a defence you '
      + 'position yourself.',
    modes: [],
    theme: {
      accent: '#f2d06b', accentInk: '#1d1503',
      surface: '#8a6b46', surfaceLine: '#f0e4cf', backdrop: '#0d0b08',
    },
    preview: genericPreview('diamond'),
    plannedNote: 'The pitcher-batter duel, then the fielding behind it.',
  },
  {
    id: 'tennis',
    name: 'Tennis',
    title: 'Baseline',
    tagline: 'Two players, and nowhere to hide.',
    blurb: 'Spin, depth and court position, where one bad approach loses the point.',
    modes: [],
    theme: {
      accent: '#d8ff5e', accentInk: '#141a02',
      surface: '#2f6b8a', surfaceLine: '#eaf4f8', backdrop: '#070d11',
    },
    preview: genericPreview('net'),
    plannedNote: 'Spin and shot depth, serve to volley.',
  },
  {
    id: 'volleyball',
    name: 'Volleyball',
    title: 'Third Touch',
    tagline: 'Pass, set, spike.',
    blurb: 'Three touches, a rotation to keep track of, and a block that reads the '
      + 'set.',
    modes: [],
    theme: {
      accent: '#ff9ec7', accentInk: '#20040f',
      surface: '#c08a4e', surfaceLine: '#f6e3c9', backdrop: '#0e0a09',
    },
    preview: genericPreview('ring'),
    plannedNote: 'The three-touch rhythm and rotations.',
  },
];

export const sportById = (id: SportId): SportManifest | undefined =>
  SPORTS.find((s) => s.id === id);

export const playableSports = (): SportManifest[] => SPORTS.filter(isPlayable);
export const plannedSports = (): SportManifest[] => SPORTS.filter((s) => !isPlayable(s));

/** Applies a sport's colours to the document, or clears them for the hub. */
export function applySportTheme(theme: SportTheme | null, id: SportId | null): void {
  const root = document.documentElement;
  if (id) root.dataset.sport = id;
  else delete root.dataset.sport;
  const set = (name: string, value: string | null): void => {
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  };
  set('--accent', theme?.accent ?? null);
  set('--accent-ink', theme?.accentInk ?? null);
  set('--field', theme?.surface ?? null);
  set('--sport-line', theme?.surfaceLine ?? null);
  set('--bg', theme?.backdrop ?? null);
}
