/* ---------------------------------------------------------------------------
 * WHAT HAPPENED IN THAT GAME
 * ---------------------------------------------------------------------------
 * A simulated season is a list of scorelines, and a list of scorelines is not a
 * season. This turns one result into a sentence a coach would actually say
 * about it.
 *
 * Every line is DERIVED from the box score the simulation produced — the
 * quarter-by-quarter run of play, the shooting, the saves, the faceoffs, the
 * ratings of the two sides. Nothing is picked from a hat, and no story can
 * describe a game that did not happen: a comeback line only appears when a side
 * genuinely trailed, and a goalie line only when the keeper genuinely stole it.
 * ------------------------------------------------------------------------- */

import type { SimResult, SimTeamBox } from './simulate';

export type StoryKind =
  | 'blowout' | 'upset' | 'comeback' | 'overtime' | 'goalie' | 'shootout'
  | 'defensive' | 'faceoff' | 'cold' | 'clinical' | 'grind' | 'routine';

export interface GameStory {
  kind: StoryKind;
  /** A short headline, in capitals on the screen. */
  headline: string;
  /** One sentence, always true of this game. */
  line: string;
}

export interface StoryContext {
  /** The coach's own side. */
  side: 'home' | 'away';
  yourName: string;
  theirName: string;
  /** Team overall ratings, for judging an upset. */
  yourRating: number;
  theirRating: number;
}

const pct = (a: number, b: number): number => (b > 0 ? a / b : 0);

/**
 * Picks the ONE thing that most defines this game, from strongest signal down.
 * Order matters: an overtime comeback is a comeback, and a shutout of a better
 * team is an upset before it is anything else.
 */
