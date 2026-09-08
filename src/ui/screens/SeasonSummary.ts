import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, teamBadge, emptyState } from '../components';
import { saveCareer, deleteCareer } from '../../state/saves';
import {
  champion, createCareer, effectiveTeam, resolveChallengeSeason, runOffseason,
  seasonFormat, seasonRecordText, userTeam, type OffseasonReport,
} from '../../league/career';
import { ChallengeEndScreen, JobOffersScreen } from './Challenge';
import { stageAt } from '../../challenge/ladder';
import { recruitingSummary } from '../../league/career';
import type { Career } from '../../league/types';
import { GRADE_LABEL, sortDepthChart } from '../../data/players';
import { SeasonHubScreen } from './SeasonHub';
import { MainMenuScreen } from './MainMenu';
import { audio } from '../../audio/Audio';
import { trophyIcon } from '../icons';
import { LADDER_LABEL, type Movement, type MovementReport } from '../../league/promotion';
import { LEVELS } from '../../data/levels';
import { staffSummary } from '../../league/coaching';
import { TransferPortalScreen } from './TransferPortal';
import { CoachOfficeScreen } from './CoachOffice';

export class SeasonSummaryScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career) {
    const team = userTeam(career);
    const champId = champion(career);
    const won = champId === career.teamId;
    const champTeam = champId ? effectiveTeam(career, champId) : null;
    if (won) audio.play('crowdUp', 1);

    const leaders = sortDepthChart(career.roster)
      .filter((p) => p.season.goals + p.season.assists + p.season.saves > 0)
      .sort((a, b) => (b.season.goals * 2 + b.season.assists) - (a.season.goals * 2 + a.season.assists))
      .slice(0, 10);

    // Challenge grades the season the moment it ends: reputation, the hot seat,
    // and whether the phone rings.
    const verdict = career.mode === 'challenge' ? resolveChallengeSeason(career) : null;
    if (verdict) saveCareer(career);
    const climb = career.challenge;

    const actions: HTMLElement[] = [];
    if (career.mode === 'challenge' && climb) {
      if (climb.complete) {
        actions.push(h('button', {
          class: 'btn btn--primary btn--block',
          style: 'min-height:54px;font-size:18px',
          text: 'See how the career ended',
          on: { click: () => app.replace((a) => new ChallengeEndScreen(a, career)) },
        }));
      } else if (climb.offers && climb.offers.length) {
        actions.push(h('button', {
          class: 'btn btn--primary btn--block',
          style: 'min-height:54px;font-size:18px',
          text: `${climb.offers.length} job${climb.offers.length === 1 ? '' : 's'} on the table`,
          on: { click: () => app.replace((a) => new JobOffersScreen(a, career)) },
        }));
      } else {
        actions.push(h('button', {
          class: 'btn btn--primary btn--block',
          style: 'min-height:54px;font-size:18px',
          text: `Advance to season ${climb.totalYears + 1}`,
          on: {
            click: () => {
              const report = runOffseason(career);
              saveCareer(career);
              app.replace((a) => new OffseasonScreen(a, career, report));
            },
          },
        }));
      }
    } else if (career.mode === 'dynasty') {
      actions.push(h('button', {
        class: 'btn btn--primary btn--block',
        style: 'min-height:54px;font-size:18px',
        text: `Advance to year ${career.year + 1}`,
        on: {
          click: () => {
            const report = runOffseason(career);
            saveCareer(career);
            app.replace((a) => new OffseasonScreen(a, career, report));
          },
        },
      }));
    } else {
      actions.push(h('button', {
        class: 'btn btn--primary btn--block',
        text: 'Run it back — new season, same program',
        on: {
          click: () => {
            const fresh = createCareer({
              mode: 'season',
              teamId: career.teamId,
              difficulty: career.difficulty,
              gameLength: career.gameLength,
            });
            saveCareer(fresh);
            app.replace((a) => new SeasonHubScreen(a, 'season'));
          },
        },
      }));
      actions.push(h('button', {
        class: 'btn btn--block',
        text: 'Finish and clear this save',
        on: {
          click: () => {
            if (!window.confirm('Clear the season save and return to the menu?')) return;
            deleteCareer('season');
            app.reset((a) => new MainMenuScreen(a));
          },
        },
      }));
    }
    actions.push(h('button', {
      class: 'btn btn--block', text: 'Main menu',
      on: { click: () => app.reset((a) => new MainMenuScreen(a)) },
    }));

