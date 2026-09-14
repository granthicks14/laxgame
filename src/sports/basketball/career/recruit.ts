import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import {
  ATTR_MIN, POSITIONS, buildRoster, computeOverall,
  type HoopsPlayer, type HoopsPosition,
} from '../data';
import { LEVELS, type HoopsLevel } from '../levels';
import { playingTimeOutlook, type RosterNeeds } from './needs';
import type { CoachPerks } from './coach';
import type { TierMods } from './difficulty';

/* ---------------------------------------------------------------------------
 * RECRUITING
 * ---------------------------------------------------------------------------
 * Finding a player, and getting him to choose you.
 *
 * TWO THINGS ARE NOT THE SAME, and the whole system is built on the gap between
 * them. What a prospect IS, and what you can SEE of him. A recruit arrives with
 * a ranking, a position and a set of numbers you have been told; underneath is
 * a real player with a real ceiling, and the two only converge if you have paid
 * for the eye to tell them apart. That gap is where a career is made: the
 * three-star with a ceiling nobody spotted is worth more than the five-star
 * everybody wants, and finding him is the job.
 *
 * A DECISION IS NOT A PERCENTAGE. A recruit weighs what he actually cares about
 * — minutes, the programme, the coach, how far it is from home, whether he will
 * be developed — against every programme chasing him. Those weights are his own
 * and they are shown to the coach, so a pitch is a decision rather than a
 * button. Two players with identical ratings can want opposite things.
 * ------------------------------------------------------------------------- */

export type Priority = 'minutes' | 'winning' | 'development' | 'prestige' | 'home';

export const PRIORITY_LABEL: Record<Priority, string> = {
  minutes: 'Playing time',
  winning: 'Winning now',
  development: 'Getting better',
  prestige: 'The programme',
  home: 'Staying close to home',
};

export interface Suitor {
  teamId: string;
  /** How hard they are chasing, 0..100. */
  interest: number;
  /**
   * How hard they will EVER chase. A rival programme is a fit or it is not, the
   * same way yours is, so its interest converges on a ceiling rather than
   * climbing forever. Without this every suitor walked to a hundred over eight
   * weeks and no coach in the game could sign anybody at all.
   */
  ceiling: number;
}

export interface Prospect {
  id: string;
  /** The real player, which is what arrives if he signs. */
  player: HoopsPlayer;
  /** 1-5, what the world thinks of him. Often wrong. */
  stars: number;
  /** Where he is from, which is what `home` means to him. */
  region: string;
  /** What he wants, 0..1 each. They do not add to one; he can want it all. */
  wants: Record<Priority, number>;
  /** How warm he is on YOUR programme, 0..100. */
  interest: number;
  /** Who else is chasing him. */
  suitors: Suitor[];
  /** Has the coach offered him a place? */
  offered: boolean;
  /** Set once he has chosen somebody. */
  committedTo: string | null;
  /** Weeks of contact, which is what interest is built out of. */
  contact: number;
  /** True once a scout has been through him properly. */
  scouted: boolean;
  /** What a scout would tell you: a range, not a number. */
  seenOverall: number;
  seenCeiling: number;
  margin: number;
}

export interface RecruitingState {
  /** Which year's class this is. */
  year: number;
  prospects: Prospect[];
  /** How many offers may be open at once. */
  offerLimit: number;
  /** Weeks of the cycle already worked. */
  week: number;
  /** How many weeks the cycle runs. */
  weeks: number;
  /** Anything worth telling the coach since he last looked. */
  news: string[];
}

const REGIONS = ['in state', 'nearby', 'across the country', 'abroad'];

/* ------------------------------------------------------------- the class */

function wantsFor(rng: Rng): Record<Priority, number> {
  // Every player wants something most. Drawn rather than assigned, so a class is
  // full of different people rather than five copies of an archetype.
  const raw: Record<Priority, number> = {
    minutes: rng.range(0.15, 1),
    winning: rng.range(0.1, 1),
    development: rng.range(0.15, 1),
    prestige: rng.range(0.05, 1),
    home: rng.range(0, 1),
  };
  return raw;
}

