/* ---------------------------------------------------------------------------
 * TEAM EMBLEMS
 * ---------------------------------------------------------------------------
 * Every programme needs a mark that can go on a midfield logo, a stadium sign
 * and a scoreboard. Real school logos are not ours to use, so these are
 * ORIGINAL retro emblems built from each team's own identity: its colours, its
 * initials and its playing style. Nothing is fetched, so there are no broken
 * images and no empty logo spaces — the emblem is drawn from data every time.
 *
 * The shape is derived from the team id so it is stable forever, but any team
 * can pin its own look in EMBLEM_OVERRIDES below.
 * ------------------------------------------------------------------------- */

import type { GameTeam, TeamIdentity } from './teams';

export type EmblemShape = 'shield' | 'circle' | 'star' | 'diamond' | 'banner' | 'hex';
export type EmblemMotif = 'none' | 'chevron' | 'bar' | 'stripe' | 'cross';

export interface Emblem {
  shape: EmblemShape;
  motif: EmblemMotif;
  /** One or two characters drawn inside the mark. */
  glyph: string;
  body: string;
  edge: string;
  ink: string;
}

const SHAPES: EmblemShape[] = ['shield', 'circle', 'star', 'diamond', 'banner', 'hex'];
const MOTIFS: EmblemMotif[] = ['none', 'chevron', 'bar', 'stripe', 'cross'];

/** Style leans the mark a certain way before the per-team hash decides. */
const IDENTITY_SHAPE: Record<TeamIdentity, EmblemShape | null> = {
  offense: null,
  defense: 'shield',
  transition: null,
  goalie: 'hex',
  faceoff: 'diamond',
  balanced: null,
};

const EMBLEM_OVERRIDES: Record<string, Partial<Emblem>> = {
  'highland-park': { shape: 'shield', motif: 'cross', glyph: 'HP' },
  'dallas-jesuit': { shape: 'banner', motif: 'stripe', glyph: 'J' },
  'st-marks': { shape: 'shield', motif: 'bar', glyph: 'SM' },
  esd: { shape: 'circle', motif: 'cross', glyph: 'E' },
  'southlake-carroll': { shape: 'star', motif: 'none', glyph: 'SC' },
};

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Initials for the mark: two letters at most, so it stays legible at 12px. */
function glyphFor(team: GameTeam): string {
  const words = team.short.replace(/[^A-Za-z' ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? team.abbr;
  return w.slice(0, 2).toUpperCase();
}

export function emblemFor(team: GameTeam): Emblem {
  const h = hash(team.id);
  const preferred = IDENTITY_SHAPE[team.identity];
  const base: Emblem = {
    shape: preferred ?? SHAPES[h % SHAPES.length],
    motif: MOTIFS[(h >>> 5) % MOTIFS.length],
    glyph: glyphFor(team),
    body: team.primary,
    edge: team.secondary,
    ink: team.trim,
  };
  return { ...base, ...EMBLEM_OVERRIDES[team.id] };
}
