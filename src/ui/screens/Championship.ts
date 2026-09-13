/* ---------------------------------------------------------------------------
 * THE CHAMPIONSHIP
 * ---------------------------------------------------------------------------
 * A title used to arrive as a trophy block half way down the season summary,
 * below the reputation panel, in the same typeface as everything else. It is
 * the thing an entire season of work is for, and in a career that may run forty
 * years it is the handful of moments the coach will remember.
 *
 * So it gets the screen to itself, once per title, in the programme's own
 * colours: the banner, the final it was won in, the record behind it, the
 * players who scored it, and where it sits in the programme's history. Then it
 * hands over to the season summary, which is where the cold numbers live.
 *
 * Shown exactly once, gated on `postseason.titleSeen` in the save — the same
 * mechanism the clinched screen uses — so it never interrupts a coach who has
 * already celebrated and come back to read the tables.
 * ------------------------------------------------------------------------- */

import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, panel } from '../components';
import { saveCareer } from '../../state/saves';
import {
  effectiveTeam, finalGame, seasonFormat, seasonRecordText, userTeam,
} from '../../league/career';
import type { Career } from '../../league/types';
import type { PlayerData } from '../../data/players';
import { GRADE_LABEL } from '../../data/players';
import { trophyIcon } from '../icons';
import { playerPortrait } from '../portrait';
import { audio } from '../../audio/Audio';

/** Who actually produced the season, by points. Labelled as what it is. */
function topScorers(career: Career, n: number): PlayerData[] {
  return [...career.roster]
    .filter((p) => p.season.gamesPlayed > 0)
    .sort((a, b) =>
      (b.season.goals + b.season.assists) - (a.season.goals + a.season.assists)
      || b.season.goals - a.season.goals)
    .slice(0, n);
}

export class ChampionshipScreen implements Screen {
  el: HTMLElement;

  constructor(_app: App, career: Career, onContinue: () => void) {
    const team = userTeam(career);
    const fmt = seasonFormat(career);
    const final = finalGame(career);
    const opponentId = final
      ? (final.homeId === career.teamId ? final.awayId : final.homeId)
      : null;
    const opponent = opponentId ? effectiveTeam(career, opponentId) : null;
    const mine = final ? (final.homeId === career.teamId ? final.homeScore : final.awayScore) : null;
    const theirs = final ? (final.homeId === career.teamId ? final.awayScore : final.homeScore) : null;
    const scorers = topScorers(career, 3);
    const titles = career.championships;

    career.postseason.titleSeen = true;
    saveCareer(career);
    audio.play('crowdUp', 1);
    audio.play('goal');

    // Confetti in the programme's colours. Twenty squares on CSS keyframes —
    // no canvas, no library, nothing to clean up when the screen goes away.
    const colours = [team.primary, team.secondary, '#ffffff', 'var(--accent)'];
    const confetti = h('div', { class: 'champ__confetti', ariaHidden: true },
      ...Array.from({ length: 20 }, (_, i) => h('span', {
        style: `left:${(i * 5.1 + (i % 3) * 2.4).toFixed(1)}%;`
          + `background:${colours[i % colours.length]};`
          + `animation-delay:${(i % 7) * 0.24}s;`
          + `animation-duration:${(2.6 + (i % 5) * 0.32).toFixed(2)}s;`
          + `width:${4 + (i % 3) * 2}px;height:${6 + (i % 2) * 3}px`,
      })));

    this.el = screenEl(
      h('div', { class: 'champ' },
        confetti,
        h('div', { class: 'champ__wash', style: `background:${team.primary}`, ariaHidden: true }),
        h('div', { class: 'scroll' },
          h('div', { class: 'wrapper stack' },
            h('div', { class: 'champ__hero' },
              h('div', { class: 'champ__icon' }, trophyIcon(64)),
              h('div', { class: 'champ__eyebrow display', text: `Year ${career.year} · ${team.abbr}` }),
              h('h1', { class: 'champ__title display', text: fmt.titleName }),
              h('div', { class: 'champ__banner' },
                h('span', { class: 'champ__banner-edge', style: `background:${team.secondary}` }),
                h('span', { class: 'champ__banner-text display', text: `${team.name} · Champions` }),
                h('span', { class: 'champ__banner-edge', style: `background:${team.secondary}` })),
              h('div', { class: 'champ__record', text: `${seasonRecordText(career)} on the season` })),

            final && mine !== null && theirs !== null && opponent
              ? h('div', { class: 'champ__final' },
                h('div', { class: 'eyebrow', text: 'The final' }),
                h('div', { class: 'champ__score' },
                  h('span', { class: 'champ__score-team display', text: team.abbr }),
                  h('span', { class: 'champ__score-num num', text: String(mine) }),
                  h('span', { class: 'champ__score-dash', text: '–' }),
                  h('span', { class: 'champ__score-num num', text: String(theirs) }),
                  h('span', { class: 'champ__score-team display', text: opponent.abbr })),
                h('div', { class: 'small', text: `${team.short} beat ${opponent.name} to win it.` }))
              : null,

            scorers.length
              ? panel('Who scored it', ...scorers.map((p) => h('div', { class: 'row', style: 'gap:10px' },
                playerPortrait(p, team, 48, false),
                h('div', { class: 'stack', style: 'gap:1px;flex:1 1 auto;min-width:0' },
                  h('div', { class: 'name', text: `${p.first} ${p.last}` }),
                  h('div', {
                    class: 'tiny',
                    text: `#${p.number} ${p.pos} · ${GRADE_LABEL[p.grade]} · OVR ${p.overall}`,
                  })),
                h('div', { class: 'display', style: 'font-size:15px;white-space:nowrap' },
                  `${p.season.goals}G ${p.season.assists}A`))))
              : null,

            // `championships` follows the COACH, not the programme — it is not
            // reset when he takes a new job — so it is labelled as what it is.
            panel('In the record books',
              line('Titles in this career', String(titles)),
              line('Seasons coached', String(career.history.length)),
              line('Career record', `${career.careerWins}-${career.careerLosses}`)),

            h('button', {
              class: 'btn btn--primary btn--block',
              style: 'min-height:56px;font-size:19px',
              text: 'Continue',
              on: { click: onContinue },
            }),
          ))),
    );
  }
}

function line(label: string, value: string): HTMLElement {
  return h('div', { class: 'row', style: 'justify-content:space-between;gap:12px' },
    h('span', { class: 'small', text: label }),
    h('span', { class: 'display', style: 'font-size:16px', text: value }));
}