    this.el = screenEl(
      topbar(app, `Year ${career.year}`, 'Season complete', () => app.reset((a) => new MainMenuScreen(a))),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          verdict && climb
            ? panel(`${stageAt(climb.stageIndex).short} · reputation ${Math.round(climb.reputation)}`,
              ...verdict.messages.map((m) => h('div', { class: 'small', style: 'color:var(--text)', text: m })),
              h('div', {
                class: 'tiny',
                style: verdict.reputationDelta >= 0 ? 'color:var(--green)' : 'color:var(--red)',
                text: `Reputation ${verdict.reputationDelta >= 0 ? '+' : ''}${verdict.reputationDelta}`,
              }),
              recruitingSummary(career) ? h('div', { class: 'tiny', text: recruitingSummary(career)! }) : null)
            : null,
          won
            ? h('div', { class: 'trophy' },
              h('div', { class: 'trophy__icon' }, trophyIcon(58)),
              h('div', { class: 'trophy__title', text: seasonFormat(career).titleName }),
              h('div', { class: 'small', text: `${team.name} · ${seasonRecordText(career)}` }))
            : h('div', { class: 'panel' },
              h('span', { class: 'stripe', style: `background:${team.primary}` }),
              h('div', { class: 'panel__body stack center' },
                h('div', { class: 'display', style: 'font-size:24px', text: career.finish ?? 'Season over' }),
                h('div', { class: 'small', text: `${team.name} finished ${seasonRecordText(career)}` }),
                champTeam ? h('div', { class: 'row', style: 'justify-content:center;gap:8px;margin-top:6px' },
                  teamBadge(champTeam, 'sm'),
                  h('div', { class: 'small', text: `${champTeam.short} took the title` })) : null)),

          leaders.length
            ? panelFlush('Season leaders',
              h('table', { class: 'table table--compact' },
                h('thead', null, h('tr', null,
                  h('th', { text: 'Player' }), h('th', { text: 'Yr' }), h('th', { text: 'G' }),
                  h('th', { text: 'A' }), h('th', { text: 'PTS' }), h('th', { text: 'GB' }), h('th', { text: 'SV' }))),
                h('tbody', null, ...leaders.map((p) => h('tr', null,
                  h('td', { class: 'name', text: `${p.first} ${p.last}` }),
                  h('td', { text: GRADE_LABEL[p.grade] }),
                  h('td', { text: String(p.season.goals) }),
                  h('td', { text: String(p.season.assists) }),
                  h('td', { text: String(p.season.goals + p.season.assists) }),
                  h('td', { text: String(p.season.groundBalls) }),
                  h('td', { text: p.pos === 'G' ? String(p.season.saves) : '—' }))))))
            : panel('Season leaders', emptyState('No stats recorded — every game was simulated.')),

          career.history.length > 1
            ? panelFlush('Program history',
              h('table', { class: 'table table--compact' },
                h('thead', null, h('tr', null,
                  h('th', { text: 'Year' }), h('th', { text: 'W' }), h('th', { text: 'L' }), h('th', { style: 'text-align:left', text: 'Finish' }))),
                h('tbody', null, ...career.history.slice().reverse().map((r) => h('tr', null,
                  h('td', { class: 'name', text: String(r.year) }),
                  h('td', { text: String(r.wins) }),
                  h('td', { text: String(r.losses) }),
                  h('td', { class: 'name', style: 'text-align:left' },
                    r.champion ? h('span', { class: 'pill pill--accent', text: 'CHAMPIONS' }) : r.finish))))))
            : null,

          h('div', { class: 'stack' }, ...actions),
        )),
    );
  }
}

/**
 * The offseason, in the order it actually happens: development first, then the
 * league movement it earned or cost you, then who left and who arrived, then
 * the transfer window. Each part is a real event with real consequences, so it
 * gets its own space rather than being a line in a list.
 */
export class OffseasonScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career, report: OffseasonReport) {
    const section = (title: string, items: (HTMLElement | null)[]) => {
      const kept = items.filter((x): x is HTMLElement => !!x);
      return kept.length ? panel(title, ...kept) : null;
    };

