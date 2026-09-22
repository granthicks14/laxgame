import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl } from '../../../components';
import { badgeColours, teamOr } from '../../../../sports/football/nfl';
import { ROUND_LABEL, type Franchise } from '../../../../sports/football/franchise/types';
import { kv } from './parts';

/* ---------------------------------------------------------------------------
 * THE ONE GAME IN FEBRUARY
 * ---------------------------------------------------------------------------
 * The whole point of the other three hundred and forty, and it gets a screen of
 * its own — once, the moment it happens, and never again. The rest of the
 * franchise is deliberately plain; this is the one place it is allowed to shout.
 * ------------------------------------------------------------------------- */

export class SuperBowlScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, fr: Franchise) {
    const team = teamOr(fr.teamId);
    const c = badgeColours(team);
    const final = fr.playoffs.find((f) => f.round === 'superbowl' && f.played);
    const beatId = final
      ? (final.homeId === fr.teamId ? final.awayId : final.homeId)
      : null;
    const us = final ? (final.homeId === fr.teamId ? final.homeScore : final.awayScore) : 0;
    const them = final ? (final.homeId === fr.teamId ? final.awayScore : final.homeScore) : 0;
    const season = fr.history[fr.history.length - 1];

    this.el = screenEl(
      h('div', { class: 'champ' },
        h('div', { class: 'champ__wash', ariaHidden: true, style: `background:${c.fill}` }),
        h('div', { class: 'champ__hero' },
          h('div', { class: 'champ__eyebrow', text: ROUND_LABEL.superbowl }),
          h('div', { class: 'champ__title display', text: `${team.city} ${team.name}` }),
          h('div', { class: 'champ__banner' },
            h('span', { class: 'champ__banner-edge', ariaHidden: true }),
            h('span', { class: 'champ__banner-text', text: `CHAMPIONS — YEAR ${fr.year - 1}` }),
            h('span', { class: 'champ__banner-edge', ariaHidden: true })),
          final
            ? h('div', { class: 'champ__final' },
              h('span', { class: 'champ__score-team', text: team.abbr }),
              h('span', { class: 'champ__score-num num', text: String(us) }),
              h('span', { class: 'champ__score-dash', text: '–' }),
              h('span', { class: 'champ__score-num num', text: String(them) }),
              h('span', { class: 'champ__score-team', text: beatId ? teamOr(beatId).abbr : '' }))
            : null,
          h('div', { class: 'champ__record' },
            season ? `${season.wins}-${season.losses}${season.ties ? `-${season.ties}` : ''}` : ''),
        ),
        h('div', { class: 'wrapper stack', style: 'margin-top:14px' },
          kv('Head coach', fr.coachName),
          kv('Championships', String(fr.championships)),
          season?.mvp ? kv('Best of the season', season.mvp) : null,
          kv('Support', `${fr.fanSupport} and climbing`),
          h('button', {
            class: 'btn btn--primary btn--block',
            text: 'On to next season',
            on: { click: () => app.pop() },
          })),
      ),
    );
  }
}