export interface ClassOptions {
  level: HoopsLevel;
  year: number;
  seed: number | string;
  /** How many prospects. */
  size: number;
  /** What the coach can see. */
  perks: CoachPerks;
  mods: TierMods;
  /**
   * Places actually open on the roster. A coach chases a few more players than he
   * has room for, so this sets both how big a board he works and how many offers
   * he may have out at once.
   */
  places: number;
  /**
   * Every other club at the level, WITH how the sport rates it. A rival's pull
   * on a recruit is its own standing, not a dice roll: a blue blood chasing a
   * five-star is close to unbeatable and a bottom-half programme chasing the
   * same boy is making a phone call.
   */
  rivals: { id: string; standing: number }[];
}

/**
 * Build a recruiting class.
 *
 * The players are built for the level ABOVE where they are now — a schoolboy
 * arriving at a college is a college player, badly — so a class is a spread of
 * ability around what the level needs, with a few at both extremes.
 */
export function buildClass(opts: ClassOptions): Prospect[] {
  const rng = new Rng(`hoops:class:${opts.seed}:${opts.year}`);
  const info = LEVELS[opts.level];
  const out: Prospect[] = [];

  for (let i = 0; i < opts.size; i++) {
    const pos = POSITIONS[rng.int(0, POSITIONS.length - 1)];
    /* Where he sits against the level. Most are below it — they are freshmen —
     * and a few are ready to play now.
     *
     * HOW FAR BELOW DEPENDS ON HOW LONG HE HAS. A four-year programme signs
     * projects and grows them. A junior college gives its players two years of
     * eligibility, so half its roster leaves every summer and it has to sign men
     * who can play in October — recruiting eighteen-year-old projects into a
     * two-year programme is how a coach ends up permanently nine points below a
     * level he can never catch, which is exactly what made JUCO an impassable
     * wall in a sixty-season test career. */
    const band = rng.gauss(0, 1);
    const behind = 9 * clamp(info.eligibility / 4, 0.5, 1);
    const par = info.par - behind + band * 5.5;
    const made = buildRoster(`recruit:${opts.seed}:${opts.year}:${i}`, i, {
      par,
      size: 1,
      shape: { PG: 0, SG: 0, SF: 0, PF: 0, C: 0, [pos]: 1 } as Record<HoopsPosition, number>,
      ageSystem: 'class',
      eligibility: info.eligibility,
    });
    const player = made[0];
    player.years = 1;
    player.age = info.eligibility === 2 ? 19 : 18;
    // A recruit's ceiling is the point of him. Wider than a squad player's,
    // because nobody knows yet.
    const spread = rng.range(0, 1) ** 1.6;
    player.potential = clamp(
      player.overall + Math.round(4 + spread * 30), player.overall, 99,
    );
    player.overall = computeOverall(player.pos, player.attrs);

    /* THE RANKING, and why it is worth having an eye. Stars follow what he looks
     * like NOW plus a rumour about his ceiling, and both are noisy. A player
     * whose stars are below his real ceiling is the one worth finding. */
    const hype = player.overall + (player.potential - player.overall) * rng.range(0.1, 0.75);
    const stars = clamp(Math.round(1 + ((hype - (info.par - 14)) / 15)), 1, 5);

    // What a coach with no scouting sees: the ranking, blurred.
    const eye = clamp(opts.perks.evaluation, 0, 0.9);
    const margin = Math.round((1 - eye) * rng.range(5, 13) + 2);
    const bias = rng.range(-1, 1) * margin;

    out.push({
      id: `r${opts.year}-${i}`,
      player,
      stars,
      region: REGIONS[rng.int(0, REGIONS.length - 1)],
      wants: wantsFor(rng),
      interest: 0,
      suitors: [],
      offered: false,
      committedTo: null,
      contact: 0,
      scouted: false,
      seenOverall: clamp(Math.round(player.overall + bias), ATTR_MIN, 99),
      seenCeiling: clamp(
        Math.round(player.potential + bias * 0.8 + (1 - eye) * rng.range(-6, 6)),
        ATTR_MIN, 99,
      ),
      margin,
    });
  }

  /* RIVAL INTEREST, and the one place difficulty is allowed to touch it.
   *
   * Two knobs, both bounded. How MANY programmes are chasing him — more of them
   * on a harder tier, but never so many that the best of a dozen rolls beats
   * everything by arithmetic — and how HARD the ones chasing him push, which is
   * a shift up the same 0-100 scale the coach's own pitch is scored on rather
   * than a multiplier.
   *
   * The multiplier is what this used to be, and it made the top three tiers
   * unplayable: a baseline of forty times 2.2 is eighty-eight, which is above
   * anything a coach at a bottom-half programme can reach, so a ten-season test
   * career on Hard and above signed exactly zero recruits, every year, forever.
   * That is not a difficulty setting, it is a wall. */
  const push = opts.mods.rivalPush;

  /* NOT EVERY BOY IS WANTED, and how many programmes are on him follows where he
   * sits IN HIS OWN CLASS rather than how many stars he carries.
   *
   * Stars are a level-relative label: almost every prospect at a small high
   * school is a two-star, so counting suitors off stars gave every single player
   * at the level two or three programmes chasing him and left the bottom third of
   * the class — the players a programme at the bottom is actually built out of —
   * as contested as the top. A coach on the hard tiers then had nobody in the
   * whole class he could sign, and thirty-four seasons produced no championship
   * because there was nothing to build with.
   *
   * So: the top of a class has everybody on him. The bottom third has nobody. */
  const byDemand = [...out].sort(
    (a, b) => (b.seenOverall + b.stars * 4) - (a.seenOverall + a.stars * 4),
  );
  const rankOf = new Map(byDemand.map((p, i) => [p.id, i / Math.max(1, byDemand.length - 1)]));

  for (const p of out) {
    const demand = clamp(1 - (rankOf.get(p.id) ?? 0) * 1.4, 0, 1);
    const count = clamp(
      Math.round(demand * 4.5 * push + (p.stars - 3) * 0.5 + rng.range(-0.5, 1.2)),
      0, 8,
    );
    const pool = rng.shuffle([...opts.rivals]);
    for (let i = 0; i < Math.min(count, pool.length); i++) {
      /* What that programme is worth to HIM. The middle of the scale is a
       * programme of average standing making an ordinary approach — which a coach
       * who has offered, visited and fits what the boy wants should beat. What he
       * should not beat, without a real pitch, is a strong programme chasing a
       * player everybody wants. */
      const rival = pool[i];
      /* AND HE WOULD NOT PLAY THERE. The rivals chasing a recruit are mostly
       * better programmes than the one he would start at, and a player who wants
       * minutes knows exactly what that means — so the same thing that makes a
       * blue blood attractive makes it a place he might not get off the bench.
       * Without this the coach's side of the pitch was weighed on five things and
       * the rivals' on one, and "you will play here immediately" — the only card a
       * programme at the bottom ever holds — was worth nothing at all. */
      const bench = -0.25 - (rival.standing - 50) / 180;
      const ceiling = clamp(
        40 + (rival.standing - 50) * 0.5 + (p.stars - 3) * 3.5
        + (push - 1) * 16 + p.wants.minutes * bench * 30 + rng.range(-5, 5),
        0, 96,
      );
      p.suitors.push({
        teamId: rival.id,
        interest: clamp(rng.range(6, 26), 0, ceiling),
        ceiling,
      });
    }
  }
  return out.sort((a, b) => b.stars - a.stars || b.seenOverall - a.seenOverall);
}

