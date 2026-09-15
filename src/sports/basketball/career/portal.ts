import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { buildRoster, type HoopsPlayer } from '../data';
import { LEVELS, rosterOptionsFor, type HoopsLevel } from '../levels';
import { playingTimeOutlook, type RosterNeeds } from './needs';
import { PRIORITY_LABEL, type Priority } from './recruit';
import type { CoachPerks } from './coach';
import type { TierMods } from './difficulty';
import type { StatLine } from './types';

/* ---------------------------------------------------------------------------
 * THE PORTAL
 * ---------------------------------------------------------------------------
 * Players leave, and players are available. Both halves matter and the second
 * one is the more interesting: a coach who has just lost his two best players
 * can rebuild in one window instead of four years, and a coach who never checks
 * loses his squad a piece at a time without ever being told why.
 *
 * WHY THEY GO is never random. A player who did not play leaves because he did
 * not play; a good player on a bad team leaves because it is a bad team; a
 * player whose coach has no development staff leaves to find one. Every
 * departure names its reason, and every one of those reasons is something the
 * coach could have changed.
 *
 * WHAT A TARGET WANTS is shown before you approach him, as weights on the same
 * five priorities a recruit has. Matching them is the whole skill: the same
 * pitch that lands a player who wants minutes bounces off one who wants to win.
 * ------------------------------------------------------------------------- */

export type TransferReason =
  | 'minutes' | 'losing' | 'development' | 'role' | 'coach' | 'crowded' | 'home';

export const REASON_TEXT: Record<TransferReason, string> = {
  minutes: 'Was not playing',
  losing: 'Wants to win somewhere',
  development: 'Wants to be developed',
  role: 'Wants a bigger role',
  coach: 'Did not want to play for you',
  crowded: 'Too many bodies at his position',
  home: 'Going home',
};

export interface PortalDeparture {
  /** Who he was, so the record book can find the line he left behind. */
  id: string;
  name: string;
  pos: string;
  overall: number;
  reason: TransferReason;
  text: string;
}

export interface TransferTarget {
  id: string;
  player: HoopsPlayer;
  /** The level he is leaving. */
  from: HoopsLevel;
  /** Why he is in the window, which tells you what he is looking for. */
  reason: TransferReason;
  /** What he cares about, 0..1 each, and it is shown to the coach. */
  wants: Record<Priority, number>;
  /** How warm he is on you, 0..100. */
  interest: number;
  /** How many other programmes are on him. */
  rivals: number;
  /** Approaches already made. */
  pitches: number;
  status: 'open' | 'committed' | 'gone';
  /** Set when he signs with somebody. */
  signedWith: string | null;
}

/* -------------------------------------------------------------- outgoing */

export interface OutgoingInput {
  roster: HoopsPlayer[];
  level: HoopsLevel;
  season: Record<string, StatLine>;
  games: number;
  /** Last season's win percentage. */
  form: number;
  perks: CoachPerks;
  mods: TierMods;
  seed: number | string;
  needs: RosterNeeds;
}

export interface OutgoingResult {
  left: HoopsPlayer[];
  departures: PortalDeparture[];
}

/**
 * Who walks.
 *
 * Only at levels where a player CAN walk — a professional under contract is
 * handled by the ageing and release rules, not by this. Everybody else weighs
 * what he got against what he wanted, and the coach's culture is the thing that
 * holds a squad together when the rest of it is going badly.
 */
export function runOutgoing(input: OutgoingInput): OutgoingResult {
  const rng = new Rng(`hoops:portal-out:${input.seed}`);
  const info = LEVELS[input.level];
  if (info.market !== 'recruiting') return { left: [], departures: [] };

  const left: HoopsPlayer[] = [];
  const departures: PortalDeparture[] = [];
  const availableSeconds = Math.max(1, input.games * 5 * 8 * 60);

  for (const p of input.roster) {
    // A man in his last year is graduating, not transferring.
    if (p.years >= info.eligibility) continue;

    const line = input.season[p.id];
    const share = clamp((line?.seconds ?? 0) / availableSeconds, 0, 1);
    const played = clamp(share * 9, 0, 1);
    const need = input.needs.byPos[p.pos];

    // Every reason is a pressure, and the biggest one is why he goes.
    const pressures: [TransferReason, number][] = [
      ['minutes', clamp((0.42 - played) * 2.2, 0, 1) * (p.overall > need.starterLine - 8 ? 1.2 : 0.7)],
      ['losing', clamp((0.45 - input.form) * 1.8, 0, 1) * (p.overall >= need.starterLine ? 1.1 : 0.8)],
      ['development', clamp((1.08 - input.perks.development) * 2, 0, 1)
        * (p.potential - p.overall > 8 ? 1.3 : 0.5)],
      ['crowded', clamp((need.projected - need.slots) / 2, 0, 1)],
      ['role', clamp((p.overall - need.starterLine - 2) / 10, 0, 1) * 0.6],
    ];
    pressures.sort((a, b) => b[1] - a[1]);
    const [reason, pressure] = pressures[0];

    const chance = clamp(
      pressure * 0.4 * input.mods.outgoingRisk * (1 - input.perks.retention),
      0, 0.65,
    );
    if (!rng.bool(chance)) continue;

    left.push(p);
    departures.push({
      id: p.id,
      name: `${p.first} ${p.last}`,
      pos: p.pos,
      overall: p.overall,
      reason,
      text: REASON_TEXT[reason],
    });
  }
  return { left, departures };
}

