/* ---------------------------------------------------------------------------
 * TRANSFERS
 * ---------------------------------------------------------------------------
 * This is deliberately NOT a shop. Players do not appear because they are good;
 * they appear because of a situation, and they weigh your programme against
 * every other one that wants them.
 *
 * WHY A PLAYER LOOKS
 *   - buried behind somebody better at his position
 *   - his team is losing and he wants to win
 *   - he wants a bigger role than he is going to get
 *   - the programme around him is not developing him
 *
 * WHAT HE WEIGHS
 *   - the role he would actually have here, judged against YOUR depth chart
 *   - how good this team is, and how it did last year
 *   - the programme's reputation and its coaching
 *   - whether you need him at all
 *
 * A pitch is not a purchase: he can commit, think it over, decline, or pick
 * somebody else. Elite players are hard, and a stacked position is a hard no —
 * you cannot buy a superteam every offseason.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Position } from '../data/constants';
import { POSITION_LABEL } from '../data/constants';
import {
  generateRoster, sortDepthChart, starTier, type PlayerData,
} from '../data/players';
import type { GameTeam, TeamData } from '../data/teams';
import { teamsInConference as WORLD_TEAMS_IN, tryWorldTeam } from '../data/world';
import type { Level } from '../data/levels';
import { coachEffects, type CoachStaff } from './coaching';

export type TransferReason =
  | 'buried'
  | 'losing'
  | 'role'
  | 'development';

export const REASON_TEXT: Record<TransferReason, string> = {
  buried: 'Behind a better player and not seeing the field',
  losing: 'Wants to win somewhere else',
  role: 'Looking for a bigger role',
  development: 'Wants a programme that will develop him',
};

export interface TransferCandidate {
  /** Stable id for the offseason, so the list survives a save/load. */
  id: string;
  player: PlayerData;
  fromTeamId: string;
  reason: TransferReason;
  /** Depth at his position on his current team: 0 = starter. */
  currentDepth: number;
  /** How the recruitment has gone so far. */
  status: 'open' | 'considering' | 'committed' | 'declined' | 'lost';
  /** Set once he goes elsewhere, for honesty on the screen. */
  lostToTeamId?: string;
  /** Pitches you have already spent on him. */
  attempts: number;
  /**
   * 0..100 — how well you know this player. A man you played against twice is
   * a known quantity; one from the other side of the league is a report.
   * Set when the market opens and raised by the scouts on your payroll.
   */
  known: number;
}

/**
 * What the coach can actually say about a transfer target. A player he has
 * faced is a known quantity; one from across the league is an estimate, and the
 * scouting staff is what narrows it.
 */
export interface TransferEstimate {
  overall: number;
  potential: number;
  margin: number;
  /** Plain words for the screen. */
  confidence: string;
}

export function transferEstimate(c: TransferCandidate): TransferEstimate {
  const t = clamp((c.known ?? 60) / 100, 0, 1);
  const known = t * t * (3 - 2 * t);
  const margin = Math.max(0, Math.round(10 * (1 - known)));
  // A stable per-candidate offset, so the number does not jitter per render.
  const off = ((Rng.hash(c.id) % 200) / 100 - 1) * margin * 0.6;
  return {
    overall: Math.round(clamp(c.player.overall + off, 20, 99)),
    potential: Math.round(clamp(c.player.potential + off, 20, 99)),
    margin,
    confidence: margin === 0 ? 'You know exactly what he is'
      : margin <= 3 ? 'Your people have watched him closely'
        : margin <= 6 ? 'Second-hand reports only'
          : 'You are going on a highlight reel',
  };
}

export interface InterestBreakdown {
  /** 0..100 overall. */
  score: number;
  factors: { label: string; delta: number }[];
}

/** Programmes a player would plausibly pick instead: his own conference. */
function rivalProgrammes(teamId: string): GameTeam[] {
  const wt = tryWorldTeam(teamId);
  if (!wt) return [];
  return WORLD_TEAMS_IN(wt.conference);
}

/** Starters plus one for cover: the point past which a team stops being short. */
const NEEDED: Record<Position, number> = { A: 4, M: 4, D: 4, G: 2, FO: 1 };

/** How many players are on the market in one offseason. */
const MARKET_SIZE = 8;
/** Pitches available per offseason. Scarcity is what makes this a decision. */
export const MAX_PITCHES = 3;

/**
 * Builds the market. Candidates come from real squads in the league, generated
 * exactly as those teams generate them, so a transfer is a player who genuinely
 * existed on somebody's depth chart.
 */
