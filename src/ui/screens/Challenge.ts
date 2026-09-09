/* ---------------------------------------------------------------------------
 * CHALLENGE MODE SCREENS
 * ---------------------------------------------------------------------------
 * Four screens, in the order a career meets them:
 *
 *   ChallengeEntryScreen   start or continue, and the pitch for what this is
 *   ChallengeTrackerScreen the ladder, the record, and the legacy so far
 *   JobOffersScreen        the decision that moves the career
 *   ChallengeEndScreen     what the whole thing added up to
 * ------------------------------------------------------------------------- */

import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, emptyPanel, fieldRow, segmented, teamBadge } from '../components';
import { deleteCareer, loadCareer, saveCareer } from '../../state/saves';
import {
  challengeLegacy, declineChallengeOffers, seekChallengeJob, startChallenge,
  takeChallengeJob, userTeam,
} from '../../league/career';
import type { Career } from '../../league/types';
import { STAGES, stageAt, stageDivisionName } from '../../challenge/ladder';
import { SITUATIONS } from '../../challenge/situations';
import {
  CHAPTERS, chapterOf, completesChapter, type JobOffer,
} from '../../challenge/state';
import { effectiveTeam } from '../../league/career';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyKey } from '../../data/difficulty';
import { GAME_LENGTHS, type GameLengthKey } from '../../data/constants';
import { SeasonHubScreen } from './SeasonHub';
import { MainMenuScreen } from './MainMenu';
import { trophyIcon } from '../icons';
import { ChallengeDifficultyScreen } from './ChallengeDifficulty';
import { DEFAULT_TIER, tierInfo, type ChallengeTier } from '../../challenge/difficulty';
import { UPGRADES, identityOf } from '../../challenge/coach';
import { recordCareer, type HallResult } from '../../state/hall';

/* ------------------------------------------------------------------ entry */

