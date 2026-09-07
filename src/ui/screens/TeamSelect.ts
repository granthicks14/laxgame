import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, teamBadge, ratingGrid, difficultyPill, panel } from '../components';
import {
  TEAMS, DIVISIONS, IDENTITY_LABEL, getTeam, teamsInDivision,
  type DivisionKey, type TeamData,
} from '../../data/teams';
import { segmented } from '../components';

export interface TeamSelectOptions {
  title: string;
  /** Restrict to one division (used when picking a season opponent). */
  division?: DivisionKey;
  excludeId?: string;
  currentId?: string;
  confirmLabel: string;
  onPick: (teamId: string) => void;
}

export class TeamSelectScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, opts: TeamSelectOptions) {
    let division: DivisionKey = opts.division ?? (opts.currentId ? getTeam(opts.currentId).division : 'd1');
    const list = h('div', { class: 'grid-teams' });

    const render = () => {
      list.replaceChildren();
      const teams = teamsInDivision(division).filter((t) => t.id !== opts.excludeId);
      teams.sort((a, b) => b.overall - a.overall);
      for (const t of teams) list.appendChild(this.card(app, t, opts));
      if (!teams.length) list.appendChild(h('div', { class: 'empty', text: 'No teams available.' }));
    };

    const tabs = opts.division ? null : segmented<DivisionKey>(
      [
        { value: 'd1', label: DIVISIONS.d1.short },
        { value: 'd2', label: DIVISIONS.d2.short },
      ],
      division,
      (v) => { division = v; render(); blurb.textContent = DIVISIONS[v].blurb; },
      true,
    );
    const blurb = h('div', { class: 'small', text: DIVISIONS[division].blurb });

    render();

    this.el = screenEl(
      topbar(app, opts.title, 'North District'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          tabs,
          blurb,
          list,
          h('div', {
            class: 'tiny',
            text: 'Team list follows the THSLL North District. Ratings are gameplay values, '
              + 'and colours are picked for on-field readability rather than official branding.',
          }),
        ),
      ),
    );
  }

  private card(app: App, t: TeamData, opts: TeamSelectOptions): HTMLElement {
    return h('button', {
      class: `team-card${t.id === opts.currentId ? ' is-selected' : ''}`,
      on: { click: () => app.push((a) => new TeamDetailScreen(a, t.id, opts)) },
    },
      teamBadge(t),
      h('div', null,
        h('div', { class: 'team-card__name', text: t.name }),
        h('div', { class: 'team-card__meta', text: `${t.mascot} · ${IDENTITY_LABEL[t.identity]}` }),
        h('div', { class: 'row', style: 'margin-top:6px;gap:6px' },
          h('span', { class: 'pill pill--accent', text: `OVR ${t.overall}` }),
          difficultyPill(t)),
      ),
    );
  }
}

export class TeamDetailScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, teamId: string, opts: TeamSelectOptions) {
    const t = getTeam(teamId);
    const rivals = t.rivals.map((id) => TEAMS.find((x) => x.id === id)).filter(Boolean) as TeamData[];

    this.el = screenEl(
      topbar(app, t.short, t.abbr),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'panel' },
            h('span', { class: 'stripe', style: `background:${t.primary}` }),
            h('div', { class: 'panel__body row', style: 'gap:14px;align-items:flex-start' },
              teamBadge(t, 'lg'),
              h('div', { class: 'stack', style: 'gap:6px;flex:1 1 auto;min-width:0' },
                h('div', { class: 'display', style: 'font-size:22px', text: t.name }),
                h('div', { class: 'small', text: `${t.mascot} · ${DIVISIONS[t.division].short}` }),
                h('div', { class: 'row row--wrap', style: 'gap:6px' },
                  h('span', { class: 'pill pill--accent', text: IDENTITY_LABEL[t.identity] }),
                  difficultyPill(t)),
              ),
            ),
            h('span', { class: 'stripe', style: `background:${t.secondary}` }),
          ),
          panel('Scouting report', h('p', { style: 'margin:0', text: t.description })),
          panel('Team ratings', ratingGrid(t)),
          panel('Home field',
            h('div', { class: 'row' },
              h('div', { class: 'stack', style: 'gap:2px' },
                h('div', { class: 'display', style: 'font-size:16px', text: t.homeField.name }),
                h('div', {
                  class: 'small',
                  text: `${venueWord(t.homeField.venue)} · ${timeWord(t.homeField.time)} · `
                    + `${crowdWord(t.homeField.crowd)} crowd`,
                })))),
          panel('Rivalries',
            rivals.length
              ? h('div', { class: 'stack', style: 'gap:8px' },
                ...rivals.map((r) => h('div', { class: 'row' },
                  teamBadge(r, 'sm'),
                  h('div', { text: r.name }))),
                h('div', { class: 'tiny', text: 'Gameplay rivalries — these games carry extra weight in a season.' }))
              : h('div', { class: 'small', text: 'No listed rivals.' })),
          h('button', {
            class: 'btn btn--primary btn--block',
            text: opts.confirmLabel,
            on: { click: () => opts.onPick(t.id) },
          }),
        ),
      ),
    );
  }
}

const venueWord = (v: string): string =>
  v === 'stadium' ? 'Full stadium' : v === 'complex' ? 'Athletic complex' : 'School field';
const timeWord = (v: string): string =>
  v === 'night' ? 'Under the lights' : v === 'evening' ? 'Evening kickoff' : 'Afternoon game';
const crowdWord = (c: number): string => (c > 0.85 ? 'Packed' : c > 0.65 ? 'Busy' : 'Modest');