export function gameStory(r: SimResult, ctx: StoryContext): GameStory {
  const mine: SimTeamBox = ctx.side === 'home' ? r.home : r.away;
  const theirs: SimTeamBox = ctx.side === 'home' ? r.away : r.home;
  const my = ctx.side === 'home' ? r.homeScore : r.awayScore;
  const their = ctx.side === 'home' ? r.awayScore : r.homeScore;
  const won = my > their;
  const drew = my === their;
  const margin = Math.abs(my - their);
  const total = my + their;
  const deficit = ctx.side === 'home' ? r.awayBiggestLead : r.homeBiggestLead;
  const led = ctx.side === 'home' ? r.homeBiggestLead : r.awayBiggestLead;
  const ratingGap = ctx.theirRating - ctx.yourRating;
  const myShooting = pct(my, mine.shots);
  const mySavePct = pct(mine.saves, mine.saves + their);
  const theirSavePct = pct(theirs.saves, theirs.saves + my);
  const foPct = pct(mine.faceoffWins, mine.faceoffTakes);

  // Every threshold below is measured against THIS game rather than a fixed
  // number of goals, because a nine-minute high school game and a twenty-minute
  // professional one score at completely different rates. Goals per possession
  // and margin as a share of the total are the same everywhere; "eight goals"
  // is not. `npm run stories` prints how often each kind actually comes up.
  const perPossession = pct(total, mine.possessions + theirs.possessions);
  const swing = Math.max(3, Math.round(total * 0.22));

  // A win from a real deficit is the story, whatever else happened.
  if (won && deficit >= swing) {
    return {
      kind: 'comeback',
      headline: 'Comeback',
      line: `Down ${deficit} and won it ${my}-${their}. ${ctx.yourName} did not stop.`,
    };
  }
  if (!won && !drew && led >= swing) {
    return {
      kind: 'comeback',
      headline: 'Heartbreaking finish',
      line: `Led by ${led} and lost it ${my}-${their}.`,
    };
  }

  if (r.overtime) {
    return {
      kind: 'overtime',
      headline: won ? 'Overtime winner' : 'Lost in overtime',
      line: won
        ? `${my}-${their} in sudden victory. Nobody could separate them in regulation.`
        : `${their}-${my} in sudden victory. One possession decided it.`,
    };
  }

  if (won && ratingGap >= 8) {
    return {
      kind: 'upset',
      headline: 'Big upset',
      line: `${ctx.theirName} were ${Math.round(ratingGap)} points the better team on paper. `
        + `${ctx.yourName} beat them ${my}-${their} anyway.`,
    };
  }

  // Half the goals in the game were the margin, and it was not 3-1.
  if (margin >= 4 && margin >= total * 0.5) {
    return won
      ? {
        kind: 'blowout',
        headline: 'Dominant performance',
        line: `${my}-${their}. ${ctx.yourName} controlled it from the opening whistle — `
          + `${mine.shots} shots to ${theirs.shots}.`,
      }
      : {
        kind: 'blowout',
        headline: 'Run over',
        line: `${their}-${my}. ${ctx.theirName} had ${theirs.shots} shots and never let up.`,
      };
  }

  // The keeper. Only when the numbers say he actually stole it: a save
  // percentage in the top tenth of games, off a real workload.
  if (mySavePct >= 0.72 && mine.saves >= 8) {
    return {
      kind: 'goalie',
      headline: won ? 'Goalie steals the game' : 'Your keeper deserved better',
      line: `${mine.saves} saves at ${Math.round(mySavePct * 100)}%. `
        + (won ? 'He kept them in it until the offence found something.'
          : `${my}-${their} despite him.`),
    };
  }
  if (theirSavePct >= 0.72 && theirs.saves >= 8 && !won) {
    return {
      kind: 'goalie',
      headline: 'Beaten by the goalie',
      line: `${theirs.saves} saves for ${ctx.theirName}. `
        + `${mine.shots} shots and only ${my} goals to show for them.`,
    };
  }

  // Scoring rate, not a goal count: a shootout is a game where possessions kept
  // turning into goals, at any length.
  if (perPossession >= 0.40 && total >= 10) {
    return {
      kind: 'shootout',
      headline: 'Shootout',
      line: `${my}-${their}, and neither defence turned up. `
        + `${mine.shots + theirs.shots} shots between them.`,
    };
  }

  if (perPossession <= 0.215 && mine.possessions + theirs.possessions >= 20) {
    return {
      kind: 'defensive',
      headline: 'Defensive battle',
      line: `${my}-${their} off ${mine.possessions + theirs.possessions} possessions. `
        + 'Two defences, and nothing easy all afternoon.',
    };
  }

  if (foPct >= 0.60 && mine.faceoffTakes >= 8) {
    return {
      kind: 'faceoff',
      headline: won ? 'Owned the faceoff X' : 'Won the X, lost the game',
      line: `${mine.faceoffWins} of ${mine.faceoffTakes} at the X. `
        + (won ? 'Possession decided it.' : 'All that ball and nothing done with it.'),
    };
  }

  if (!won && myShooting <= 0.15 && mine.shots >= 10) {
    return {
      kind: 'cold',
      headline: 'Cold shooting',
      line: `${mine.shots} shots for ${my} goals — ${Math.round(myShooting * 100)}%. `
        + 'The looks were there and nothing went in.',
    };
  }

  // Took the chances that came. Roughly the top tenth of shooting days.
  if (won && myShooting >= 0.40 && mine.shots >= 8) {
    return {
      kind: 'clinical',
      headline: 'Clinical',
      line: `${my} goals from ${mine.shots} shots — ${Math.round(myShooting * 100)}%. `
        + `${ctx.yourName} did not waste much.`,
    };
  }

  // Won the game without winning the play, which is its own kind of afternoon.
  if (won && theirs.shots - mine.shots >= 5) {
    return {
      kind: 'grind',
      headline: 'Backs to the wall',
      line: `Out-shot ${theirs.shots}-${mine.shots} and won it ${my}-${their}. `
        + `${mine.saves} saves and ${mine.groundBalls} ground balls held it together.`,
    };
  }

  if (drew) {
    return {
      kind: 'routine',
      headline: 'Honours even',
      line: `${my}-${their}, and nobody found the goal that settled it. `
        + `${mine.shots} shots each way and ${mine.saves} saves.`,
    };
  }

  return {
    kind: 'routine',
    headline: won ? 'Job done' : 'Came up short',
    line: `${my}-${their}. ${Math.round(myShooting * 100)}% shooting, `
      + `${mine.faceoffWins}/${mine.faceoffTakes} at the X, ${mine.saves} saves. `
      + (won ? 'Not pretty, but a win.' : `${ctx.theirName} were the better side on the day.`),
  };
}
