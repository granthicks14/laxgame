import { h } from '../../dom';
import { starters, type HoopsPlayer, type HoopsTeam } from '../../../sports/basketball/data';
import type { HoopsConfig } from '../../../sports/basketball/types';

/* ---------------------------------------------------------------------------
 * THE BROADCAST
 * ---------------------------------------------------------------------------
 * Everything that happens around the basketball rather than in it: the lineups
 * before the tip, the card between quarters, the plate on a free throw, and the
 * one moment in a season that has to feel different from every other basket.
 *
 * WHY IT IS A SEPARATE FILE. A game screen's job is the loop — input, step,
 * draw — and every presentation beat bolted into it is another branch inside the
 * sixty-times-a-second path. These are DOM cards with their own lifetimes: the
 * screen tells one to appear and forgets about it.
 *
 * THE RULE THEY ALL FOLLOW: a beat may pause the game, but it may NEVER take
 * longer to get out of the way than the player wants it to. Every card here
 * dismisses on any input and on its own timer, whichever comes first. A
 * presentation that cannot be skipped is a presentation that is watched once and
 * resented for the rest of a twenty-year career.
 * ------------------------------------------------------------------------- */

/** How a beat ends: on its own, or because somebody pressed something. */
export type BeatEnd = () => void;

/* ---------------------------------------------------------------- lineups */

/**
 * THE STARTING FIVES, before the tip.
 *
 * The one moment a coach sees his team as a team rather than as ten dots, and
 * the reason it is worth two seconds: a squad he recruited, developed and picked
 * has names, and a game that never says them is a game about dots.
 */
export function lineupCard(
  config: HoopsConfig, onDone: BeatEnd,
): { el: HTMLElement; dismiss: BeatEnd } {
  const side = (team: HoopsTeam, roster: HoopsPlayer[], home: boolean): HTMLElement =>
    h('div', { class: `bcast-five bcast-five--${home ? 'home' : 'away'}` },
      h('div', {
        class: 'bcast-five__badge',
        style: `background:${team.primary};border-color:${team.secondary}`,
        text: team.abbr,
      }),
      h('div', { class: 'bcast-five__club', text: `${team.city} ${team.name}` }),
      h('div', { class: 'bcast-five__list' },
        ...starters(roster).map((p, i) => h('div', {
          class: 'bcast-five__man',
          style: `animation-delay:${60 + i * 55}ms`,
        },
        h('span', { class: 'bcast-five__pos', text: p.pos }),
        h('span', { class: 'bcast-five__name', text: `${p.first} ${p.last}` }),
        h('span', { class: 'bcast-five__ovr num', text: String(p.overall) })))));

  const el = h('div', { class: 'bcast bcast--lineups' },
    h('div', { class: 'bcast__inner' },
      h('div', { class: 'bcast__kicker', text: config.label ?? 'Tip off' }),
      h('div', { class: 'bcast__fives' },
        side(config.away.team, config.away.roster, false),
        h('div', { class: 'bcast__at', text: 'AT' }),
        side(config.home.team, config.home.roster, true)),
      h('div', { class: 'bcast__hint', text: 'Press anything to start' })));

  return { el, dismiss: onDone };
}

/* ---------------------------------------------------------- between quarters */

export interface QuarterCardInput {
  /** "END OF THE FIRST", "HALF TIME", "END OF THE THIRD". */
  title: string;
  home: HoopsTeam;
  away: HoopsTeam;
  homeScore: number;
  awayScore: number;
  /** Quarter by quarter, home then away, as far as it has been played. */
  byQuarter: { home: number[]; away: number[] };
  /** The line worth reading out, if anybody has one yet. */
  star: string | null;
}

/**
 * THE CARD BETWEEN QUARTERS.
 *
 * A scoreline is not a story; a quarter-by-quarter line is. This is the screen
 * that tells a coach he has been outscored 22-9 in the third, which is the
 * single most useful thing anybody can tell him, and it is information he
 * currently has no way at all of getting.
 */