export class ChallengeEntryScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const existing = loadCareer('challenge');
    const draft = {
      difficulty: (existing?.difficulty ?? app.settings.difficulty) as DifficultyKey,
      gameLength: (existing?.gameLength ?? app.settings.gameLength) as GameLengthKey,
      tier: (app.settings.challengeTier ?? DEFAULT_TIER) as ChallengeTier,
    };

    // Choosing the difficulty is its own screen, because it is the single
    // biggest decision in the mode and it cannot be changed afterwards.
    const start = () => {
      app.push((a) => new ChallengeDifficultyScreen(a, draft.tier, (tier) => {
        a.updateSettings({ challengeTier: tier });
        const career = startChallenge({
          difficulty: draft.difficulty, gameLength: draft.gameLength, tier,
        });
        saveCareer(career);
        a.reset((b) => new SeasonHubScreen(b, 'challenge'));
      }));
    };

    const body: (HTMLElement | null)[] = [];

    if (existing && existing.challenge) {
      const state = existing.challenge;
      const stage = stageAt(state.stageIndex);
      body.push(panel('Career in progress',
        h('div', { class: 'row', style: 'gap:12px' },
          teamBadge(userTeam(existing), 'lg'),
          h('div', { class: 'stack', style: 'gap:3px;flex:1 1 auto;min-width:0' },
            h('div', { class: 'display', style: 'font-size:20px', text: userTeam(existing).name }),
            h('div', { class: 'small', text: `${stage.name} · season ${state.totalYears + 1}` }),
            h('div', { class: 'row row--wrap', style: 'gap:6px' },
              tierPill(state.tier),
              h('span', { class: 'pill pill--accent', text: `Rung ${state.stageIndex + 1} of ${STAGES.length}` }),
              h('span', { class: 'pill', text: `Reputation ${Math.round(state.reputation)}` }),
              h('span', {
                class: state.heat >= 2 ? 'pill pill--red' : 'pill',
                text: state.heat >= 2 ? 'On the hot seat' : `${Object.values(state.titles).reduce((n, v) => n + v, 0)} titles`,
              })))),
        h('button', {
          class: 'btn btn--primary btn--block',
          text: state.complete ? 'See how it ended' : 'Continue the career',
          on: {
            click: () => (state.complete
              ? app.replace((a) => new ChallengeEndScreen(a, existing))
              : app.replace((a) => new SeasonHubScreen(a, 'challenge'))),
          },
        }),
        h('button', {
          class: 'btn btn--block',
          text: 'Career tracker',
          on: { click: () => app.push((a) => new ChallengeTrackerScreen(a)) },
        }),
        h('button', {
          class: 'btn btn--block',
          text: 'Abandon and start again',
          on: {
            click: () => {
              if (!window.confirm('Delete this coaching career and start from the bottom again?')) return;
              deleteCareer('challenge');
              app.replace((a) => new ChallengeEntryScreen(a));
            },
          },
        })));
    }

    body.push(panel('The climb',
      h('div', {
        class: 'small',
        text: 'You start at the bottom of Class D high school lacrosse with a programme that has a '
          + 'real problem, and you climb by winning championships. Nine rungs, one career, and no '
          + 'promotion is automatic: winning gets you interviews, and reputation decides which ones.',
      }),
      ladderList(existing?.challenge?.stageIndex ?? -1)));

    body.push(panel('What makes it hard',
      bullet('Every job is a mess', 'Rebuilds, broken locker rooms, a goalie who cannot stop the ball. The problem is applied to the roster you inherit, not printed on a screen.'),
      bullet('Players get better than you', 'Each rung draws from a higher band of actual attributes. Division I players are faster and sharper than anyone you coached in high school, and the professional game is another step again.'),
      bullet('You can be sacked', 'Three seasons below what the programme wanted and you are out. You drop a rung, lose the recruits you were chasing, and start again.'),
      bullet('Time is the real cost', 'A career is finite. Years spent fixing somebody else\'s mess are years you do not spend climbing.')));

    if (!existing) {
      body.push(panel('Settings',
        fieldRow('Difficulty', 'Higher rungs raise this floor whatever you pick here.',
          segmented(
            DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
            draft.difficulty,
            (v) => { draft.difficulty = v; },
            true,
          )),
        fieldRow('Quarter length', 'Simulated results are scaled to match.',
          segmented(
            (Object.keys(GAME_LENGTHS) as GameLengthKey[]).map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
            draft.gameLength,
            (v) => { draft.gameLength = v; },
            true,
          ))));
      body.push(h('button', {
        class: 'btn btn--primary btn--block',
        style: 'min-height:54px;font-size:18px',
        text: 'Choose your difficulty',
        on: { click: start },
      }));
    }

    this.el = screenEl(
      topbar(app, 'Challenge', 'Class D to the PLL'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, ...body)),
    );
  }
}

/** The difficulty mark. The same pill wherever a career is described. */
export function tierPill(tier: ChallengeTier | null | undefined): HTMLElement {
  const info = tierInfo(tier);
  return h('span', {
    class: 'pill',
    style: `color:${info.colour};border-color:${info.colour}`,
    text: info.mark,
  });
}

function bullet(title: string, text: string): HTMLElement {
  return h('div', { class: 'stack', style: 'gap:2px' },
    h('div', { class: 'small', style: 'color:var(--text)', text: title }),
    h('div', { class: 'tiny', text }));
}

/**
 * The ladder, grouped into its three chapters. Nine rungs is a lot to read as a
 * flat list, and the chapter breaks are where the career actually changes shape.
 */
