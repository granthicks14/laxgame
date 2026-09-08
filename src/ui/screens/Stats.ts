import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, teamBadge, emptyState, emptyPanel, segmented } from '../components';
import { loadCareer } from '../../state/saves';
import { userTeam } from '../../league/career';
import type { Career } from '../../league/types';
import { GRADE_LABEL, sortDepthChart } from '../../data/players';
import { CareerEntryScreen } from './CareerEntry';
import { ChallengeEntryScreen } from './Challenge';
import type { CareerMode } from '../../league/types';

export class StatsScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const saves: Partial<Record<CareerMode, Career | null>> = {
      dynasty: loadCareer('dynasty'),
      season: loadCareer('season'),
      challenge: loadCareer('challenge'),
    };
    const available = (['dynasty', 'challenge', 'season'] as CareerMode[]).filter((m) => saves[m]);
    let mode: CareerMode = available[0] ?? 'dynasty';
    const body = h('div', { class: 'stack' });

    const render = () => {
      const career = saves[mode] ?? null;
      body.replaceChildren();
      if (!career) {
        body.appendChild(emptyPanel(
          'No record book yet',
          'Play a season or start a dynasty and this becomes your program history: '
          + 'final records, season leaders, career totals and every player who comes through.',
          [
            { label: 'Start a dynasty', primary: true, onClick: () => app.push((a) => new CareerEntryScreen(a, 'dynasty')) },
            { label: 'Start a Challenge career', onClick: () => app.push((a) => new ChallengeEntryScreen(a)) },
            { label: 'Start a season', onClick: () => app.push((a) => new CareerEntryScreen(a, 'season')) },
          ],
        ));
        return;
      }
      for (const el of this.build(career)) body.appendChild(el);
    };

    const LABEL: Record<CareerMode, string> = {
      dynasty: 'Dynasty', season: 'Season', challenge: 'Challenge',
    };
    const tabs = available.length > 1
      ? segmented(
        available.map((m) => ({ value: m, label: LABEL[m] })),
        mode,
        (v) => { mode = v as CareerMode; render(); },
        true,
      )
      : null;

    render();

    this.el = screenEl(
      topbar(app, 'Records'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, tabs, body)),
    );
  }

  private build(career: Career): HTMLElement[] {
    const team = userTeam(career);
    const out: HTMLElement[] = [];

    const totalW = career.careerWins;
    const totalL = career.careerLosses;
    out.push(h('div', { class: 'panel' },
      h('span', { class: 'stripe', style: `background:${team.primary}` }),
      h('div', { class: 'panel__body row', style: 'gap:12px' },
        teamBadge(team, 'lg'),
        h('div', { class: 'stack', style: 'gap:4px;flex:1 1 auto' },
          h('div', { class: 'display', style: 'font-size:20px', text: team.name }),
          h('div', { class: 'small', text: `${career.year} season${career.year === 1 ? '' : 's'} · ${totalW}-${totalL} all time, playoffs included` }),
          h('div', { class: 'row row--wrap', style: 'gap:6px' },
            h('span', { class: 'pill pill--accent', text: `${career.championships} championship${career.championships === 1 ? '' : 's'}` }),
            h('span', { class: 'pill', text: `Prestige ${Math.round(career.prestige)}` }))))));

    if (career.history.length) {
      out.push(panelFlush('Season by season',
        h('table', { class: 'table table--compact' },
          h('thead', null, h('tr', null,
            h('th', { text: 'Year' }), h('th', { text: 'W' }), h('th', { text: 'L' }),
            h('th', { style: 'text-align:left', text: 'Finish' }))),
          h('tbody', null, ...career.history.slice().reverse().map((r) => h('tr', null,
            h('td', { class: 'name', text: String(r.year) }),
            h('td', { text: String(r.wins) }),
            h('td', { text: String(r.losses) }),
            h('td', { class: 'name', style: 'text-align:left' },
              r.champion ? h('span', { class: 'pill pill--accent', text: 'CHAMPIONS' }) : r.finish)))))));
    } else {
      out.push(panel('Season by season', emptyState('Finish a season to start the record book.')));
    }

    const roster = sortDepthChart(career.roster)
      .filter((p) => p.career.goals + p.career.assists + p.career.saves > 0)
      .sort((a, b) => (b.career.goals * 2 + b.career.assists + b.career.saves * 0.4)
        - (a.career.goals * 2 + a.career.assists + a.career.saves * 0.4))
      .slice(0, 12);

    out.push(roster.length
      ? panelFlush('Current roster — career totals',
        h('table', { class: 'table table--compact' },
          h('thead', null, h('tr', null,
            h('th', { text: 'Player' }), h('th', { text: 'Yr' }), h('th', { text: 'GP' }),
            h('th', { text: 'G' }), h('th', { text: 'A' }), h('th', { text: 'GB' }), h('th', { text: 'SV' }))),
          h('tbody', null, ...roster.map((p) => h('tr', null,
            h('td', { class: 'name', text: `${p.first} ${p.last}` }),
            h('td', { text: GRADE_LABEL[p.grade] }),
            h('td', { text: String(p.career.gamesPlayed) }),
            h('td', { text: String(p.career.goals) }),
            h('td', { text: String(p.career.assists) }),
            h('td', { text: String(p.career.groundBalls) }),
            h('td', { text: p.pos === 'G' ? String(p.career.saves) : '—' }))))))
      : panel('Career totals', emptyState('Play some games and the numbers show up here.')));

    if (career.alumni.length) {
      const alumni = career.alumni.slice()
        .sort((a, b) => (b.goals * 2 + b.assists + b.saves * 0.4) - (a.goals * 2 + a.assists + a.saves * 0.4))
        .slice(0, 15);
      out.push(panelFlush('Alumni',
        h('table', { class: 'table table--compact' },
          h('thead', null, h('tr', null,
            h('th', { text: 'Player' }), h('th', { text: 'Pos' }), h('th', { text: 'Class' }),
            h('th', { text: 'OVR' }), h('th', { text: 'G' }), h('th', { text: 'A' }), h('th', { text: 'SV' }))),
          h('tbody', null, ...alumni.map((a) => h('tr', null,
            h('td', { class: 'name', text: a.name }),
            h('td', { text: a.pos }),
            h('td', { text: `Y${a.gradYear}` }),
            h('td', { text: String(a.overall) }),
            h('td', { text: String(a.goals) }),
            h('td', { text: String(a.assists) }),
            h('td', { text: a.saves ? String(a.saves) : '—' })))))));
    }

    return out;
  }
}