export function newRecruitingClass(opts: ClassOptions): RecruitingState {
  return {
    year: opts.year,
    prospects: buildClass(opts),
    /* How many offers may be open at once — the coach's ATTENTION, which is the
     * real currency of recruiting.
     *
     * It is FOUR MORE THAN HE HAS PLACES FOR, because a flat limit is a wall at
     * exactly the programmes that need recruiting most. A junior college gives its
     * players two years of eligibility, so half the squad leaves every summer; a
     * coach there restocks seven places or he does not have a team. Held to four
     * offers he cannot, ever, and the level becomes a ceiling nobody climbs past
     * — which is precisely what a sixty-season test career kept running into. */
    offerLimit: Math.max(
      4, Math.min(16, opts.places + 4) + opts.mods.offers + opts.perks.extraOffers,
    ),
    week: 0,
    weeks: 8,
    news: [],
  };
}

/* ----------------------------------------------------------- the decision */

export interface InterestFactor {
  label: string;
  /** How much he cares, 0..1. */
  weight: number;
  /** How well you score on it, -1..1. */
  score: number;
  /** What to say about it. */
  note: string;
}

export interface ProgramPitch {
  teamId: string;
  /** 0..99, how the sport sees the programme. */
  standing: number;
  /** Last season's win percentage. */
  form: number;
  /** What the coach's tree is worth. */
  perks: CoachPerks;
  /** The squad as it will be. */
  needs: RosterNeeds;
  /** Which region the programme is in. */
  region: string;
  level: HoopsLevel;
  /**
   * What the SPORT thinks of the coach, 0..100, independent of the programme he
   * happens to be at. This is how a career compounds: the man who has won four
   * championships recruits above the job he took, which is the only way a climb
   * through nine levels ever accelerates.
   */
  reputation: number;
}