export interface MarketKnowledge {
  /** Teams the coach actually played this season: film exists on those players. */
  playedIds: string[];
  /** Scouts on the payroll, which is what closes the gap on everybody else. */
  scouts: number;
}

export function buildMarket(
  seed: number, year: number, userTeamId: string, sources: GameTeam[],
  standings: Record<string, { wins: number; losses: number }>,
  level: Level = 'hs',
  knowledge: MarketKnowledge = { playedIds: [], scouts: 0 },
): TransferCandidate[] {
  const rng = new Rng(`${seed}:market:${year}`);
  const pool: TransferCandidate[] = [];

  // Candidates come from programmes the coach has actually played against, so a
  // transfer is a player who genuinely existed on somebody's depth chart.
  const teams = sources.filter((t) => t.id !== userTeamId);
  for (const team of teams) {
    const roster = sortDepthChart(generateRoster(team, `${seed}:${year}:${team.id}`, level));
    const record = standings[team.id];
    const losing = record ? record.losses > record.wins + 1 : false;

    const byPos = new Map<Position, PlayerData[]>();
    for (const p of roster) {
      const list = byPos.get(p.pos) ?? [];
      list.push(p);
      byPos.set(p.pos, list);
    }

    for (const [pos, list] of byPos) {
      for (let depth = 0; depth < list.length; depth++) {
        const p = list[depth];
        if (p.grade >= 12) continue; // seniors are gone anyway
        const reason = pickReason(p, depth, losing, rng);
        if (!reason) continue;
        pool.push({
          id: `${team.id}:${p.id}`,
          player: p,
          fromTeamId: team.id,
          reason,
          currentDepth: depth,
          status: 'open',
          attempts: 0,
          known: 0,
        });
        void pos;
      }
    }
  }

  // How well the coach knows each of them, before the cut.
  for (const c of pool) {
    const seen = knowledge.playedIds.includes(c.fromTeamId);
    c.known = clamp(
      (seen ? 82 : 34) + knowledge.scouts * 9 + rng.range(-6, 6),
      0, 100,
    );
  }

  // Best stories first, then a cut, so the market is short and interesting.
  // Positions are capped roughly in proportion to a squad: a window where every
  // available player is a backup goalie is not a market, it is a list.
  const POS_CAP: Record<Position, number> = { A: 2, M: 3, D: 2, G: 1, FO: 1 };
  pool.sort((a, b) => weight(b) - weight(a));
  const picked: TransferCandidate[] = [];
  const perTeam = new Map<string, number>();
  const perPos = new Map<Position, number>();
  for (const c of pool) {
    const n = perTeam.get(c.fromTeamId) ?? 0;
    if (n >= 2) continue;
    const pn = perPos.get(c.player.pos) ?? 0;
    if (pn >= POS_CAP[c.player.pos]) continue;
    perTeam.set(c.fromTeamId, n + 1);
    perPos.set(c.player.pos, pn + 1);
    picked.push(c);
    if (picked.length >= MARKET_SIZE) break;
  }
  return picked;
}

function weight(c: TransferCandidate): number {
  // Good players stuck behind somebody are the interesting ones.
  return c.player.overall + (c.reason === 'buried' ? 8 : 0) + c.currentDepth * 2;
}

function pickReason(
  p: PlayerData, depth: number, losing: boolean, rng: Rng,
): TransferReason | null {
  // A starter on a decent team has no reason to go anywhere.
  if (depth === 0 && !losing) return rng.next() < 0.04 ? 'role' : null;
  if (depth >= 2 && p.overall >= 60) return rng.next() < 0.55 ? 'buried' : null;
  if (depth === 1 && p.overall >= 68) return rng.next() < 0.3 ? 'buried' : null;
  if (losing && p.overall >= 70) return rng.next() < 0.28 ? 'losing' : null;
  if (p.potential - p.overall >= 10) return rng.next() < 0.16 ? 'development' : null;
  return null;
}

export interface ProgramSnapshot {
  team: TeamData;
  roster: PlayerData[];
  prestige: number;
  staff: CoachStaff;
  /** Last season's record, for "are they winning" questions. */
  wins: number;
  losses: number;
  championships: number;
}

/**
 * How interested a candidate is in YOUR programme. The playing-time term
 * dominates on purpose: a 90 behind a 95 is the same player as a 90 with a
 * starting job, and only one of those is worth moving for.
 */