export function quarterCard(
  input: QuarterCardInput, onDone: BeatEnd,
): { el: HTMLElement; dismiss: BeatEnd } {
  const played = Math.max(input.byQuarter.home.length, input.byQuarter.away.length);
  const head = ['', ...Array.from({ length: played }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`)), 'T'];
  const row = (team: HoopsTeam, line: number[], total: number, lead: boolean): HTMLElement =>
    h('div', { class: `bcast-line${lead ? ' is-lead' : ''}` },
      h('span', {
        class: 'bcast-line__badge',
        style: `background:${team.primary};border-color:${team.secondary}`,
        text: team.abbr,
      }),
      ...Array.from({ length: played }, (_, i) =>
        h('span', { class: 'bcast-line__q num', text: String(line[i] ?? 0) })),
      h('span', { class: 'bcast-line__t num', text: String(total) }));

  const el = h('div', { class: 'bcast bcast--quarter' },
    h('div', { class: 'bcast__inner' },
      h('div', { class: 'bcast__kicker', text: input.title }),
      h('div', { class: 'bcast-sheet' },
        h('div', { class: 'bcast-line bcast-line--head' },
          ...head.map((t, i) => h('span', {
            class: i === 0 ? 'bcast-line__badge bcast-line__badge--blank'
              : i === head.length - 1 ? 'bcast-line__t' : 'bcast-line__q',
            text: t,
          }))),
        row(input.away, input.byQuarter.away, input.awayScore,
          input.awayScore > input.homeScore),
        row(input.home, input.byQuarter.home, input.homeScore,
          input.homeScore > input.awayScore)),
      input.star ? h('div', { class: 'bcast__star', text: input.star }) : null,
      h('div', { class: 'bcast__hint', text: 'Press anything to play on' })));

  return { el, dismiss: onDone };
}

/* ------------------------------------------------------------- free throws */

/**
 * THE MAN ON THE LINE.
 *
 * A free throw is the only moment in basketball where the whole building looks
 * at one player, and it was the only moment in this game that looked exactly
 * like every other. A small plate with his name, his season percentage and how
 * many he has left costs nothing and turns dead time into a beat.
 *
 * It does NOT pause anything: a free throw already has its own pause, and a card
 * on top of it would double it.
 */
export function freeThrowPlate(
  shooter: string, pct: number, of: { shot: number; total: number },
): HTMLElement {
  return h('div', { class: 'bcast-ft' },
    h('div', { class: 'bcast-ft__name', text: shooter }),
    h('div', { class: 'bcast-ft__row' },
      h('span', { class: 'bcast-ft__pct num', text: `${Math.round(pct * 100)}%` }),
      h('span', { class: 'bcast-ft__lbl', text: 'from the line' }),
      h('span', { class: 'bcast-ft__count', text: `${of.shot} of ${of.total}` })));
}

/* -------------------------------------------------------- the big moment */

export type BigMomentKind = 'buzzer' | 'winner' | 'tie';

/**
 * A SHOT THAT MATTERS.
 *
 * The brief for this was one sentence: a buzzer-beater should feel dramatically
 * different from a normal mid-game basket. It does three things a normal basket
 * does not — the picture goes to slow motion, the building goes white for a
 * frame, and the card names the man — and it is the only place in the game that
 * is allowed to do any of them, because a flourish that happens every possession
 * is not a flourish, it is a nuisance.
 */
export function bigMoment(kind: BigMomentKind, shooter: string, detail: string): HTMLElement {
  const title = kind === 'winner' ? 'GAME WINNER'
    : kind === 'tie' ? 'HE TIED IT' : 'AT THE BUZZER';
  return h('div', { class: `bcast-moment bcast-moment--${kind}` },
    h('div', { class: 'bcast-moment__title', text: title }),
    h('div', { class: 'bcast-moment__who', text: shooter }),
    h('div', { class: 'bcast-moment__detail', text: detail }));
}

/* ------------------------------------------------------------- the replay */

/**
 * THE BAR ACROSS A HIGHLIGHT.
 *
 * Black bands top and bottom, a pulsing dot, and what is being shown. The bands
 * are the whole trick: they say "this is not live" without a word, which matters
 * because a player watching a replay he does not know is a replay is a player
 * pressing buttons at nothing.
 */
export function replayTag(label: string): HTMLElement {
  return h('div', { class: 'replay-strip' },
    h('div', { class: 'replay-strip__bar replay-strip__bar--top' }),
    h('div', { class: 'replay-strip__bar replay-strip__bar--bottom' }),
    h('div', { class: 'replay-strip__tag' },
      h('span', { class: 'replay-strip__dot' }),
      h('span', { class: 'replay-strip__label', text: label })),
    h('div', { class: 'replay-strip__skip', text: 'Press anything to skip' }));
}
