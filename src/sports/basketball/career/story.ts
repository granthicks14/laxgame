import type { SimResult } from '../sim';
import type { TeamBox } from '../types';
import type { Side } from '../court';

/* ---------------------------------------------------------------------------
 * WHAT HAPPENED IN THAT GAME
 * ---------------------------------------------------------------------------
 * A simulated season is a list of scorelines, and a list of scorelines is not a
 * season. This turns one result into the sentence a coach would say about it.
 *
 * EVERY LINE IS DERIVED FROM THE BOX SCORE, which is the only reason it is worth
 * reading. A comeback line appears only when a side genuinely trailed at the
 * break. A shooting line appears only when somebody genuinely shot the lights
 * out. A grind appears only when both sides genuinely could not score. Nothing
 * here is picked from a hat, so the story can never describe a game that did not
 * happen — and because the stories are ordered strongest-signal-first, a game
 * gets the ONE description that actually defines it rather than four generic ones.
 *
 * These are basketball's own signals: quarters, the arc, the paint, the break,
 * the line, the glass. That is what makes the recap of a basketball game read
 * like basketball.
 * ------------------------------------------------------------------------- */

export type StoryKind =
  | 'blowout' | 'thriller' | 'overtime' | 'comeback' | 'collapse'
  | 'arc' | 'paint' | 'break' | 'glass' | 'cold' | 'grind' | 'foulfest'
  | 'clinical' | 'routine';

export interface GameStory {
  kind: StoryKind;
  /** Short, for a heading. */
  headline: string;
  /** One sentence, always true of this game. */
  line: string;
}

export interface StoryContext {
  yourAbbr: string;
  theirAbbr: string;
}

/**
 * ONE INPUT, BOTH ENGINES.
 *
 * The played engine and the fast one produce the same box score by design, so a
 * recap should not know or care which one played the game — otherwise there would
 * be two versions of every rule below and they would drift apart within a month.
 */
export interface StoryInput {
  myScore: number;
  theirScore: number;
  mine: TeamBox;
  theirs: TeamBox;
  myQuarters: number[];
  theirQuarters: number[];
  overtime: number;
}

/** A recap of a simulated fixture. */
export function simStory(r: SimResult, side: Side, ctx: StoryContext): GameStory {
  const home = side === 'home';
  return gameStory({
    myScore: home ? r.home.score : r.away.score,
    theirScore: home ? r.away.score : r.home.score,
    mine: home ? r.home.box : r.away.box,
    theirs: home ? r.away.box : r.home.box,
    myQuarters: home ? r.byQuarter.home : r.byQuarter.away,
    theirQuarters: home ? r.byQuarter.away : r.byQuarter.home,
    overtime: r.overtime,
  }, ctx);
}

/** A recap of a game the coach actually coached. */
export function playedStory(
  game: { score: Record<Side, number>; box: Record<Side, TeamBox>; overtime: number },
  side: Side, ctx: StoryContext,
): GameStory {
  const other: Side = side === 'home' ? 'away' : 'home';
  return gameStory({
    myScore: game.score[side],
    theirScore: game.score[other],
    mine: game.box[side],
    theirs: game.box[other],
    myQuarters: game.box[side].byQuarter,
    theirQuarters: game.box[other].byQuarter,
    overtime: game.overtime,
  }, ctx);
}

const pct = (a: number, b: number): number => (b > 0 ? a / b : 0);

/** Points a side had scored by the end of the first half. */
function halfway(q: number[]): number {
  return (q[0] ?? 0) + (q[1] ?? 0);
}

