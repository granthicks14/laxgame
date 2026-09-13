import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel } from '../../components';
import {
  ATTR_LABEL, POSITIONS, TEAMS, attrKeysFor, generateRoster, heightText, teamRatings,
  type HoopsPlayer, type HoopsTeam,
} from '../../../sports/basketball/data';

/* ---------------------------------------------------------------------------
 * THE CLUBS
 * ---------------------------------------------------------------------------
 * Every roster in the league, and — one tap deeper — every player in it with the
 * attributes his own position is actually judged on. A centre is not shown a
 * three-point rating as though it were the point of him.
 * ------------------------------------------------------------------------- */

const SEED = 1;

export class HoopsTeamsScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const ranked = [...TEAMS]
      .map((team) => ({ team, r: teamRatings(generateRoster(team, SEED)) }))
      .sort((a, b) => b.r.overall - a.r.overall);

    this.el = screenEl(
      topbar(app, 'Clubs', `${TEAMS.length} in the league`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          ...ranked.map(({ team, r }) => h('button', {
            class: 'club-card',
            on: { click: () => app.push((a) => new HoopsRosterScreen(a, team)) },
          },
            h('span', {
              class: 'club-line__badge',
              style: `background:${team.primary};border-color:${team.secondary}`,
              text: team.abbr,
            }),
            h('span', { class: 'club-card__body' },
              h('span', { class: 'club-line__name', text: `${team.city} ${team.name}` }),
              h('span', {
                class: 'tiny',
                text: `${team.conference} · ${team.arena} · offence ${r.offense}`
                  + ` · defence ${r.defense} · bench ${r.depth}`,
              })),
            h('span', { class: 'club-line__ovr num', text: String(r.overall) }))),
        ),
      ),
    );
  }
}

export class HoopsRosterScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, team: HoopsTeam) {
    const roster = generateRoster(team, SEED);
    const r = teamRatings(roster);
    const byPos = POSITIONS.map((pos) => ({
      pos,
      players: roster.filter((p) => p.pos === pos).sort((a, b) => b.overall - a.overall),
    }));

    this.el = screenEl(
      topbar(app, `${team.city} ${team.name}`, team.conference),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The club',
            h('div', {
              class: 'small',
              text: `${team.arena}. Overall ${r.overall} — offence ${r.offense},`
                + ` defence ${r.defense}, shooting ${r.shooting}, inside ${r.inside},`
                + ` rebounding ${r.rebounding}, ball handling ${r.ballHandling},`
                + ` and a bench averaging ${r.depth}.`,
            })),
          ...byPos.map(({ pos, players }) => panel(pos,
            ...players.map((p) => playerRow(app, p)))),
        ),
      ),
    );
  }
}

function playerRow(app: App, p: HoopsPlayer): HTMLElement {
  return h('button', {
    class: 'roster-row',
    on: { click: () => app.push((a) => new HoopsPlayerScreen(a, p)) },
  },
    h('span', { class: 'roster-row__num num', text: String(p.number) }),
    h('span', { class: 'roster-row__name', text: `${p.first} ${p.last}` }),
    h('span', { class: 'roster-row__meta tiny', text: `${heightText(p.heightIn)} · ${p.years}y` }),
    h('span', { class: 'roster-row__ovr num', text: String(p.overall) }));
}

export class HoopsPlayerScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, p: HoopsPlayer) {
    // Only the attributes this position is judged on, in the order they matter.
    const keys = attrKeysFor(p.pos);
    const bar = (label: string, value: number): HTMLElement =>
      h('div', { class: 'rate' },
        h('div', { class: 'rate__label', text: label }),
        h('div', { class: 'rate__track' },
          h('div', {
            class: 'rate__fill',
            style: `width:${Math.max(2, Math.min(100, value))}%;background:var(--accent)`,
          })),
        h('div', { class: 'rate__val num', text: String(value) }));

    this.el = screenEl(
      topbar(app, `${p.first} ${p.last}`, `#${p.number} · ${p.pos}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The player',
            h('div', {
              class: 'small',
              text: `${heightText(p.heightIn)}, ${p.years} year${p.years === 1 ? '' : 's'}`
                + ` in the league, rated ${p.overall} overall at ${p.pos}.`,
            })),
          panel('What he is judged on',
            ...keys.map((k) => bar(ATTR_LABEL[k], p.attrs[k]))),
          panel('Everything else',
            ...(Object.keys(p.attrs) as (keyof typeof p.attrs)[])
              .filter((k) => !keys.includes(k))
              .map((k) => bar(ATTR_LABEL[k], p.attrs[k]))),
        ),
      ),
    );
  }
}