export function ladderList(currentIndex: number): HTMLElement {
  const wrap = h('div', { class: 'stack', style: 'gap:0' });
  for (const chapter of CHAPTERS) {
    const done = currentIndex > chapter.to;
    wrap.appendChild(h('div', {
      class: 'eyebrow',
      style: `margin:8px 0 2px;${done ? 'color:var(--green)' : currentIndex >= chapter.from ? 'color:var(--accent)' : ''}`,
      text: `${chapter.name}${done ? ' · complete' : ''}`,
    }));
    for (let i = chapter.from; i <= chapter.to; i++) {
      const stage = STAGES[i];
      const cls = i < currentIndex ? 'rung is-done' : i === currentIndex ? 'rung is-here' : 'rung is-locked';
      wrap.appendChild(h('div', { class: cls },
        h('div', { class: 'rung__dot' }),
        h('div', { class: 'stack', style: 'gap:1px;min-width:0' },
          h('div', { class: 'rung__name', text: stage.short }),
          h('div', { class: 'rung__need', text: i === currentIndex ? stage.requirement : stage.name })),
        h('div', { class: 'tiny', text: `${i + 1}/${STAGES.length}` })));
    }
  }
  return wrap;
}

/**
 * The chapter-complete card. This is what a coach sees after the last rung of
 * high school or college — a milestone, emphatically NOT an ending.
 */
export function chapterCard(stageIndex: number): HTMLElement | null {
  if (!completesChapter(stageIndex)) return null;
  const chapter = chapterOf(stageIndex);
  return h('div', { class: 'chapter' },
    h('div', { class: 'chapter__mark' }, trophyIcon(46)),
    h('div', { class: 'chapter__title display', text: chapter.headline }),
    h('div', { class: 'chapter__body', text: chapter.blurb }),
    h('div', { class: 'chapter__next display', text: `Next chapter · ${chapter.nextName}` }));
}

/* ---------------------------------------------------------------- tracker */

export class ChallengeTrackerScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const career = loadCareer('challenge');
    if (!career || !career.challenge) {
      this.el = screenEl(
        topbar(app, 'Career tracker'),
        h('div', { class: 'scroll' }, h('div', { class: 'wrapper' }, emptyPanel(
          'No Challenge career',
          'Start one and this becomes the record of it: every season, every job, every championship.',
          [{ label: 'Start a career', primary: true, onClick: () => app.replace((a) => new ChallengeEntryScreen(a)) }],
        ))),
      );
      return;
    }

    const state = career.challenge;
    const legacy = challengeLegacy(career)!;
    const stage = stageAt(state.stageIndex);

    const rows = h('div', { class: 'list' });
    for (const s of [...state.steps].reverse()) {
      rows.appendChild(h('div', { class: 'list__row' },
        h('div', { class: 'list__rank num', text: `Y${s.year}` }),
        h('div', { class: 'stack', style: 'gap:1px;flex:1 1 auto;min-width:0' },
          h('div', { class: 'list__name', text: `${s.teamShort} · ${stageAt(STAGES.findIndex((x) => x.key === s.stageKey)).short}` }),
          h('div', { class: 'tiny', text: s.finish })),
        h('div', { class: 'stack', style: 'gap:1px;align-items:flex-end' },
          h('div', { class: 'num', text: `${s.wins}-${s.losses}` }),
          s.champion
            ? h('span', { class: 'pill pill--accent pill--xs', text: 'TITLE' })
            : s.outcome === 'fired' ? h('span', { class: 'pill pill--red pill--xs', text: 'SACKED' }) : null)));
    }

    this.el = screenEl(
      topbar(app, 'Career tracker', `${state.totalYears} seasons`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('Where you are',
            h('div', { class: 'display', style: 'font-size:22px', text: stage.name }),
            h('div', { class: 'small', text: `${userTeam(career).name} · ${stageDivisionName(state.stageIndex)}` }),
            h('div', { class: 'row row--wrap', style: 'gap:6px;margin-top:4px' },
              tierPill(state.tier),
              h('span', { class: 'pill pill--accent', text: `Reputation ${Math.round(state.reputation)}` }),
              h('span', { class: 'pill', text: `${state.tenure} season${state.tenure === 1 ? '' : 's'} in the job` }),
              h('span', {
                class: state.heat >= 2 ? 'pill pill--red' : state.heat === 1 ? 'pill' : 'pill pill--green',
                text: state.heat >= 2 ? 'Hot seat' : state.heat === 1 ? 'Under pressure' : 'Secure',
              })),
            h('div', { class: 'tiny', style: 'margin-top:4px', text: `They want: ${state.expectation.text}` }),
            h('div', { class: 'tiny', text: `You inherited: ${SITUATIONS[state.situation].label} — ${SITUATIONS[state.situation].fix}` })),
          panel('The ladder', ladderList(state.stageIndex)),
          panel(`Legacy · ${legacy.score} · ${legacy.title}`,
            ...legacy.lines.map((l) => h('div', { class: 'row', style: 'justify-content:space-between' },
              h('span', { class: 'small', text: `${l.label} — ${l.value}` }),
              h('span', { class: 'num', text: `+${l.points}` })))),
          state.steps.length ? panelFlush('Every season', rows) : null,
        ),
      ),
    );
  }
}

