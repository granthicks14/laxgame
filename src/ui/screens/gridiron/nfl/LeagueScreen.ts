import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, segmented, topbar } from '../../../components';
import {
  CONFERENCES, divisionsIn, teamOr, type Conference,
} from '../../../../sports/football/nfl';
import {
  conferenceTable, divisionTable, seedsFor, winPct,
} from '../../../../sports/football/franchise/schedule';
import { ROUND_ORDER, playoffLabel } from '../../../../sports/football/franchise/playoffs';
import { ROUND_LABEL, type Franchise } from '../../../../sports/football/franchise/types';
import { badge, ordinal } from './parts';

/* ---------------------------------------------------------------------------
 * THE LEAGUE
 * ---------------------------------------------------------------------------
 * Three things, and a football season is all three at once: the division you
 * have to win, the conference you are seeded in, and your own seventeen games.
 *
 * THE PLAYOFF PICTURE IS SHOWN IN OCTOBER, not only in January. Most of what
 * makes week eleven worth caring about is knowing you are the seventh seed by
 * half a game, and a franchise that only computes the bracket once the season
 * is over has thrown that away.
 * ------------------------------------------------------------------------- */

type View = 'divisions' | 'picture' | 'schedule' | 'bracket';

export class LeagueScreen implements Screen {
  el: HTMLElement;
  private fr: Franchise;
  private view: View = 'divisions';
  private conference: Conference;
  private body = h('div', { class: 'stack' });

