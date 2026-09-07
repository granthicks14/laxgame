import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, teamBadge, emptyState } from '../components';
import { saveCareer, deleteCareer } from '../../state/saves';
import {
  champion, createCareer, effectiveTeam, runOffseason, seasonRecordText, userTeam,
  type OffseasonReport,
} from '../../league/career';
import type { Career } from '../../league/types';
import { GRADE_LABEL, sortDepthChart } from '../../data/players';
import { SeasonHubScreen } from './SeasonHub';
import { MainMenuScreen } from './MainMenu';
import { audio } from '../../audio/Audio';
import { trophyIcon } from '../icons';

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

    const actions: HTMLElement[] = [];
    if (career.mode === 'dynasty') {
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
          won
            ? h('div', { class: 'trophy' },
              h('div', { class: 'trophy__icon' }, trophyIcon(58)),
              h('div', { class: 'trophy__title', text: 'District Champions' }),
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

export class OffseasonScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career, report: OffseasonReport) {
    const section = (title: string, items: HTMLElement[]) =>
      items.length ? panel(title, ...items) : null;

    this.el = screenEl(
      topbar(app, 'Offseason', `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'panel' },
            h('div', { class: 'panel__body stack center' },
              h('div', { class: 'display', style: 'font-size:22px', text: `Welcome to year ${career.year}` }),
              h('div', { class: 'small', text: `Program prestige ${Math.round(career.prestige)} · ${career.coachingPoints} coaching points banked` }))),

          section('Graduating', report.graduated.map((g) => h('div', { class: 'row' },
            h('span', { class: 'pill', text: g.pos }),
            h('span', { style: 'flex:1 1 auto', text: g.name }),
            h('span', { class: 'num', text: String(g.overall) })))),

          section('Developed', report.improved
            .sort((a, b) => (b.to - b.from) - (a.to - a.from))
            .slice(0, 10)
            .map((g) => h('div', { class: 'row' },
              h('span', { class: 'pill', text: g.pos }),
              h('span', { style: 'flex:1 1 auto', text: g.name }),
              h('span', { class: 'num small', text: `${g.from} →` }),
              h('span', { class: 'num good', text: String(g.to) })))),

          section('Arrivals', report.arrived.map((g) => h('div', { class: 'row' },
            h('span', { class: 'pill', text: g.pos }),
            h('span', { style: 'flex:1 1 auto', text: g.name }),
            h('span', { class: 'tiny', text: GRADE_LABEL[g.grade] }),
            h('span', { class: 'num', text: String(g.overall) })))),

          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:54px;font-size:18px',
            text: 'Start the season',
            on: { click: () => app.replace((a) => new SeasonHubScreen(a, 'dynasty')) },
          }),
        )),
    );
  }
}