/* ----------------------------------------------------------------- offers */

export class JobOffersScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career) {
    const state = career.challenge!;
    const body = h('div', { class: 'stack' });

    const redraw = () => {
      clear(body);
      const offers = state.offers ?? [];
      const kind = state.offerKind;

      const target = offers[0]?.stageIndex ?? state.stageIndex;
      const movingChapter = kind === 'promotion' && chapterOf(target).key !== chapterOf(state.stageIndex).key;
      const card = movingChapter ? chapterCard(state.stageIndex) : null;
      if (card) body.appendChild(card);

      body.appendChild(panel(
        movingChapter ? `${chapterOf(target).name} coaching opportunities`
          : kind === 'promotion' ? 'The phone is ringing'
            : kind === 'demotion' ? 'Starting again' : 'Who will have you',
        h('div', {
          class: 'small',
          text: kind === 'promotion'
            ? 'You won a championship, and that gets you interviews. Nothing here is a reward — every one of '
              + 'these programmes has a problem, and the better the job the worse the mess.'
            : kind === 'demotion'
              ? 'You were let go. These are the programmes that will still take your call.'
              : 'You put your name about. The only way UP is still a championship — these are sideways moves.',
        }),
        h('div', { class: 'tiny', text: `Your reputation: ${Math.round(state.reputation)}. It is the only thing deciding this list.` })));

      for (const offer of offers) body.appendChild(offerCard(app, career, offer, redraw));

      body.appendChild(h('button', {
        class: 'btn btn--block',
        text: state.fired ? 'Take a year out of the game' : 'Stay where you are',
        on: {
          click: () => {
            const wasFired = state.fired;
            declineChallengeOffers(career);
            saveCareer(career);
            if (state.complete) { app.replace((a) => new ChallengeEndScreen(a, career)); return; }
            if (wasFired && state.offers && state.offers.length) {
              // A year passes and a new, weaker list comes up. There is no team
              // to go back to, so the decision simply comes round again.
              app.toast(`A year out of the game. ${state.strikes >= 1 ? 'One more and nobody will call.' : ''}`.trim());
              redraw();
              return;
            }
            app.toast(wasFired ? 'A year out of the game.' : 'You stay put.');
            app.replace((a) => new SeasonHubScreen(a, 'challenge'));
          },
        },
      }));
    };
    redraw();

    this.el = screenEl(
      topbar(app, 'Job offers', `${(state.offers ?? []).length} on the table`, () => { /* no back: this is a decision */ }),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, body)),
    );
  }
}

function summaryRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'row', style: 'justify-content:space-between;gap:12px' },
    h('span', { class: 'small', style: 'color:var(--text)', text: label }),
    h('span', { class: 'display', style: 'font-size:18px', text: value }));
}

