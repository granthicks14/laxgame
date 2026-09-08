import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, teamBadge, segmented, emptyPanel } from '../components';
import { CareerEntryScreen } from './CareerEntry';
import { loadCareer, saveCareer } from '../../state/saves';
import {
  FOCUS_INFO, effectiveTeam, nextUserGame, opponentOf, roundName, seasonRecordText,
  simulateUserGame, standingsSorted, userIsHome, userTeam, winPct,
} from '../../league/career';
import type { Career, ScheduledGame, WeeklyFocus } from '../../league/types';
import { playSeasonGame } from './seasonPlay';
import { TeamManageScreen } from './TeamManage';
import { StandingsScreen, ScheduleScreen } from './SeasonTables';
import { SeasonSummaryScreen } from './SeasonSummary';
import { CLASSES } from '../../data/teams';
import { CoachOfficeScreen } from './CoachOffice';
import { TransferPortalScreen } from './TransferPortal';
import { DynastyStatsScreen } from './DynastyStats';
import { staffSummary } from '../../league/coaching';
import { movementOutlook } from '../../league/promotion';

export class SeasonHubScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: 'season' | 'dynasty') {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(
        topbar(app, mode === 'dynasty' ? 'Dynasty' : 'Season'),
        h('div', { class: 'scroll' }, h('div', { class: 'wrapper' }, emptyPanel(
          'No save in this mode',
          'That career is not on this device — it may have been deleted, or saved in a different browser.',
          [{
            label: `Start a new ${mode}`,
            primary: true,
            onClick: () => app.replace((a) => new CareerEntryScreen(a, mode)),
          }],
        ))),
      );
      return;
    }

    if (career.seasonComplete) {
      this.el = new SeasonSummaryScreen(app, career).el;
      return;
    }

    const team = userTeam(career);
    const game = nextUserGame(career);
    const standings = standingsSorted(career);
    const rank = standings.findIndex((r) => r.teamId === career.teamId) + 1;

    this.el = screenEl(
      topbar(app, team.short, `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          this.header(career, rank, standings.length),
          game ? this.nextGame(app, career, game) : this.playoffWait(career),
          this.focusPanel(app, career),
          this.officePanel(app, career, mode),
          h('div', { class: 'row row--wrap' },
            h('button', {
              class: 'btn', text: 'Team', on: { click: () => app.push((a) => new TeamManageScreen(a, mode)) },
            }),
            h('button', {
              class: 'btn', text: 'Schedule', on: { click: () => app.push((a) => new ScheduleScreen(a, mode)) },
            }),
            h('button', {
              class: 'btn', text: 'Standings', on: { click: () => app.push((a) => new StandingsScreen(a, mode)) },
            }),
            h('button', {
              class: 'btn', text: 'Statistics', on: { click: () => app.push((a) => new DynastyStatsScreen(a, mode)) },
            })),
          this.miniStandings(app, career, mode),
        ),
      ),
    );
  }

  /** The coach's office, and the transfer window when it is open. */
  private officePanel(app: App, career: Career, mode: 'season' | 'dynasty'): HTMLElement {
    const open = career.market.length > 0 && career.pitchesLeft > 0;
    return panel("Coach's office",
      h('div', { class: 'small', text: staffSummary(career.staff) }),
      h('div', { class: 'row row--wrap' },
        h('button', {
          class: 'btn', text: `Staff · ${career.coachingPoints} CP`,
          on: { click: () => app.push((a) => new CoachOfficeScreen(a, mode)) },
        }),
        h('button', {
          class: `btn${open ? ' btn--primary' : ''}`,
          text: open ? `Transfers · ${career.pitchesLeft} left` : 'Transfers',
          on: { click: () => app.push((a) => new TransferPortalScreen(a, mode)) },
        })),
      h('div', {
        class: 'tiny',
        text: movementOutlook(
          standingsSorted(career).findIndex((r) => r.teamId === career.teamId) + 1,
          Object.keys(career.standings).length,
          career.classKey,
        ),
      }),
    );
  }

  private header(career: Career, rank: number, of: number): HTMLElement {
    const team = userTeam(career);
    return h('div', { class: 'panel' },
      h('span', { class: 'stripe', style: `background:${team.primary}` }),
      h('div', { class: 'panel__body row', style: 'gap:12px' },
        teamBadge(team, 'lg'),
        h('div', { class: 'stack', style: 'gap:4px;flex:1 1 auto;min-width:0' },
          h('div', { class: 'display', style: 'font-size:20px', text: team.name }),
          h('div', { class: 'small', text: `${CLASSES[career.classKey].short} · ${seasonRecordText(career)} · ${ordinal(rank)} of ${of}` }),
          h('div', { class: 'row row--wrap', style: 'gap:6px' },
            h('span', { class: 'pill pill--accent', text: `OVR ${team.overall}` }),
            h('span', { class: 'pill', text: `Prestige ${Math.round(career.prestige)}` }),
            h('span', { class: 'pill pill--green', text: `${career.coachingPoints} CP` }),
            career.championships ? h('span', { class: 'pill pill--accent', text: `${career.championships}× champion` }) : null),
        ),
      ),
    );
  }

  private nextGame(app: App, career: Career, game: ScheduledGame): HTMLElement {
    const opp = effectiveTeam(career, opponentOf(career, game));
    const isHome = userIsHome(career, game);
    const tag = game.playoff
      ? roundName(game.playoff)
      : game.rivalry ? 'Rivalry game' : `Week ${game.week}`;
    const record = career.standings[opp.id];

    return h('div', { class: `panel${game.rivalry || game.playoff ? '' : ''}` },
      h('div', { class: 'panel__head' },
        h('span', { text: 'Next game' }),
        h('span', { class: 'spacer' }),
        h('span', {
          class: `pill${game.playoff ? ' pill--accent' : game.rivalry ? ' pill--red' : ''}`,
          text: tag,
        })),
      h('div', { class: 'panel__body stack' },
        h('div', { class: 'row', style: 'gap:12px' },
          teamBadge(opp, 'lg'),
          h('div', { class: 'stack', style: 'gap:2px;flex:1 1 auto;min-width:0' },
            h('div', { class: 'eyebrow', text: isHome ? 'vs' : 'at' }),
            h('div', { class: 'display', style: 'font-size:19px', text: opp.name }),
            h('div', {
              class: 'small',
              text: record
                ? `${record.wins}-${record.losses} · OVR ${opp.overall} · ${isHome ? userTeam(career).homeField.name : opp.homeField.name}`
                : `OVR ${opp.overall}`,
            }))),
        h('button', {
          class: 'btn btn--primary btn--block',
          style: 'min-height:54px;font-size:18px',
          text: 'Play game',
          on: { click: () => playSeasonGame(app, career, game) },
        }),
        h('button', {
          class: 'btn btn--block btn--sm',
          text: 'Simulate this game',
          on: {
            click: () => {
              simulateUserGame(career, game);
              saveCareer(career);
              const you = userIsHome(career, game) ? game.homeScore : game.awayScore;
              const them = userIsHome(career, game) ? game.awayScore : game.homeScore;
              app.toast(`${you > them ? 'Won' : 'Lost'} ${you}-${them}`);
              app.replace((a) => new SeasonHubScreen(a, career.mode));
            },
          },
        }),
      ),
    );
  }

  private playoffWait(career: Career): HTMLElement {
    return panel('Season',
      h('div', { class: 'small', text: career.eliminated
        ? 'Your season is over. The bracket is playing out.'
        : 'Waiting on the next round.' }),
      h('div', { class: 'small', text: `Record: ${seasonRecordText(career)}` }));
  }

  private focusPanel(app: App, career: Career): HTMLElement {
    const short: Record<WeeklyFocus, string> = {
      offense: 'Offense', defense: 'Defense', faceoffs: 'Faceoffs',
      conditioning: 'Fitness', chemistry: 'Chemistry',
    };
    const options = (Object.keys(FOCUS_INFO) as WeeklyFocus[]).map((k) => ({
      value: k, label: short[k],
    }));
    const blurb = h('div', {
      class: 'small',
      text: career.focus ? FOCUS_INFO[career.focus].blurb : 'Pick what your team works on this week. It carries into the next game.',
    });
    return panel('Practice focus',
      segmented<WeeklyFocus>(options, career.focus ?? ('' as WeeklyFocus), (v) => {
        career.focus = v;
        saveCareer(career);
        blurb.textContent = FOCUS_INFO[v].blurb;
        app.toast(`Focus: ${FOCUS_INFO[v].label}`);
      }, true),
      blurb);
  }

  private miniStandings(app: App, career: Career, mode: 'season' | 'dynasty'): HTMLElement {
    const rows = standingsSorted(career).slice(0, 6).map((r, i) => {
      const t = effectiveTeam(career, r.teamId);
      return h('tr', { class: r.teamId === career.teamId ? 'is-you' : '' },
        h('td', { class: 'name' }, h('span', { class: 'row', style: 'gap:8px' },
          h('span', { class: 'num', style: 'color:var(--muted);width:14px', text: String(i + 1) }),
          teamBadge(t, 'sm'),
          h('span', { text: t.short }))),
        h('td', { text: String(r.wins) }),
        h('td', { text: String(r.losses) }),
        h('td', { text: winPct(r).toFixed(3).replace(/^0/, '') }),
      );
    });
    return panelFlush('Standings',
      h('table', { class: 'table table--compact' },
        h('thead', null, h('tr', null,
          h('th', { text: 'Team' }), h('th', { text: 'W' }), h('th', { text: 'L' }), h('th', { text: 'PCT' }))),
        h('tbody', null, ...rows)),
      h('div', { style: 'padding:10px' },
        h('button', {
          class: 'btn btn--sm btn--block', text: 'Full standings',
          on: { click: () => app.push((a) => new StandingsScreen(a, mode)) },
        })));
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