export function gameStory(input: StoryInput, ctx: StoryContext): GameStory {
  const { mine, theirs, myQuarters: myQ, theirQuarters: theirQ } = input;
  const my = input.myScore;
  const their = input.theirScore;

  const won = my > their;
  const margin = Math.abs(my - their);
  const halfLead = halfway(myQ) - halfway(theirQ);
  const us = ctx.yourAbbr;
  const them = ctx.theirAbbr;

  /* 1. OVERTIME BEATS EVERYTHING. If it needed extra time, that is the game. */
  if (input.overtime > 0) {
    return {
      kind: 'overtime',
      headline: input.overtime > 1 ? `${input.overtime} overtimes` : 'Overtime',
      line: won
        ? `${us} found a way in the extra period, ${my}-${their}.`
        : `${them} took it in the extra period, ${their}-${my}.`,
    };
  }

  /* 2. A GAME TURNED AROUND. Down at the break by double figures and won it, or
   *    the reverse — and both are read off the quarters, not asserted. */
  if (won && halfLead <= -10) {
    return {
      kind: 'comeback',
      headline: 'Back from the dead',
      line: `Down ${Math.abs(halfLead)} at the half and won it ${my}-${their}. `
        + `The third quarter was ${myQ[2] ?? 0}-${theirQ[2] ?? 0}.`,
    };
  }
  if (!won && halfLead >= 10) {
    return {
      kind: 'collapse',
      headline: 'Threw it away',
      line: `Up ${halfLead} at the half and lost ${their}-${my}. `
        + `${theirQ[3] ?? 0} points conceded in the fourth.`,
    };
  }

  /* 3. THE MARGIN, at both ends of it. */
  if (margin >= 25) {
    return {
      kind: 'blowout',
      headline: won ? 'Never in doubt' : 'Run off the floor',
      line: won
        ? `${my}-${their}. The starters watched the fourth from the bench.`
        : `${their}-${my}. There is no reading of this one that flatters ${us}.`,
    };
  }

  /* 4. WHAT DECIDED IT. In order of how loud the signal is. */
  const myTp = pct(mine.tpm, mine.tpa);
  if (mine.tpa >= 12 && myTp >= 0.45) {
    return {
      kind: 'arc',
      headline: 'It rained',
      line: `${mine.tpm} of ${mine.tpa} from the arc, ${Math.round(myTp * 100)} per cent`
        + `${won ? ` — and that is the game, ${my}-${their}.` : `, and still lost ${their}-${my}.`}`,
    };
  }
  if (mine.tpa >= 12 && myTp <= 0.22) {
    return {
      kind: 'cold',
      headline: 'Ice cold',
      line: `${mine.tpm} of ${mine.tpa} from three. `
        + `${won ? `Won ${my}-${their} without a jump shot.` : `You cannot win shooting like that.`}`,
    };
  }
  if (mine.paintPoints >= my * 0.56 && my > 0) {
    return {
      kind: 'paint',
      headline: 'Won it inside',
      line: `${mine.paintPoints} of ${my} points in the paint. `
        + `${won ? 'Nobody wanted to step across and help.' : 'It was not enough.'}`,
    };
  }
  if (mine.fastBreak >= 14 && theirs.turnovers >= 14) {
    return {
      kind: 'break',
      headline: 'Turnovers into points',
      line: `${theirs.turnovers} turnovers forced and ${mine.fastBreak} points off the break.`,
    };
  }
  if (mine.offReb >= 14) {
    return {
      kind: 'glass',
      headline: 'Owned the glass',
      line: `${mine.offReb} offensive rebounds. Every miss came back.`,
    };
  }
  if (mine.fouls + theirs.fouls >= 46) {
    return {
      kind: 'foulfest',
      headline: 'Whistle-blown',
      line: `${mine.fouls + theirs.fouls} fouls between them and `
        + `${mine.fta + theirs.fta} free throws. Nobody enjoyed it.`,
    };
  }
  if (my + their <= 95) {
    return {
      kind: 'grind',
      headline: 'A grind',
      line: `${my}-${their}, and neither side could get anything easy.`,
    };
  }
  if (margin <= 3) {
    return {
      kind: 'thriller',
      headline: won ? 'Held on' : 'One that got away',
      line: `${Math.max(my, their)}-${Math.min(my, their)}. `
        + `Decided in the last minute, one way or the other.`,
    };
  }
  if (won && pct(mine.fgm, mine.fga) >= 0.5 && mine.turnovers <= 10) {
    return {
      kind: 'clinical',
      headline: 'Clinical',
      line: `${Math.round(pct(mine.fgm, mine.fga) * 100)} per cent from the floor and `
        + `${mine.turnovers} turnovers. A coach's game.`,
    };
  }
  return {
    kind: 'routine',
    headline: won ? `Beat ${them}` : `Lost to ${them}`,
    line: `${my}-${their}. ${won ? 'Two points in the table.' : 'On to the next one.'}`,
  };
}