function prestigeWord(n: number): string {
  return n >= 82 ? 'High' : n >= 66 ? 'Medium' : 'Low';
}

function offerCard(app: App, career: Career, offer: JobOffer, redraw: () => void): HTMLElement {
  const stage = stageAt(offer.stageIndex);
  const sit = SITUATIONS[offer.situation];
  // The squad you would actually inherit, from the real team data.
  const squad = effectiveTeam(career, offer.teamId).overall;
  return panel(null,
    h('div', { class: 'stack', style: 'gap:6px' },
      h('div', { class: 'row', style: 'justify-content:space-between;gap:10px' },
        h('div', { class: 'display', style: 'font-size:19px', text: offer.teamName }),
        h('span', { class: 'pill pill--accent', text: stage.short })),
      h('div', { class: 'row row--wrap', style: 'gap:6px' },
        h('span', { class: 'pill', text: `Team OVR ${squad}` }),
        h('span', { class: 'pill', text: `Prestige ${prestigeWord(offer.prestige)}` }),
        h('span', {
          class: sit.severity >= 3 ? 'pill pill--red' : sit.severity === 0 ? 'pill pill--green' : 'pill',
          text: sit.label,
        })),
      h('div', { class: 'small', text: sit.blurb }),
      h('div', { class: 'tiny', text: `To fix it: ${sit.fix}` }),
      h('div', { class: 'tiny', style: 'color:var(--accent)', text: `They expect: ${offer.expectation.text}` }),
      h('button', {
        class: 'btn btn--primary btn--block',
        text: `Take the ${offer.teamShort} job`,
        on: {
          click: () => {
            takeChallengeJob(career, offer);
            saveCareer(career);
            app.replace((a) => new SeasonHubScreen(a, 'challenge'));
            void redraw;
          },
        },
      })),
  );
}

/** Offered from the hub when a coach wants out of a dead end. */
export function openJobSearch(app: App, career: Career): void {
  const found = seekChallengeJob(career);
  saveCareer(career);
  if (!found || !found.length) {
    app.toast('Nobody is interested. Win something first.');
    return;
  }
  app.push((a) => new JobOffersScreen(a, career));
}

/* -------------------------------------------------------------------- end */

export class ChallengeEndScreen implements Screen {
  el: HTMLElement;

  /**
   * Where this career sits against every other one played on the same tier.
   * A first attempt says so; a personal best says so loudly; and a career that
   * fell short is told exactly what it has to beat next time.
   */
  private hallPanel(tier: ChallengeTier, result: HallResult): HTMLElement {
    const { entry, previous, bestLegacyEver, fastestEver, furthestEver } = result;
    const info = tierInfo(tier);
    const badges: (HTMLElement | null)[] = [
      bestLegacyEver ? h('span', { class: 'pill pill--green', text: 'BEST LEGACY' }) : null,
      fastestEver ? h('span', { class: 'pill pill--green', text: 'FASTEST CLIMB' }) : null,
      furthestEver && !fastestEver ? h('span', { class: 'pill pill--accent', text: 'FURTHEST YET' }) : null,
    ];
    return panel(`Your record on ${info.name}`,
      previous
        ? h('div', { class: 'row row--wrap', style: 'gap:6px' }, ...badges)
        : h('div', { class: 'small', text: 'Your first career on this difficulty. Everything below is now the mark to beat.' }),
      summaryRow('Best legacy', `${entry.bestLegacy}${entry.bestTitle ? ` · ${entry.bestTitle}` : ''}`),
      summaryRow('Fastest climb to the PLL',
        entry.fastestFinish === null ? 'Not yet done' : `${entry.fastestFinish} seasons`),
      summaryRow('Furthest reached', stageAt(entry.bestRung).short),
      summaryRow('Careers on this tier', `${entry.careers}`),
      previous && !bestLegacyEver
        ? h('div', {
          class: 'tiny',
          text: `Your ${previous.bestLegacy} still stands. A harder tier multiplies everything `
            + 'you score on it, so the way past it may be up rather than round again.',
        })
        : null);
  }

