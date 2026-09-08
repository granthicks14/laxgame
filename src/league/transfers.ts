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
import type { CoachPerks } from '../challenge/coach';

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
  /** The angle you last used on him, so a second approach has to say something new. */
  lastAngle?: PitchAngle;
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

/* ------------------------------------------------------------- the pitch */

/**
 * What you say to him. Each angle is worth something to some players and
 * nothing to others, and the fit is worked out from HIS situation rather than
 * from a dice roll — a buried player wants minutes, a player on a losing team
 * wants to win, and a senior wants to be developed for the next level.
 */
export type PitchAngle =
  | 'playingtime' | 'championship' | 'starting' | 'development'
  | 'coaching' | 'prestige' | 'culture' | 'freshstart' | 'biggerrole' | 'system';

export interface PitchAngleInfo {
  key: PitchAngle;
  label: string;
  /** What the coach is offering, in his own words. */
  blurb: string;
  /** Shown when it works. */
  landed: string;
}

export const PITCH_ANGLES: Record<PitchAngle, PitchAngleInfo> = {
  playingtime: { key: 'playingtime', label: 'Immediate playing time',
    blurb: 'He walks in and plays. Say it plainly and mean it.',
    landed: 'He wants the field, and you promised it.' },
  championship: { key: 'championship', label: 'Championship opportunity',
    blurb: 'This programme is going to win something, and he can be part of it.',
    landed: 'He wants to win, and you are winning.' },
  starting: { key: 'starting', label: 'A starting role',
    blurb: 'Not minutes — the job. His position, his line.',
    landed: 'The job was the whole pitch.' },
  biggerrole: { key: 'biggerrole', label: 'A bigger role',
    blurb: 'He already starts. Here the offence runs through him.',
    landed: 'He wants the ball, and you promised him the ball.' },
  development: { key: 'development', label: 'Player development',
    blurb: 'He leaves here a better player than he arrived. That is the offer.',
    landed: 'He believes you can make him better.' },
  coaching: { key: 'coaching', label: 'Better coaching',
    blurb: 'The staff here is the reason players get better. Sell the staff.',
    landed: 'He came for the coaching.' },
  prestige: { key: 'prestige', label: 'Programme prestige',
    blurb: 'The badge, the crowd, the history. Some players want the name.',
    landed: 'He wanted the name on the front of the shirt.' },
  culture: { key: 'culture', label: 'Team culture',
    blurb: 'Nobody leaves this locker room. Sell the room.',
    landed: 'He wanted to be somewhere settled.' },
  freshstart: { key: 'freshstart', label: 'A fresh start',
    blurb: 'Whatever happened where he was, it does not follow him here.',
    landed: 'He needed to be somewhere else, and you offered it.' },
  system: { key: 'system', label: 'System fit',
    blurb: 'The way this team plays is the way he plays. Show him the tape.',
    landed: 'He saw himself in the way you play.' },
};

export const PITCH_ORDER: PitchAngle[] = [
  'playingtime', 'starting', 'biggerrole', 'championship', 'development',
  'coaching', 'prestige', 'culture', 'freshstart', 'system',
];

/**
 * How well an angle fits this player, in interest points. Positive is a good
 * read of him; negative means you told him something he did not care about.
 */
export function angleFit(angle: PitchAngle, c: TransferCandidate, prog: ProgramSnapshot): number {
  const fx = coachEffects(prog.staff);
  const have = prog.roster.filter((p) => p.pos === c.player.pos).length;
  const needed = NEEDED[c.player.pos] ?? 3;
  const room = needed - have;
  const winning = prog.wins > prog.losses + 1;
  const strong = prog.prestige >= 72;

  switch (angle) {
    case 'playingtime':
      return c.reason === 'buried' ? 14 : room > 0 ? 8 : -8;
    case 'starting':
      return c.reason === 'buried' || c.reason === 'role' ? (room > 0 ? 16 : 4) : -6;
    // He is already a starter where he is. What he wants is to be the man, and
    // that only means anything if he would genuinely be the best you have.
    case 'biggerrole': {
      if (c.currentDepth > 0) return -6;
      const best = Math.max(0, ...prog.roster.filter((p) => p.pos === c.player.pos).map((p) => p.overall));
      const wouldLead = c.player.overall >= best;
      return c.reason === 'role' ? (wouldLead ? 15 : 2) : wouldLead ? 8 : -5;
    }
    case 'championship':
      return c.reason === 'losing' ? (winning || prog.championships > 0 ? 16 : -4) : winning ? 6 : -6;
    case 'development':
      return c.reason === 'development' ? 14 + prog.staff.development * 2 : prog.staff.development * 2 - 2;
    case 'coaching':
      return Math.round(fx.developmentRate * 10 - 10) + (c.reason === 'development' ? 8 : -2);
    case 'prestige':
      return strong ? 10 : -10;
    case 'culture':
      return Math.round(fx.retention * 14) - 3;
    case 'freshstart':
      return c.reason === 'losing' || c.reason === 'buried' ? 7 : -3;
    case 'system':
      return c.player.overall >= prog.team.overall ? 4 : 9;
  }
}