/**
 * Why a recruit would or would not come. Every line of this is shown to the
 * coach, because a pitch he cannot understand is a pitch he cannot make.
 */
export function interestFactors(p: Prospect, prog: ProgramPitch): InterestFactor[] {
  const need = prog.needs.byPos[p.player.pos];
  const outlook = playingTimeOutlook(need, p.player.overall, p.player.potential);
  const out: InterestFactor[] = [];

  out.push({
    label: PRIORITY_LABEL.minutes,
    weight: p.wants.minutes,
    score: outlook.appeal,
    note: outlook.text,
  });
  out.push({
    label: PRIORITY_LABEL.winning,
    weight: p.wants.winning,
    score: clamp((prog.form - 0.5) * 2.4, -1, 1),
    note: prog.form >= 0.62 ? 'You have been winning'
      : prog.form >= 0.45 ? 'A respectable programme'
        : 'You have not won much lately',
  });
  const dev = clamp((prog.perks.development - 1) * 1.6 + prog.perks.ceilingLift / 10, -1, 1);
  out.push({
    label: PRIORITY_LABEL.development,
    weight: p.wants.development,
    score: dev,
    note: dev > 0.35 ? 'Players get visibly better here'
      : dev > 0 ? 'Some development staff in place'
        : 'No development programme to speak of',
  });
  out.push({
    label: PRIORITY_LABEL.prestige,
    weight: p.wants.prestige,
    // Divided by 65 rather than 45: standing is a WITHIN-LEVEL measure and the
    // rival side of the same duel reads it at half a point per point, so scoring
    // the coach's own programme on a steeper curve than his rivals' punished him
    // twice for the same fact.
    score: clamp((prog.standing - 45) / 65, -0.8, 0.85),
    note: prog.standing >= 75 ? 'One of the best programmes at this level'
      : prog.standing >= 45 ? 'A solid name'
        : 'Nobody has heard of you',
  });
  const near = p.region === 'in state' ? 0.8 : p.region === 'nearby' ? 0.3 : -0.4;
  out.push({
    label: PRIORITY_LABEL.home,
    weight: p.wants.home,
    score: near,
    note: `He is from ${p.region}`,
  });
  return out;
}

/** What the coach himself is worth to a recruit, over and above the programme. */
function stature(prog: ProgramPitch): number {
  return clamp((prog.reputation - 34) / 66, -0.5, 1) * 13;
}

/** What the programme is worth to this player, 0..100. */
export function interestTarget(p: Prospect, prog: ProgramPitch, mods: TierMods): number {
  const factors = interestFactors(p, prog);
  let sum = 0;
  let weight = 0;
  for (const f of factors) {
    sum += f.score * f.weight;
    weight += f.weight;
  }
  const fit = weight > 0 ? sum / weight : 0;

  /* REACHING. A player ranked far above the programme chasing him is a long shot
   * and knows it, and a player ranked far below it knows that too. Both are real
   * and both are survivable — this is a penalty, not a wall. */
  const gap = p.seenOverall - (LEVELS[prog.level].par + (prog.standing - 50) / 8);
  const reach = clamp(-Math.max(0, gap - 4) * 1.4, -30, 0);

  const appeal = prog.perks.appeal * 22;
  return clamp(
    48 + fit * 40 + reach + appeal + stature(prog) - mods.pitchResistance * 0.5,
    0, 100,
  );
}

/* ---------------------------------------------------------------- the odds */

export type Odds = 'favourite' | 'contest' | 'longshot' | 'hopeless';