/* -------------------------------------------------------------- incoming */

export interface WindowOptions {
  level: HoopsLevel;
  year: number;
  seed: number | string;
  perks: CoachPerks;
  mods: TierMods;
  /** How many names, before the coach's own contacts. */
  size: number;
  /** The attribute pool the level plays at. */
  par: number;
}

function wantsFor(rng: Rng, reason: TransferReason): Record<Priority, number> {
  const base: Record<Priority, number> = {
    minutes: rng.range(0.2, 0.8),
    winning: rng.range(0.15, 0.8),
    development: rng.range(0.15, 0.8),
    prestige: rng.range(0.1, 0.7),
    home: rng.range(0, 0.6),
  };
  // What drove him out is what he is looking for.
  if (reason === 'minutes' || reason === 'role') base.minutes = rng.range(0.8, 1);
  if (reason === 'losing') base.winning = rng.range(0.8, 1);
  if (reason === 'development') base.development = rng.range(0.8, 1);
  if (reason === 'crowded') base.minutes = rng.range(0.7, 1);
  if (reason === 'home') base.home = rng.range(0.8, 1);
  return base;
}

/**
 * The window.
 *
 * Names drawn from the level and the ones just below it, because that is where
 * transfers come from: a good player at a smaller programme moving up, and a
 * player at this level who did not play moving sideways. Better than a recruit
 * on the day he arrives, and with far less left to grow — which is the trade a
 * coach is actually making.
 */
export function buildWindow(opts: WindowOptions): TransferTarget[] {
  const rng = new Rng(`hoops:portal:${opts.seed}:${opts.year}`);
  const info = LEVELS[opts.level];
  const size = opts.size + opts.perks.extraTargets;
  const reasons: TransferReason[] = [
    'minutes', 'losing', 'development', 'role', 'crowded', 'coach', 'home',
  ];
  const out: TransferTarget[] = [];

  for (let i = 0; i < size; i++) {
    const reason = reasons[rng.int(0, reasons.length - 1)];
    // A transfer is a known quantity: two or three years in, close to what he
    // is going to be.
    const years = rng.int(2, Math.max(2, info.eligibility));
    const band = rng.gauss(0, 1);
    const made = buildRoster(
      `portal:${opts.seed}:${opts.year}:${i}`, i,
      rosterOptionsFor(opts.level, opts.par + band * 5),
    );
    const player = made[rng.int(0, made.length - 1)];
    player.years = Math.min(years, info.eligibility - 1) || 1;
    player.age = (info.eligibility === 2 ? 18 : 17) + player.years;
    player.potential = clamp(
      player.overall + Math.round(rng.range(0, 1) ** 1.7 * 14), player.overall, 99,
    );

    out.push({
      id: `t${opts.year}-${i}`,
      player,
      from: opts.level,
      reason,
      wants: wantsFor(rng, reason),
      interest: clamp(rng.range(0, 22), 0, 100),
      rivals: clamp(
        Math.round(rng.range(0, 2.5) * opts.mods.rivalPush) + opts.mods.portalRivals,
        0, 7,
      ),
      pitches: 0,
      status: 'open',
      signedWith: null,
    });
  }
  return out.sort((a, b) => b.player.overall - a.player.overall);
}

/* ------------------------------------------------------------- the pitch */

export interface PitchFactor {
  label: string;
  /** 0..1 — how much HE cares. */
  weight: number;
  /** -1..1 — how you score. */
  score: number;
  note: string;
}

export interface PortalProgram {
  standing: number;
  form: number;
  perks: CoachPerks;
  needs: RosterNeeds;
  level: HoopsLevel;
}