/** The angle a coach would obviously reach for, so the UI can suggest one. */
export function suggestedAngle(c: TransferCandidate, prog: ProgramSnapshot): PitchAngle {
  return [...PITCH_ORDER].sort((a, b) => angleFit(b, c, prog) - angleFit(a, c, prog))[0];
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

/* ------------------------------------------------------- level awareness */

/**
 * The same machinery, called what it is actually called at each level.
 *
 * A high school does not have a transfer portal; a college does, and it is the
 * single biggest roster tool a college coach has. A professional club signs
 * free agents. The mechanics that differ are the ones that genuinely differ:
 * how many players are available, how many approaches you get, how much you
 * already know about them, and whether your OWN players can walk.
 *
 * High school is left exactly as it was, because Dynasty balance depends on it.
 */
export type MarketKind = 'school' | 'portal' | 'signing' | 'freeagency';

export interface MarketInfo {
  kind: MarketKind;
  title: string;
  /** What one approach is called. */
  pitchWord: string;
  pitchesWord: string;
  blurb: string;
  pitches: number;
  size: number;
  /** Whether your own players can leave for somewhere else. */
  outgoing: boolean;
  /** How well a coach knows a player he has NOT played against, 0..100. */
  baseKnowledge: number;
}

export function marketFor(level: Level): MarketInfo {
  switch (level) {
    case 'hs':
      return {
        kind: 'school',
        title: 'Player movement',
        pitchWord: 'approach', pitchesWord: 'approaches',
        blurb: 'Players change schools for a reason: a coach, a role, a team that wins. '
          + 'You get three conversations a year and they are the only ones you get.',
        pitches: 3, size: 8, outgoing: false, baseKnowledge: 34,
      };
    case 'd3':
    case 'd2':
    case 'd1':
      return {
        kind: 'portal',
        title: 'Transfer portal',
        pitchWord: 'contact', pitchesWord: 'contacts',
        blurb: 'The portal is open. Every programme in the country can see the same names, '
          + 'and the ones worth having are gone in days. Your own players can enter it too.',
        pitches: level === 'd1' ? 5 : 4,
        size: level === 'd1' ? 14 : 12,
        outgoing: true,
        baseKnowledge: 26,
      };
    case 'semipro':
      return {
        kind: 'signing',
        title: 'Free agency',
        pitchWord: 'offer', pitchesWord: 'offers',
        blurb: 'Contracts are up. Finished players with day jobs, choosing where the drive is worth it.',
        pitches: 4, size: 10, outgoing: true, baseKnowledge: 40,
      };
    case 'pll':
      return {
        kind: 'freeagency',
        title: 'Free agency',
        pitchWord: 'offer', pitchesWord: 'offers',
        blurb: 'A short list of the best players alive, out of contract, with every club calling.',
        pitches: 3, size: 8, outgoing: true, baseKnowledge: 52,
      };
  }
}

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
  /** Extra names the coach's connections put in the window. */
  extraTargets?: number;
  /** Portal Expert: everyone in the window comes with a full report. */
  fullReports?: boolean;
}

export function buildMarket(
  seed: number, year: number, userTeamId: string, sources: GameTeam[],
  standings: Record<string, { wins: number; losses: number }>,
  level: Level = 'hs',
  knowledge: MarketKnowledge = { playedIds: [], scouts: 0 },
): TransferCandidate[] {
  const info = marketFor(level);
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
    c.known = knowledge.fullReports ? 100 : clamp(
      (seen ? 82 : info.baseKnowledge) + knowledge.scouts * 9 + rng.range(-6, 6),
      0, 100,
    );
  }

  // Best stories first, then a cut, so the market is short and interesting.
  // Positions are capped roughly in proportion to a squad: a window where every
  // available player is a backup goalie is not a market, it is a list.
  // Scaled to the size of the window: a college portal carries more of every
  // position than a high school does.
  const capScale = info.size / MARKET_SIZE;
  const cap = (n: number) => Math.max(1, Math.round(n * capScale));
  const POS_CAP: Record<Position, number> = {
    A: cap(2), M: cap(3), D: cap(2), G: cap(1), FO: cap(1),
  };
  pool.sort((a, b) => weight(b) - weight(a));
  const picked: TransferCandidate[] = [];
  const perTeam = new Map<string, number>();
  const perPos = new Map<Position, number>();
  for (const c of pool) {
    const n = perTeam.get(c.fromTeamId) ?? 0;
    if (n >= (info.kind === 'portal' ? 3 : 2)) continue;
    const pn = perPos.get(c.player.pos) ?? 0;
    if (pn >= POS_CAP[c.player.pos]) continue;
    perTeam.set(c.fromTeamId, n + 1);
    perPos.set(c.player.pos, pn + 1);
    picked.push(c);
    if (picked.length >= info.size + (knowledge.extraTargets ?? 0)) break;
  }
  return picked;
}