export interface ProspectOdds {
  /** Where you stand with him, 0..100. */
  mine: number;
  /** Where the programme chasing him hardest stands. */
  rival: number;
  rivalCount: number;
  odds: Odds;
  label: string;
  /** One line of advice a coach can act on. */
  note: string;
}

const ODDS_LABEL: Record<Odds, string> = {
  favourite: 'Favourite',
  contest: 'A real fight',
  longshot: 'Long shot',
  hopeless: 'Not realistic',
};

/**
 * WHETHER YOU CAN ACTUALLY GET HIM, which is the single most important thing on
 * a recruiting board and the one a coach cannot work out for himself.
 *
 * A programme at the bottom of its level does not sign the best player in the
 * class; it signs the players nobody else has called, and turns them into the
 * best players in the class. Nothing teaches that unless the board says it out
 * loud — a test career that chased the top of the board every year signed one
 * player in eleven offers, and the same career chasing the unwanted signed eight.
 */
export function prospectOdds(
  p: Prospect, prog: ProgramPitch, mods: TierMods,
): ProspectOdds {
  const target = interestTarget(p, prog, mods);
  const mine = p.offered ? Math.max(p.interest, target) : target;
  const rival = p.suitors.reduce(
    (n, s) => Math.max(n, s.interest, s.ceiling), 0,
  );
  const lead = mine - rival;
  const odds: Odds = lead > 10 ? 'favourite'
    : lead > -4 ? 'contest'
      : lead > -18 ? 'longshot' : 'hopeless';
  const note = p.suitors.length === 0
    ? 'Nobody else has called him'
    : odds === 'favourite' ? `Ahead of ${p.suitors.length} other programme`
      + `${p.suitors.length === 1 ? '' : 's'}`
      : odds === 'contest' ? 'This one comes down to the pitch'
        : odds === 'longshot' ? 'Somebody bigger is ahead of you'
          : 'He is not coming here';
  return { mine: Math.round(mine), rival: Math.round(rival), rivalCount: p.suitors.length, odds, label: ODDS_LABEL[odds], note };
}

/* ------------------------------------------------------------- the cycle */

export interface CycleInput {
  state: RecruitingState;
  teamId: string;
  prog: ProgramPitch;
  perks: CoachPerks;
  mods: TierMods;
  seed: number | string;
  /** Places actually open on the roster. Nobody signs over the cap. */
  openSpots: number;
}

/**
 * One week of the recruiting cycle.
 *
 * Interest moves toward the target for everybody you have offered, rivals push
 * on everybody, and at the end of the cycle the players decide. Nothing here is
 * a coin flip on the day: a player who has been warm for six weeks commits, and
 * a player nobody talked to does not.
 */
