import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel } from '../../../components';
import { worldTeam } from '../../../../sports/football/world';
import { LEVELS } from '../../../../sports/football/levels';
import { POSITION_LABEL } from '../../../../sports/football/data';
import type { FootballCareer } from '../../../../sports/football/career/types';

/* ---------------------------------------------------------------------------
 * WHAT A COACH HAS ACTUALLY DONE
 * ---------------------------------------------------------------------------
 * Every season, every job, and every player who came through. This is the screen
 * a long career is FOR — a Dynasty with no record of itself is twenty identical
 * seasons, and the point of the twentieth is that you remember the third.
 * ------------------------------------------------------------------------- */

export class CareerHistoryScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: FootballCareer) {
    const wins = career.coach.careerWins;
    const losses = career.coach.careerLosses;

    const seasons = panel('Every season',
      h('table', { class: 'box' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'Yr' }), h('th', { text: 'Club' }),
          h('th', { class: 'num', text: 'W-L' }),
          h('th', { text: 'Finish' }))),
        h('tbody', {}, ...[...career.history].reverse().map((s) => {
          const t = worldTeam(s.teamId);
          return h('tr', { class: s.champion ? 'is-mine' : '' },
            h('td', { class: 'num', text: String(s.year) }),
            h('td', { text: `${t?.abbr ?? '??'} · ${LEVELS[s.level].short}` }),
            h('td', { class: 'num', text: `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` }),
            h('td', { text: s.finish }));
        }))));

    const jobs = career.challenge
      ? panel('Every job', ...career.challenge.jobs.map((j) => {
        const t = worldTeam(j.teamId);
        return h('div', { class: 'small' },
          h('b', { text: `${t?.city} ${t?.name}` }),
          ` — ${LEVELS[j.level].short}, year ${j.from} to ${j.to ?? 'now'}`);
      }))
      : null;

    /* THE WALL. Best first, because a programme is remembered by its best
     * players and an alphabetical list of two hundred names is not a wall. */
    const wall = [...career.alumni].sort((a, b) => b.overall - a.overall).slice(0, 25);

    this.el = screenEl(
      topbar(app, 'Career', `${wins}-${losses}${career.coach.careerTies ? `-${career.coach.careerTies}` : ''}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The record',
            h('div', { class: 'career-head' },
              h('div', { class: 'career-head__rec num', text: `${wins}-${losses}` }),
              h('div', { class: 'career-head__bits' },
                h('div', { class: 'small', text: `${career.championships} championship${career.championships === 1 ? '' : 's'}` }),
                h('div', { class: 'small', text: `${career.history.length} seasons` }),
                h('div', { class: 'small', text: `${career.coach.spent} Coach Points spent` })))),
          seasons,
          jobs,
          panel('The wall',
            ...(wall.length
              ? wall.map((a) => h('div', { class: 'small' },
                h('b', { text: `${POSITION_LABEL[a.pos]} ${a.name}` }),
                ` — ${a.overall} overall, left in year ${a.yearLeft} (${a.reason})`))
              : [h('div', { class: 'small', text: 'Nobody has left yet.' })])),
        )),
    );
  }
}