  constructor(app: App, fr: Franchise) {
    this.fr = fr;
    this.conference = teamOr(fr.teamId).conference;
    this.el = screenEl(
      topbar(app, 'The league', `Year ${fr.year}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        segmented<View>([
          { value: 'divisions', label: 'Divisions' },
          { value: 'picture', label: 'Picture' },
          { value: 'schedule', label: 'Your games' },
          { value: 'bracket', label: 'Bracket' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        segmented<Conference>(
          CONFERENCES.map((c) => ({ value: c, label: c })),
          this.conference,
          (v) => { this.conference = v; this.paint(); }, true),
        this.body)),
    );
    this.paint();
  }

  private paint(): void {
    if (this.view === 'divisions') this.body.replaceChildren(...this.divisions());
    else if (this.view === 'picture') this.body.replaceChildren(this.picture());
    else if (this.view === 'schedule') this.body.replaceChildren(this.schedule());
    else this.body.replaceChildren(...this.bracket());
  }

  private table(rows: ReturnType<typeof divisionTable>, showSeed = false): HTMLElement {
    const fr = this.fr;
    const seeds = seedsFor(fr.standings, fr.schedule, this.conference);
    return h('table', { class: 'standings' },
      h('thead', null, h('tr', null,
        h('th', { text: showSeed ? '#' : '' }),
        h('th', { text: 'Club' }),
        h('th', { text: 'W' }),
        h('th', { text: 'L' }),
        h('th', { text: 'PCT' }),
        h('th', { text: 'PD' }))),
      h('tbody', null, ...rows.map((s, i) => {
        const team = teamOr(s.teamId);
        const seed = seeds.find((x) => x.teamId === s.teamId);
        return h('tr', { class: s.teamId === fr.teamId ? 'is-mine' : '' },
          h('td', { class: 'num', text: showSeed ? String(seed?.seed ?? '') : String(i + 1) }),
          h('td', null, badge(s.teamId, 'sm'), h('span', { text: ` ${team.abbr}` })),
          h('td', { class: 'num', text: String(s.wins) }),
          h('td', { class: 'num', text: String(s.losses + (s.ties ? 0 : 0)) }),
          h('td', { class: 'num', text: winPct(s).toFixed(3).slice(1) }),
          h('td', { class: 'num', text: String(s.pointsFor - s.pointsAgainst) }));
      })));
  }

  private divisions(): HTMLElement[] {
    return divisionsIn(this.conference).map((divisionId) =>
      panel(divisionId, this.table(divisionTable(this.fr.standings, this.fr.schedule, divisionId))));
  }

  private picture(): HTMLElement {
    const fr = this.fr;
    const seeds = seedsFor(fr.standings, fr.schedule, this.conference);
    const table = conferenceTable(fr.standings, fr.schedule, this.conference);
    const inIt = new Set(seeds.map((s) => s.teamId));
    const bubble = table.filter((s) => !inIt.has(s.teamId)).slice(0, 4);
    return panel(`${this.conference} playoff picture`,
      h('div', { class: 'tiny', text: 'Four division winners, then the three best of everybody else. The top seed sits out the first weekend.' }),
      ...seeds.map((s) => h('div', { class: 'fixture' },
        h('span', { class: 'fixture__team', text: `${s.seed}.` }),
        badge(s.teamId, 'sm'),
        h('span', {
          class: 'fixture__score',
          text: `${teamOr(s.teamId).city} ${teamOr(s.teamId).name}`,
        }),
        h('span', {
          class: 'fixture__tag tiny',
          text: s.bye ? 'BYE' : s.divisionId ? 'DIV' : 'WC',
        }))),
      h('div', { class: 'eyebrow', style: 'margin-top:8px', text: 'On the outside' }),
      ...bubble.map((s, i) => h('div', { class: 'fixture' },
        h('span', { class: 'fixture__team', text: `${8 + i}.` }),
        badge(s.teamId, 'sm'),
        h('span', { class: 'fixture__score', text: teamOr(s.teamId).name }),
        h('span', { class: 'fixture__tag tiny', text: `${s.wins}-${s.losses}` }))));
  }

  private schedule(): HTMLElement {
    const fr = this.fr;
    const mine = [...fr.schedule, ...fr.playoffs]
      .filter((f) => f.homeId === fr.teamId || f.awayId === fr.teamId)
      .sort((a, b) => a.week - b.week);
    const bye = (() => {
      const weeks = new Set(mine.filter((f) => !f.round).map((f) => f.week));
      for (let w = 1; w <= 18; w++) if (!weeks.has(w)) return w;
      return null;
    })();

    return panel('Your season',
      ...mine.map((f) => {
        const home = f.homeId === fr.teamId;
        const otherId = home ? f.awayId : f.homeId;
        const us = home ? f.homeScore : f.awayScore;
        const them = home ? f.awayScore : f.homeScore;
        const result = f.played
          ? (us > them ? 'W' : us < them ? 'L' : 'T')
          : '';
        return h('div', { class: 'fixture' },
          h('span', { class: 'fixture__team tiny', text: f.round ? playoffLabel(f).slice(0, 8) : `W${f.week}` }),
          h('span', { class: 'fixture__team', text: home ? 'v' : '@' }),
          badge(otherId, 'sm'),
          h('span', {
            class: 'fixture__score num',
            text: f.played ? `${result} ${us}-${them}` : '—',
          }),
          h('span', {
            class: 'fixture__tag tiny',
            text: f.rivalry ? 'RIVALRY' : f.division ? 'DIV' : f.conference ? 'CONF' : '',
          }));
      }),
      bye ? h('div', { class: 'tiny', text: `Bye in week ${bye}.` }) : null);
  }

  private bracket(): HTMLElement[] {
    const fr = this.fr;
    if (!fr.playoffs.length) {
      return [panel('The bracket',
        h('div', { class: 'small', text: 'Nothing is seeded until the seventeen are played.' }))];
    }
    return ROUND_ORDER.map((round) => {
      const games = fr.playoffs.filter((f) => f.round === round
        && (round === 'superbowl' || teamOr(f.homeId).conference === this.conference));
      if (!games.length) return null;
      return panel(round === 'superbowl' ? ROUND_LABEL.superbowl : `${this.conference} ${ROUND_LABEL[round]}`,
        ...games.map((f) => h('div', { class: 'fixture' },
          badge(f.awayId, 'sm'),
          h('span', { class: 'fixture__team', text: teamOr(f.awayId).abbr }),
          h('span', {
            class: 'fixture__score num',
            text: f.played ? `${f.awayScore}-${f.homeScore}` : 'at',
          }),
          h('span', { class: 'fixture__team', text: teamOr(f.homeId).abbr }),
          badge(f.homeId, 'sm'))));
    }).filter((x): x is HTMLElement => x !== null);
  }
}

export { ordinal };