  constructor(app: App, career: Career) {
    const state = career.challenge!;
    const legacy = challengeLegacy(career)!;
    const won = state.stageIndex >= STAGES.length - 1 && (state.titles.pll ?? 0) > 0;

    const titleRows = STAGES
      .map((s) => ({ s, n: state.titles[s.key] ?? 0 }))
      .filter((r) => r.n > 0);
    const titles = titleRows.reduce((n, r) => n + r.n, 0);
    const wins = state.steps.reduce((n, s) => n + s.wins, 0);
    const losses = state.steps.reduce((n, s) => n + s.losses, 0);
    const clubs = new Set(state.steps.map((s) => s.teamShort)).size;
    const reading = career.coach ? identityOf(career.coach) : null;

    // File it. A career that is over leaves nothing behind but this, which is
    // what makes the next one on a harder tier worth starting.
    const hall = recordCareer({
      tier: state.tier,
      legacy: legacy.score,
      title: legacy.title,
      finished: won,
      seasons: state.totalYears,
      rung: state.stageIndex,
      titles,
    });

    this.el = screenEl(
      topbar(app, 'The career', `${state.totalYears} seasons`, () => app.reset((a) => new MainMenuScreen(a))),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          won
            ? h('div', { class: 'trophy' },
              h('div', { class: 'trophy__icon' }, trophyIcon(58)),
              h('div', { class: 'trophy__title', text: 'Legendary coaching journey complete' }),
              h('div', { class: 'small', style: 'margin-top:6px', text: `You conquered every level of the lacrosse world on ${tierInfo(state.tier).name}.` }),
              h('div', { class: 'row', style: 'justify-content:center;margin-top:8px' }, tierPill(state.tier)))
            : panel('It ends here', h('div', { class: 'small', text: state.endedReason ?? 'The career is over.' })),

          this.hallPanel(state.tier, hall),

          reading
            ? panel(reading.identity.name,
              h('div', { class: 'small', text: reading.identity.blurb }),
              h('div', {
                class: 'tiny',
                text: `${reading.owned} of ${UPGRADES.length} upgrades bought over ${state.totalYears} seasons.`,
              }))
            : null,

          panel('The career in numbers',
            summaryRow('Difficulty', tierInfo(state.tier).name),
            summaryRow('Career length', `${state.totalYears} years`),
            summaryRow('Career record', `${wins}-${losses}`),
            summaryRow('Championships', `${titles}`),
            summaryRow('Programmes coached', `${clubs}`),
            summaryRow('Legacy score', `${legacy.score}`)),
          panel(`${legacy.title} · ${legacy.score}`,
            ...legacy.lines.map((l) => h('div', { class: 'row', style: 'justify-content:space-between' },
              h('span', { class: 'small', text: `${l.label} — ${l.value}` }),
              h('span', { class: 'num', text: `+${l.points}` })))),
          titleRows.length
            ? panel('Championships',
              ...titleRows.map((r) => h('div', { class: 'row', style: 'justify-content:space-between' },
                h('span', { class: 'small', text: r.s.name }),
                h('span', { class: 'num', text: `${r.n}` }))))
            : panel('Championships', h('div', { class: 'small', text: 'None. Not every career has one in it.' })),
          panel('The ladder', ladderList(state.stageIndex)),
          h('button', {
            class: 'btn btn--primary btn--block',
            text: 'Start another career',
            on: {
              click: () => {
                deleteCareer('challenge');
                app.replace((a) => new ChallengeEntryScreen(a));
              },
            },
          }),
          h('button', {
            class: 'btn btn--block',
            text: 'Main menu',
            on: { click: () => app.reset((a) => new MainMenuScreen(a)) },
          }),
        ),
      ),
    );
  }
}