export function advanceWeek(input: CycleInput): string[] {
  const { state, prog, perks, mods } = input;
  const rng = new Rng(`hoops:recruit:${input.seed}:${state.year}:${state.week}`);
  const news: string[] = [];
  state.week++;

  for (const p of state.prospects) {
    if (p.committedTo) continue;

    // Your own push. Only on players you have actually offered: attention is the
    // scarce thing in recruiting, and that is what the offer limit models.
    if (p.offered) {
      p.contact++;
      const target = interestTarget(p, prog, mods);
      const rate = 0.32 * perks.interestGain * mods.interestGain;
      p.interest += (target - p.interest) * rate;
      // Scouting happens by being around him.
      if (!p.scouted && p.contact >= 3) {
        p.scouted = true;
        const eye = clamp(perks.evaluation + 0.35, 0, 0.95);
        p.margin = Math.max(1, Math.round(p.margin * (1 - eye)));
        p.seenOverall = clamp(
          Math.round(p.player.overall + rng.range(-1, 1) * p.margin), 25, 99,
        );
        p.seenCeiling = clamp(
          Math.round(p.player.potential + rng.range(-1, 1) * p.margin * 1.2), 25, 99,
        );
        news.push(`Scouting report in on ${p.player.first} ${p.player.last}`);
      }
    } else {
      // He cools on a programme that is not calling.
      p.interest = Math.max(0, p.interest - 2.5);
    }

    // The rest of the sport, converging on what each programme is worth to him
    // rather than climbing at a fixed rate until it wins by default.
    for (const s of p.suitors) {
      s.interest = clamp(s.interest + (s.ceiling - s.interest) * 0.3, 0, 100);
    }
  }

  /* Decisions. A player commits when somebody is clearly ahead and he has had
   * long enough to be sure.
   *
   * `room` counts DOWN as players commit. It used to be read once per week, which
   * meant the last week of a cycle handed the coach every prospect still leading
   * for him at once — thirteen signatures for five places, with the surplus
   * silently thrown away at the roster cap. */
  let room = input.openSpots;
  const late = state.week >= state.weeks - 2;
  for (const p of state.prospects) {
    if (p.committedTo) continue;
    const mine = p.offered ? p.interest + perks.closing * 100 : -1;
    const best = p.suitors.reduce(
      (b, s) => (s.interest > b.interest ? s : b),
      { teamId: '', interest: -1 } as Suitor,
    );
    const leader = mine >= best.interest ? input.teamId : best.teamId;
    const lead = Math.abs(mine - best.interest);
    const ready = late ? lead > 4 : lead > 22 && Math.max(mine, best.interest) > 66;
    if (!ready || !leader) continue;
    if (leader === input.teamId && room <= 0) continue;
    p.committedTo = leader;
    if (leader === input.teamId) {
      room--;
      news.push(`${p.player.first} ${p.player.last} (${p.player.pos}) has committed to you`);
    } else if (p.offered) {
      news.push(`${p.player.first} ${p.player.last} has gone elsewhere`);
    }
  }

  // The last week: everybody left decides.
  if (state.week >= state.weeks) {
    for (const p of state.prospects) {
      if (p.committedTo) continue;
      const mine = p.offered ? p.interest + perks.closing * 100 : -1;
      const best = p.suitors.reduce(
        (b, s) => (s.interest > b.interest ? s : b),
        { teamId: '', interest: -1 } as Suitor,
      );
      if (mine > best.interest && room > 0) {
        p.committedTo = input.teamId;
        room--;
        news.push(`${p.player.first} ${p.player.last} (${p.player.pos}) signs with you`);
      } else if (best.teamId) {
        p.committedTo = best.teamId;
      } else {
        p.committedTo = 'unsigned';
      }
    }
  }

  state.news = [...news, ...state.news].slice(0, 40);
  return news;
}

export const committedTo = (state: RecruitingState, teamId: string): Prospect[] =>
  state.prospects.filter((p) => p.committedTo === teamId);

export const openOffers = (state: RecruitingState): number =>
  state.prospects.filter((p) => p.offered && !p.committedTo).length;

export function makeOffer(state: RecruitingState, id: string): string | null {
  const p = state.prospects.find((x) => x.id === id);
  if (!p) return 'No such prospect';
  if (p.committedTo) return 'He has already decided';
  if (p.offered) return null;
  if (openOffers(state) >= state.offerLimit) {
    return `You can only have ${state.offerLimit} offers open at once`;
  }
  p.offered = true;
  // An offer is a real signal. It is worth something on its own.
  p.interest = Math.max(p.interest, 14);
  return null;
}

export function withdrawOffer(state: RecruitingState, id: string): void {
  const p = state.prospects.find((x) => x.id === id);
  if (p && !p.committedTo) {
    p.offered = false;
    p.interest = Math.max(0, p.interest - 12);
  }
}

/** The class as a grade, which is the one number a coach is judged on. */
export function classGrade(
  state: RecruitingState, teamId: string,
): { grade: string; score: number; signed: number } {
  const mine = committedTo(state, teamId);
  if (!mine.length) return { grade: '—', score: 0, signed: 0 };
  const score = mine.reduce((n, p) => n + p.stars * 10 + p.player.potential - 40, 0)
    / mine.length + mine.length * 3;
  const grade = score >= 78 ? 'A+' : score >= 70 ? 'A' : score >= 62 ? 'B+'
    : score >= 54 ? 'B' : score >= 46 ? 'C+' : score >= 38 ? 'C' : 'D';
  return { grade, score: Math.round(score), signed: mine.length };
}

/** What a coach is told about a prospect, honestly hedged. */
export function reportText(p: Prospect): string {
  if (!p.scouted) {
    return `Ranked ${p.stars}-star. Nobody from your staff has watched him yet.`;
  }
  const spread = p.margin;
  return `Your staff has him around ${p.seenOverall} (±${spread}),`
    + ` with a ceiling near ${p.seenCeiling}.`;
}