export function interestIn(c: TransferCandidate, prog: ProgramSnapshot): InterestBreakdown {
  const factors: { label: string; delta: number }[] = [];
  const fx = coachEffects(prog.staff);

  // --- playing time: where would he sit on our depth chart?
  const samePos = prog.roster
    .filter((p) => p.pos === c.player.pos && p.grade < 12)
    .sort((a, b) => b.overall - a.overall);
  const ahead = samePos.filter((p) => p.overall > c.player.overall).length;
  let playing: number;
  let playingLabel: string;
  if (ahead === 0) {
    playing = 34;
    playingLabel = 'Would start here';
  } else if (ahead === 1) {
    playing = 8;
    playingLabel = 'Would be second choice';
  } else if (ahead === 2) {
    playing = -14;
    playingLabel = 'Third choice at best';
  } else {
    playing = -30;
    playingLabel = `Behind ${ahead} better players`;
  }
  factors.push({ label: playingLabel, delta: playing });

  // --- does this team even need him? Measured against the starters plus cover,
  //     not the whole squad: a team carrying six defensemen is not short of one,
  //     and nobody is short of a third goalkeeper.
  const want = NEEDED[c.player.pos];
  const need = Math.max(0, want - samePos.length);
  if (need > 0) factors.push({ label: `Thin at ${POSITION_LABEL[c.player.pos]}`, delta: Math.min(10, need * 5) });

  // --- team strength and recent results
  const strength = Math.round((prog.team.overall - 72) * 0.8);
  factors.push({ label: strength >= 0 ? 'Strong squad' : 'Rebuilding squad', delta: strength });

  const games = prog.wins + prog.losses;
  if (games > 0) {
    const pct = prog.wins / games;
    const delta = Math.round((pct - 0.5) * 30);
    factors.push({ label: `Last season ${prog.wins}-${prog.losses}`, delta });
  }

  // --- programme reputation and coaching
  factors.push({ label: 'Programme reputation', delta: Math.round((prog.prestige - 55) * 0.35) });
  if (fx.appeal > 0) {
    factors.push({ label: 'Coaching and culture', delta: Math.round(fx.appeal * 22) });
  }
  if (prog.championships > 0) {
    factors.push({ label: `${prog.championships} district title${prog.championships === 1 ? '' : 's'}`, delta: Math.min(12, prog.championships * 5) });
  }

  // --- his own reason for looking
  if (c.reason === 'buried' && ahead === 0) factors.push({ label: 'The role he is looking for', delta: 12 });
  if (c.reason === 'losing' && prog.wins > prog.losses) factors.push({ label: 'A team that wins', delta: 10 });
  if (c.reason === 'development' && fx.developmentRate > 1.3) factors.push({ label: 'Development programme', delta: 12 });

  // --- the better the player, the higher his bar
  const tier = starTier(c.player.overall);
  if (tier > 0) factors.push({ label: tier === 2 ? 'Elite players have options' : 'Star players have options', delta: tier === 2 ? -20 : -10 });

  const base = 38;
  const score = clamp(base + factors.reduce((s, f) => s + f.delta, 0), 1, 99);
  return { score, factors };
}

export type PitchOutcome = 'committed' | 'considering' | 'declined' | 'lost';

export interface PitchResult {
  outcome: PitchOutcome;
  message: string;
  lostToTeamId?: string;
}

/**
 * One recruiting pitch. Interest sets the odds; a second pitch to a player who
 * is thinking it over helps, and a third is the last one he will hear.
 */
export function pitch(
  c: TransferCandidate, prog: ProgramSnapshot, rng: Rng,
): PitchResult {
  const { score } = interestIn(c, prog);
  const bonus = c.status === 'considering' ? 12 : 0;
  const fatigue = c.attempts * 6;
  const chance = clamp((score + bonus - fatigue) / 130, 0.02, 0.9);
  const roll = rng.next();

  if (roll < chance) {
    return { outcome: 'committed', message: `${c.player.first} ${c.player.last} is coming.` };
  }
  if (roll < chance + 0.28 && c.attempts < 2) {
    return { outcome: 'considering', message: 'He is thinking about it. Go back to him.' };
  }
  // Somebody else in the league takes him: a rival with a real need.
  if (rng.next() < 0.3) {
    const rivals = rivalProgrammes(c.fromTeamId)
      .filter((t) => t.id !== c.fromTeamId && t.id !== prog.team.id);
    const to = rivals.length ? rng.pick(rivals) : null;
    return {
      outcome: 'lost',
      message: to ? `He has committed to ${to.short}.` : 'He is staying where he is.',
      lostToTeamId: to?.id,
    };
  }
  return { outcome: 'declined', message: 'He is staying put. That door is shut.' };
}