    this.el = screenEl(
      topbar(app, 'Offseason', `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'panel' },
            h('div', { class: 'panel__body stack center' },
              h('div', { class: 'display', style: 'font-size:22px', text: `Welcome to year ${career.year}` }),
              h('div', { class: 'small', text: `Program prestige ${Math.round(career.prestige)} · ${career.coachingPoints} coaching points banked` }),
              h('div', {
                class: 'small',
                text: career.level === 'hs' ? `Now in ${LADDER_LABEL[career.classKey]}` : LEVELS[career.level].name,
              }))),

          this.developmentPanel(report),
          this.recruitingPanel(career),
          this.movementPanel(app, career, report),

          section('Graduating', report.graduated.map((g) => h('div', { class: 'row' },
            h('span', { class: 'pill', text: g.pos }),
            h('span', { style: 'flex:1 1 auto', text: g.name }),
            h('span', { class: 'num', text: String(g.overall) })))),

          section('Did not return', report.departed.map((g) => h('div', { class: 'row' },
            h('span', { class: 'pill', text: g.pos }),
            h('span', { style: 'flex:1 1 auto', text: g.name }),
            h('span', { class: 'num', text: String(g.overall) })))),

          section('Arrivals', report.arrived.map((g) => h('div', { class: 'row' },
            h('span', { class: 'pill', text: g.pos }),
            h('span', { style: 'flex:1 1 auto', text: g.name }),
            h('span', { class: 'tiny', text: GRADE_LABEL[g.grade] }),
            h('span', { class: 'num', text: String(g.overall) })))),

          panel('Transfer window',
            h('div', { class: 'small', text: `${career.market.length} players are looking for a new programme. You have ${career.pitchesLeft} pitches.` }),
            h('button', {
              class: 'btn btn--block',
              text: 'Open the transfer portal',
              on: { click: () => app.push((a) => new TransferPortalScreen(a, 'dynasty')) },
            })),

          panel("Coach's office",
            h('div', { class: 'small', text: staffSummary(career.staff) }),
            h('button', {
              class: 'btn btn--block',
              text: `Spend coaching points (${career.coachingPoints} CP)`,
              on: { click: () => app.push((a) => new CoachOfficeScreen(a, 'dynasty')) },
            })),

          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:54px;font-size:18px',
            text: 'Start the season',
            on: { click: () => app.replace((a) => new SeasonHubScreen(a, 'dynasty')) },
          }),
        )),
    );
  }

  /** Development, banded so a season reads as a story rather than a number. */
  private developmentPanel(report: OffseasonReport): HTMLElement | null {
    if (!report.development.length) return null;
    const shown = report.development.slice(0, 12);
    const tone = (outcome: string) =>
      outcome === 'breakout' ? 'pill pill--accent'
        : outcome === 'strong' ? 'pill pill--green'
          : outcome === 'regression' ? 'pill pill--red' : 'pill';

    return panelFlush('Player development',
      h('table', { class: 'table table--compact' },
        h('thead', null, h('tr', null,
          h('th', { text: 'Player' }), h('th', { text: 'Yr' }),
          h('th', { text: 'OVR' }), h('th', { style: 'text-align:left', text: 'Season' }))),
        h('tbody', null, ...shown.map((d) => {
          const delta = d.to - d.from;
          return h('tr', null,
            h('td', { class: 'name', text: d.name }),
            h('td', { text: GRADE_LABEL[d.grade as 9 | 10 | 11 | 12] }),
            h('td', { class: 'name' },
              h('span', { class: 'num', text: `${d.from} → ` }),
              h('span', { class: `num ${delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}`, text: String(d.to) })),
            h('td', { class: 'name', style: 'text-align:left' },
              h('span', { class: tone(d.outcome), text: d.label })));
        }))),
    );
  }

  /** Promotion and relegation, with the reason for every move. */
  /** How the class you spent the season working actually turned out. */
  private recruitingPanel(career: Career): HTMLElement | null {
    const summary = recruitingSummary(career);
    if (!summary) return null;
    return panel('Signing day',
      h('div', { class: 'small', text: summary }),
      h('div', {
        class: 'tiny',
        text: 'Their real ratings are on the roster now. This is where you find out whether your scouts were right.',
      }));
  }

  private movementPanel(app: App, career: Career, report: OffseasonReport): HTMLElement | null {
    const movement = report.movement;
    if (!movement || !movement.moves.length) return null;
    const mine = movement.moves.find((m) => m.teamId === career.teamId);

    return panel('League movement',
      mine
        ? h('div', {
          class: `movement-hero movement-hero--${mine.direction}`,
          text: mine.direction === 'up'
            ? `PROMOTED TO ${LADDER_LABEL[mine.to].toUpperCase()}`
            : `RELEGATED TO ${LADDER_LABEL[mine.to].toUpperCase()}`,
        })
        : h('div', { class: 'small', text: `You hold your place in ${LADDER_LABEL[career.classKey]}.` }),
      mine ? h('div', { class: 'small', text: mine.reason }) : null,
      h('button', {
        class: 'btn btn--block',
        text: `See all ${movement.moves.length} moves`,
        on: { click: () => app.push((a) => new LeagueMovementScreen(a, career, movement)) },
      }),
    );
  }
}

/** The full promotion and relegation table, with the reason for every move. */
export class LeagueMovementScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career, movement: MovementReport) {
    const up = movement.moves.filter((m) => m.direction === 'up');
    const down = movement.moves.filter((m) => m.direction === 'down');

    const row = (m: Movement, i: number) => {
      const t = effectiveTeam(career, m.teamId);
      return h('div', {
        class: `movement movement--${m.direction}${m.teamId === career.teamId ? ' is-you' : ''}`,
        style: `animation-delay:${Math.min(i * 70, 700)}ms`,
      },
        h('span', { class: 'movement__arrow', text: m.direction === 'up' ? '↑' : '↓' }),
        teamBadge(t, 'sm'),
        h('div', { class: 'movement__body' },
          h('div', { class: 'movement__name', text: t.short }),
          h('div', { class: 'tiny', text: m.reason })),
        h('div', { class: 'movement__to', text: LADDER_LABEL[m.to] }));
    };

    this.el = screenEl(
      topbar(app, 'League movement', `Year ${movement.season}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'small', text: 'The champion of each division goes up, and the bottom two of each division above the entry level go down. Divisions never fall below six teams or rise above twelve.' }),
          up.length ? panel('Promoted', ...up.map(row)) : null,
          down.length ? panel('Relegated', ...down.map(row)) : null,
          movement.blocked.length
            ? panel('Held over', ...movement.blocked.map((b) => h('div', { class: 'small', text: b })))
            : null,
          h('button', {
            class: 'btn btn--primary btn--block', text: 'Back',
            on: { click: () => app.pop() },
          }),
        )),
    );
  }
}
