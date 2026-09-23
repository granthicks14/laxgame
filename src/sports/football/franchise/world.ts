import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { computeOverall, depthAt, makePlayer, type Player, type Position } from '../data';
import { rosterFor, teamOr, type NflTeam } from '../nfl';
import { coachingOf, type Coaching } from './staff';
import { MINIMUM_SHAPE, ROSTER_LIMIT, fitToCap, marketValue, marketYears } from './club';
import type { Franchise } from './types';

/* ---------------------------------------------------------------------------
 * THE OTHER THIRTY-ONE CLUBS
 * ---------------------------------------------------------------------------
 * Everything that answers the question "who is on that team?", and it answers
 * it the same way every time it is asked — from the club's id, the save's seed
 * and the year, with two short lists of exceptions laid over the top:
 *
 *   PRESTIGE DRIFT      a decade of winning makes a club genuinely better and a
 *                       decade of losing makes it genuinely worse, and it costs
 *                       one number per club to say so.
 *   ROSTER EDITS        the players you have actually traded for or away. Only
 *                       clubs you have done business with have an entry.
 *
 * And YOUR OWN roster, which is the one thing that is stored, because it is the
 * only one you change.
 * ------------------------------------------------------------------------- */

export const driftOf = (fr: Franchise, teamId: string): number =>
  fr.prestigeDrift[teamId] ?? 0;

/**
 * A SMALL CACHE, because a screen asks for the same roster forty times.
 *
 * Building one is thirty-four generated players and the trade desk wants a
 * value for every man on both sides of a deal every time anything is tapped.
 * The key carries everything that can change the answer — the club, the year,
 * its drift and the size of the edit list — so a trade that moves somebody
 * invalidates it without anybody having to remember to.
 */
const CACHE = new Map<string, Player[]>();