export function pitchFactors(t: TransferTarget, prog: PortalProgram): PitchFactor[] {
  const need = prog.needs.byPos[t.player.pos];
  const outlook = playingTimeOutlook(need, t.player.overall, t.player.potential);
  const dev = clamp((prog.perks.development - 1) * 1.6, -1, 1);
  return [
    {
      label: PRIORITY_LABEL.minutes,
      weight: t.wants.minutes,
      score: outlook.appeal,
      note: outlook.text,
    },
    {
      label: PRIORITY_LABEL.winning,
      weight: t.wants.winning,
      score: clamp((prog.form - 0.5) * 2.4, -1, 1),
      note: prog.form >= 0.6 ? 'You win here' : 'You have not been winning',
    },
    {
      label: PRIORITY_LABEL.development,
      weight: t.wants.development,
      score: dev,
      note: dev > 0.2 ? 'Your players get better' : 'No development staff to point at',
    },
    {
      label: PRIORITY_LABEL.prestige,
      weight: t.wants.prestige,
      score: clamp((prog.standing - 45) / 45, -1, 1),
      note: prog.standing >= 70 ? 'A programme people have heard of' : 'A small name',
    },
    {
      label: PRIORITY_LABEL.home,
      weight: t.wants.home,
      score: 0,
      note: 'Neither here nor there for him',
    },
  ];
}

export interface PitchResult {
  moved: number;
  message: string;
  signed: boolean;
}

export const MAX_PITCHES = 3;

/**
 * Approach a player in the window.
 *
 * Each approach moves him toward what your programme is actually worth to him,
 * and no further: a coach can make the same pitch three times and it will not
 * turn a bad fit into a signature. What he CAN do is beat the other programmes
 * chasing him, which is what the rival count is.
 */
export function pitchTo(
  target: TransferTarget, prog: PortalProgram, teamId: string,
  perks: CoachPerks, mods: TierMods, seed: number | string,
): PitchResult {
  if (target.status !== 'open') {
    return { moved: 0, message: 'He has already decided', signed: false };
  }
  const rng = new Rng(`hoops:pitch:${seed}:${target.id}:${target.pitches}`);
  target.pitches++;

  const factors = pitchFactors(target, prog);
  let sum = 0;
  let weight = 0;
  for (const f of factors) { sum += f.score * f.weight; weight += f.weight; }
  const fit = weight > 0 ? sum / weight : 0;

  const ceiling = clamp(
    50 + fit * 46 + perks.appeal * 20 - mods.pitchResistance, 0, 100,
  );
  const before = target.interest;
  const step = (ceiling - target.interest) * 0.45 * perks.pitchPower;
  target.interest = clamp(target.interest + step, 0, 100);
  const moved = Math.round(target.interest - before);

  // The competition. Every rival is another programme making the same call.
  const rivalBest = clamp(
    rng.range(35, 72) + target.rivals * 4.5 * mods.rivalPush, 0, 100,
  );

  if (target.pitches >= MAX_PITCHES || target.interest >= 88) {
    if (target.interest > rivalBest) {
      target.status = 'committed';
      target.signedWith = teamId;
      return {
        moved,
        message: `${target.player.first} ${target.player.last} is coming to you`,
        signed: true,
      };
    }
    target.status = 'gone';
    target.signedWith = null;
    return {
      moved,
      message: `${target.player.last} has gone somewhere else`,
      signed: false,
    };
  }

  const mood = target.interest >= 70 ? 'He is listening properly now'
    : target.interest >= 45 ? 'He is interested'
      : target.interest >= 25 ? 'He took the call' : 'He was not impressed';
  return { moved, message: mood, signed: false };
}

/** Everything in the window that has not decided yet. */
export const openTargets = (market: TransferTarget[]): TransferTarget[] =>
  market.filter((t) => t.status === 'open');

export const signedTargets = (market: TransferTarget[], teamId: string): TransferTarget[] =>
  market.filter((t) => t.signedWith === teamId);

/** What he is looking for, in one line, for the board. */
export function wantsSummary(t: TransferTarget): string {
  const top = (Object.entries(t.wants) as [Priority, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => PRIORITY_LABEL[k].toLowerCase());
  return `Wants ${top.join(' and ')}`;
}

export type WantLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * What he wants, stated flatly, every priority of the five.
 *
 * A summary sentence is not enough on the portal screen: a coach deciding which
 * of six players to spend his three approaches on needs to compare them line by
 * line, and "Playing time: HIGH, Winning: LOW" is a thing you can compare.
 */
export function wantsLines(t: TransferTarget): { label: string; level: WantLevel }[] {
  return (Object.entries(t.wants) as [Priority, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({
      label: PRIORITY_LABEL[k],
      level: (v > 0.66 ? 'HIGH' : v > 0.38 ? 'MEDIUM' : 'LOW') as WantLevel,
    }));
}
