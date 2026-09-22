import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel, segmented } from '../../components';
import { ATTR_LABEL, POSITION_LABEL, POSITIONS, teamRatings, type Player } from '../../../sports/football/data';
import {
  CONFERENCES, TEAMS, badgeColours, divisionsIn, rosterFor, teamsInDivision,
  type Conference, type NflTeam,
} from '../../../sports/football/nfl';

/* ---------------------------------------------------------------------------
 * EVERY CLUB IN THE LEAGUE
 * ---------------------------------------------------------------------------
 * Thirty-two of them, by division, because that is how the league is shaped.
 *
 * THE CLUBS ARE THE REAL ONES AND EVERY PLAYER IN THEM IS INVENTED — which this
 * screen says out loud, at the bottom, because it is the single most important
 * thing about the football section and somebody scrolling a roster deserves to
 * know what they are looking at.
 * ------------------------------------------------------------------------- */

export class FootballTeamsScreen implements Screen {
  el: HTMLElement;

  private body = h('div', { class: 'stack' });
  private conference: Conference = 'AFC';

  constructor(app: App) {
    this.paint();
    this.el = screenEl(
      topbar(app, 'Clubs', `${TEAMS.length} in the league`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          segmented<Conference>(
            CONFERENCES.map((c) => ({ value: c, label: c })),
            this.conference,
            (v) => { this.conference = v; this.paint(); }, true),
          this.body)),
    );
  }

  private paint(): void {
    this.body.replaceChildren(
      ...divisionsIn(this.conference).map((divisionId) => h('div', { class: 'stack' },
        h('div', { class: 'eyebrow', text: divisionId }),
        ...teamsInDivision(divisionId).map((t) => this.clubCard(t)))),
      h('div', {
        class: 'tiny center',
        style: 'margin-top:10px',
        text: 'The clubs are the ones you know. Every player, name and rating in '
          + 'them is generated for this game and belongs to nobody.',
      }),
    );
  }

  private clubCard(team: NflTeam): HTMLElement {
    const roster = rosterFor(team, 1, 1);
    const r = teamRatings(roster);
    const best = [...roster].sort((a, b) => b.overall - a.overall).slice(0, 3);
    const c = badgeColours(team);

    const bar = (label: string, value: number): HTMLElement =>
      h('div', { class: 'meter' },
        h('div', { class: 'meter__label tiny', text: label }),
        h('div', { class: 'meter__track' },
          h('div', { class: 'meter__fill', style: `width:${Math.round((value / 99) * 100)}%` })),
        h('div', { class: 'meter__num num', text: String(value) }));

    return panel(`${team.city} ${team.name}`,
      h('div', { class: 'club-line' },
        h('span', {
          class: 'club-line__badge',
          style: `background:${c.fill};border-color:${c.edge};color:${c.text}`,
          text: team.abbr,
        }),
        h('div', { class: 'club-line__body' },
          h('div', { class: 'club-line__note tiny', text: team.stadium }),
          h('div', { class: 'club-line__note tiny', text: `${team.divisionId} · market ${team.market}/5` })),
        h('div', { class: 'club-line__ovr num', text: String(r.overall) })),
      bar('Passing', r.passing),
      bar('Rushing', r.rushing),
      bar('Pass defence', r.passDefense),
      bar('Run defence', r.runDefense),
      h('div', { class: 'tiny', style: 'margin-top:6px' }, 'Best on the roster'),
      ...best.map((p) => h('div', { class: 'small' },
        `${p.pos} ${p.first} ${p.last} — ${p.overall} · ${topAttrs(p)}`)),
    );
  }
}

/** The two things this player is actually good at, so a card says something. */
function topAttrs(p: Player): string {
  const keys = (Object.keys(p.attrs) as (keyof typeof p.attrs)[])
    .filter((k) => k !== 'kicking' || p.pos === 'K' || p.pos === 'P')
    .sort((a, b) => p.attrs[b] - p.attrs[a])
    .slice(0, 2);
  return keys.map((k) => `${ATTR_LABEL[k]} ${p.attrs[k]}`).join(', ');
}

export const positionNames = POSITIONS.map((p) => POSITION_LABEL[p]);