/* ------------------------------------------------------------- outgoing */

export interface PortalDeparture {
  name: string;
  pos: Position;
  overall: number;
  grade: number;
  reason: TransferReason;
  /** Where he went. */
  toTeamId: string | null;
  toTeamName: string;
}

export interface OutgoingResult {
  stayed: PlayerData[];
  left: PortalDeparture[];
}

/**
 * Your own squad, in a level where the portal exists. A player who is buried,
 * losing, or being developed by nobody has somewhere else to go — and a
 * programme with a strong culture keeps him.
 *
 * This is the other half of the portal, and it is the half that hurts.
 */
export function runOutgoing(
  roster: PlayerData[], level: Level, rng: Rng,
  ctx: { wins: number; losses: number; retention: number; rivals: GameTeam[] },
): OutgoingResult {
  const info = marketFor(level);
  // A COPY, always. Returning the caller's own array let career.ts empty the
  // squad it was about to refill from it, which wiped every high school roster
  // once a year and replaced it with freshmen.
  if (!info.outgoing) return { stayed: [...roster], left: [] };

  const byPos = new Map<Position, PlayerData[]>();
  for (const p of sortDepthChart(roster)) {
    const list = byPos.get(p.pos) ?? [];
    list.push(p);
    byPos.set(p.pos, list);
  }

  const losing = ctx.losses > ctx.wins + 1;
  const stayed: PlayerData[] = [];
  const left: PortalDeparture[] = [];

  for (const [pos, list] of byPos) {
    const floor = NEEDED[pos] ?? 3;
    let remaining = list.length;
    for (let depth = 0; depth < list.length; depth++) {
      const p = list[depth];
      const needed = floor;
      // A position can never be stripped below what it takes to field a team.
      // Without this a run of departures left a squad with two midfielders.
      if (remaining <= floor) { stayed.push(p); continue; }
      // Seniors are leaving anyway; the ones who go are the ones with years
      // left and no path to the field.
      const buried = depth >= needed;
      if (p.grade >= 12 || (!buried && !losing)) { stayed.push(p); continue; }

      let chance = 0;
      if (buried) chance += 0.16 + (depth - needed) * 0.05;
      if (losing) chance += 0.07;
      if (p.potential - p.overall > 8) chance += 0.05;
      // Culture is the whole point of the culture track.
      chance *= clamp(1 - ctx.retention * 0.65, 0.3, 1);
      if (rng.next() > clamp(chance, 0, 0.45)) { stayed.push(p); continue; }

      remaining--;
      const to = ctx.rivals.length ? rng.pick(ctx.rivals) : null;
      left.push({
        name: `${p.first} ${p.last}`,
        pos: p.pos,
        overall: p.overall,
        grade: p.grade,
        reason: buried ? 'buried' : 'losing',
        toTeamId: to?.id ?? null,
        toTeamName: to?.short ?? 'another programme',
      });
    }
  }
  return { stayed: sortDepthChart(stayed), left };
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
  angle: PitchAngle = 'development', perks?: CoachPerks,
): PitchResult {
  const { score } = interestIn(c, prog);
  const bonus = c.status === 'considering' ? 12 : 0;
  const fatigue = c.attempts * 6;
  // What you actually SAY to him. A player who is buried does not want to hear
  // about your culture; he wants to hear that he will play.
  let fit = angleFit(angle, c, prog);
  // He has already heard this one. Saying the same thing louder is not a pitch.
  if (c.lastAngle === angle) fit = Math.min(fit, 0) + Math.max(0, fit) * 0.25 - 6;
  const power = perks?.pitchPower ?? 1;
  const chance = clamp(((score + bonus + fit - fatigue) / 130) * power, 0.02, 0.93);
  const roll = rng.next();

  if (roll < chance) {
    return {
      outcome: 'committed',
      message: `${c.player.first} ${c.player.last} is coming. ${PITCH_ANGLES[angle].landed}`,
    };
  }
  if (roll < chance + 0.28 * (perks?.pitchPower ?? 1) && c.attempts < 2) {
    return {
      outcome: 'considering',
      message: c.lastAngle === angle
        ? 'He has heard that from you already. Try a different angle.'
        : fit >= 8
          ? 'That landed. He is thinking hard about it — go back to him.'
          : 'He is thinking about it, but that was not what he wanted to hear.',
    };
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
