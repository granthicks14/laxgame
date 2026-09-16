import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel, segmented } from '../../components';
import { ATTR_LABEL, POSITION_LABEL, POSITIONS, teamRatings, type Player } from '../../../sports/football/data';
import { allTeams, IDENTITY_LABEL, rosterFor, type WorldTeam } from '../../../sports/football/world';
import { LEVELS, LEVEL_ORDER, type FootballLevel } from '../../../sports/football/levels';

/* ---------------------------------------------------------------------------
 * EVERY CLUB IN THE WORLD
 * ---------------------------------------------------------------------------
 * Seven tiers of them, and the point of the screen is the PYRAMID: the same
 * eleven positions at every level, and a top-of-the-table high school reading
 * forty-something next to a bottom-of-the-table professional club reading
 * seventy-something. A player who scrolls it once understands what the climb in
 * Challenge mode is actually for.
 * ------------------------------------------------------------------------- */

export class FootballTeamsScreen implements Screen {
  el: HTMLElement;

  private body = h('div', { class: 'stack' });
  private level: FootballLevel = 'pro';

  constructor(app: App) {
    this.paint();
    this.el = screenEl(
      topbar(app, 'Clubs', `${allTeams().length} in the world`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          segmented(
            LEVEL_ORDER.map((k) => ({ value: k, label: LEVELS[k].short })),
            this.level,
            (v) => { this.level = v; this.paint(); }, true),
          this.body)),
    );
  }

  private paint(): void {
    const info = LEVELS[this.level];
    const teams = allTeams()
      .filter((t) => t.level === this.level)
      .sort((a, b) => b.standing - a.standing);

    this.body.replaceChildren(
      h('div', { class: 'small', text: info.blurb }),
      h('div', {
        class: 'tiny',
        text: `${info.games} games · ${info.playoffTeams} in the postseason · ${info.title}`,
      }),
      ...teams.map((t) => this.clubCard(t)),
    );
  }

  private clubCard(team: WorldTeam): HTMLElement {
    const roster = rosterFor(team, 1);
    const r = teamRatings(roster);
    const best = [...roster].sort((a, b) => b.overall - a.overall).slice(0, 3);

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
          style: `background:${team.primary};border-color:${team.secondary}`,
          text: team.abbr,
        }),
        h('div', { class: 'club-line__body' },
          h('div', { class: 'club-line__note tiny', text: team.stadium }),
          h('div', { class: 'club-line__note tiny', text: IDENTITY_LABEL[team.identity] })),
        h('div', { class: 'club-line__ovr num', text: String(r.overall) })),
      bar('Passing', r.passing),
      bar('Rushing', r.rushing),
      bar('Pass defence', r.passDefense),
      bar('Run defence', r.runDefense),
      h('div', { class: 'tiny', style: 'margin-top:6px' }, 'Best on the roster'),
      ...best.map((p) => h('div', { class: 'small' },
        `${p.pos} ${p.first} ${p.last} — ${p.overall} · `
        + `${topAttrs(p)}`)),
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