/** Any club's squad for a season, with everything you have done to it applied. */
export function rosterOf(fr: Franchise, teamId: string, year: number): Player[] {
  if (teamId === fr.teamId) return gameRoster(fr);
  const drift = driftOf(fr, teamId);
  const edit = fr.rosterEdits[teamId];
  const key = `${fr.seed}:${teamId}:${year}:${drift}:${edit?.out.length ?? 0}:${edit?.in.length ?? 0}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const built = buildRosterFor(fr, teamId, year, drift, edit);
  /* A FRANCHISE ONLY EVER LOOKS AT A FEW SEASONS AT ONCE, so the cache is
   * cleared wholesale rather than aged. Thirty-two clubs times a season is the
   * working set; anything past that is a screen nobody has open. */
  if (CACHE.size > 160) CACHE.clear();
  CACHE.set(key, built);
  return built;
}

function buildRosterFor(
  fr: Franchise, teamId: string, year: number, drift: number,
  edit: { out: string[]; in: Player[] } | undefined,
): Player[] {
  const team = teamOr(teamId);
  let squad = rosterFor(team, fr.seed, year, drift);
  if (edit) {
    if (edit.out.length) {
      const gone = new Set(edit.out);
      squad = squad.filter((p) => !gone.has(p.id));
    }
    if (edit.in.length) squad = [...squad, ...edit.in.map((p) => ({ ...p }))];
    squad = backfill(squad, `${fr.seed}:${teamId}:${year}`, team);
  }
  /* EVERY CLUB IN THE LEAGUE IS PAID ON THE SAME SCALE.
   *
   * Without this the other thirty-one carry whatever placeholder salary the
   * generator happened to put on them, and the trade desk's cap arithmetic is
   * then comparing your real contracts against their invented ones — which
   * refuses sound trades and waves through silly ones. */
  const priced = withAvailability(squad, fr.seed, teamId, year)
    .map((p) => ({ ...p, salary: marketValue(p), contractYears: marketYears(p) }));
  /* AND THEIR BOOKS BALANCE, the same way yours do on day one. Priced at the
   * open market a good club's thirty-four men come to more than the cap, which
   * left every other club in the league permanently unable to take on a dollar
   * — and the trade desk refusing sound deals with "cannot fit that salary". */
  fitToCap(priced);
  return priced;
}

/**
 * EVERYBODY LOSES PLAYERS, NOT JUST YOU.
 *
 * Your squad has men in the building every week — see `gameRoster` — and the
 * other thirty-one are rebuilt at full strength every time anybody asks for
 * them. Left alone that is a structural handicap nobody chose and nobody can
 * see: measured over twenty seasons it was worth about three wins a year, and
 * it looked exactly like "the franchise decays for no reason".
 *
 * So the rest of the league carries a casualty list too. It is coarse — one to
 * three men, fixed for the season, deterministic from the club and the year —
 * because nothing on screen ever needs to know which of their safeties is hurt.
 * What matters is that the arithmetic is even.
 */
function withAvailability(squad: Player[], seed: number, teamId: string, year: number): Player[] {
  const rng = new Rng(`nfl:out:${seed}:${teamId}:${year}`);
  const out = [...squad];
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const room = out.filter((p) =>
      out.filter((q) => q.pos === p.pos).length > MINIMUM_SHAPE[p.pos]);
    if (!room.length) break;
    const victim = room[rng.int(0, room.length - 1)];
    out.splice(out.indexOf(victim), 1);
  }
  return out;
}



/** The squad as it stands, before coaching and before anybody is hurt. */
export const rawRoster = (fr: Franchise): Player[] => fr.roster;

/**
 * A CLUB YOU HAVE RAIDED STILL HAS TO FIELD ELEVEN MEN.
 *
 * Trade a team its only two quarterbacks away and it does not forfeit; it signs
 * somebody off the street, and he is poor, which is the cost they paid.
 */
function backfill(squad: Player[], seed: string, team: NflTeam): Player[] {
  const out = [...squad];
  const have = (pos: Position): number => out.filter((p) => p.pos === pos).length;
  let n = 0;
  for (const [pos, need] of Object.entries(MINIMUM_SHAPE) as [Position, number][]) {
    while (have(pos) < need && n < 24) {
      out.push(makePlayer(`${seed}:fill:${pos}:${n}`, {
        pos,
        par: clamp(46 + team.prestige, 40, 58),
        years: 1,
        age: 23,
      }));
      n++;
    }
  }
  return out;
}

/* ------------------------------------------------------------- your own squad */

/**
 * YOUR SQUAD AS IT ACTUALLY TAKES THE FIELD.
 *
 * A COPY, always. Staff coaching, practice-facility polish and morale are worth
 * a few attribute points for one game; writing them onto the stored roster
 * would compound them every time a screen looked at a team sheet, and twenty
 * seasons of that turns a franchise into an all-star team by arithmetic.
 *
 * And the men who cannot play do not play. A squad that fields its injured
 * starters because the code forgot to check is a squad for whom an injury costs
 * nothing, which is the same as not having injuries.
 */
export function gameRoster(fr: Franchise): Player[] {
  const coaching = coachingOf(fr.staff);
  const polish = fr.facilities.practice * 0.9;
  const fit = fr.roster.filter((p) => !isOut(p));
  const squad = ensureEleven(fr, fit);
  return squad.map((p) => coachedCopy(p, coaching, polish));
}

export const isOut = (p: Player): boolean => (p.injury?.weeks ?? 0) >= 1;

/**
 * NOBODY FORFEITS.
 *
 * If injuries have left a position under the minimum the engine needs to line
 * up, the least-hurt man at it plays — and he plays hurt, which the copy below
 * makes true rather than pretending. Only if there is genuinely nobody does the
 * club sign a body off the street.
 */
function ensureEleven(fr: Franchise, fit: Player[]): Player[] {
  const out = [...fit];
  const have = (pos: Position): number => out.filter((p) => p.pos === pos).length;
  let n = 0;
  for (const [pos, need] of Object.entries(MINIMUM_SHAPE) as [Position, number][]) {
    while (have(pos) < need) {
      const hurt = fr.roster
        .filter((p) => p.pos === pos && !out.includes(p))
        .sort((a, b) => (a.injury?.weeks ?? 0) - (b.injury?.weeks ?? 0))[0];
      if (hurt) { out.push(hurt); continue; }
      out.push(makePlayer(`${fr.seed}:street:${fr.year}:${pos}:${n++}`, {
        pos, par: 44, years: 1, age: 25,
      }));
      if (n > 24) break;
    }
  }
  return out;
}

/** One man, with everything that is currently true about him folded in. */
function coachedCopy(p: Player, c: Coaching, polish: number): Player {
  const a = { ...p.attrs };
  const bump = (k: keyof typeof a, n: number): void => {
    a[k] = clamp(Math.round(a[k] + n), 20, 99);
  };
  /* MORALE IS WORTH A COUPLE OF POINTS EITHER WAY AND NEVER MORE.
   * A miserable squad is a worse squad; it is not a different sport. */
  const mood = clamp((p.morale - 55) / 22, -2, 2);
  /* AND PLAYING HURT COSTS HIM, which is the only reason the choice to do it
   * is a choice at all. */
  const hurt = p.injury ? -p.injury.severity * 14 : 0;

  for (const k of Object.keys(a) as (keyof typeof a)[]) bump(k, mood + hurt);
  bump('awareness', polish);

  switch (p.pos) {
    case 'QB':
      bump('throwAccuracy', c.passing);
      bump('decision', c.passing);
      break;
    case 'WR':
    case 'TE':
      bump('routeRunning', c.routes);
      bump('catching', c.routes * 0.5);
      break;
    case 'RB':
      bump('ballSecurity', c.carry);
      bump('power', c.carry * 0.6);
      break;
    case 'OL':
      bump('blocking', c.protection);
      break;
    case 'DL':
      bump('passRush', c.front);
      bump('tackling', c.front * 0.7);
      break;
    case 'LB':
      bump('tackling', c.front);
      bump('awareness', c.takeaway * 0.6);
      break;
    case 'CB':
    case 'S':
      bump('coverage', c.coverage);
      bump('awareness', c.takeaway);
      break;
    default:
      break;
  }
  return { ...p, attrs: a, overall: computeOverall(p.pos, a) };
}

/* ------------------------------------------------------------------ helpers */

/** Best man at a position on your own squad, ignoring anybody who cannot play. */
export const bestFit = (fr: Franchise, pos: Position): Player | null =>
  depthAt(fr.roster.filter((p) => !isOut(p)), pos)[0] ?? null;

export const rosterFull = (fr: Franchise): boolean => fr.roster.length >= ROSTER_LIMIT;

/** Who is hurt, worst first, for the injury report. */
export const injuredList = (fr: Franchise): Player[] =>
  fr.roster.filter((p) => p.injury).sort((a, b) => (b.injury!.weeks) - (a.injury!.weeks));
