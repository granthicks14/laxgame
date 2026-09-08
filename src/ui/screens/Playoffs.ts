/* ---------------------------------------------------------------------------
 * THE POSTSEASON
 * ---------------------------------------------------------------------------
 * Qualifying for the playoffs is the biggest moment of most seasons, and it
 * used to slide past in one line of small text on the hub. Two screens fix that:
 *
 *   ClinchedScreen   shown once, the moment the bracket is drawn and the coach
 *                    is in it. Record, seed, conference, first opponent.
 *   BracketScreen    the whole bracket, with his team marked, every result, and
 *                    the rounds revealed one at a time — so that after he is
 *                    knocked out he can still follow the tournament to a
 *                    champion instead of being shown the door.
 * ------------------------------------------------------------------------- */

import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, teamBadge, emptyPanel } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import {
  bracketRounds, champion, conferenceRecordText, effectiveTeam, postseasonStatus,
  recordText, seasonFormat, userTeam,
} from '../../league/career';
import type { Career, CareerMode, ScheduledGame } from '../../league/types';
import { divisionName } from './divisionName';
import { trophyIcon } from '../icons';
import { audio } from '../../audio/Audio';

/* --------------------------------------------------------------- clinched */

export class ClinchedScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career, onContinue: () => void) {
    const status = postseasonStatus(career);
    const team = userTeam(career);
    const row = career.standings[career.teamId];
    const fmt = seasonFormat(career);
    const opponent = status?.nextOpponentId ? effectiveTeam(career, status.nextOpponentId) : null;
    audio.play('crowdUp', 0.9);

    career.postseason.clinchedSeen = true;
    saveCareer(career);

    this.el = screenEl(
      topbar(app, 'Postseason', team.short, onContinue),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'chapter' },
            h('div', { class: 'chapter__mark' }, trophyIcon(46)),
            h('div', { class: 'chapter__title display', text: 'You have clinched a playoff spot' }),
            h('div', { class: 'chapter__body', text: `${team.name} has officially qualified for the postseason.` })),

          panel('Where you finished',
            row6('Record', recordText(row)),
            conferenceRecordText(row) ? row6('Conference', conferenceRecordText(row)!) : null,
            row6('Division', divisionName(career)),
            status && status.seed > 0 ? row6('Seed', `${ordinal(status.seed)} of ${status.field}`) : null,
            row6('Playing for', fmt.titleName)),

          opponent && status
            ? panel(status.roundName,
              h('div', { class: 'row', style: 'gap:12px' },
                teamBadge(opponent, 'lg'),
                h('div', { class: 'stack', style: 'gap:2px;flex:1 1 auto;min-width:0' },
                  h('div', { class: 'eyebrow', text: 'First opponent' }),
                  h('div', { class: 'display', style: 'font-size:19px', text: opponent.name }),
                  h('div', { class: 'small', text: `OVR ${opponent.overall} · ${recordText(career.standings[opponent.id])}` }))))
            : null,

          h('button', {
            class: 'btn btn--block',
            text: 'View playoff bracket',
            on: { click: () => app.push((a) => new BracketScreen(a, career.mode)) },
          }),
          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:54px;font-size:18px',
            text: 'Continue to the playoffs',
            on: { click: onContinue },
          }),
        )),
    );
  }
}

function row6(label: string, value: string): HTMLElement {
  return h('div', { class: 'row', style: 'justify-content:space-between;gap:12px' },
    h('span', { class: 'small', text: label }),
    h('span', { class: 'display', style: 'font-size:16px', text: value }));
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/* ---------------------------------------------------------------- bracket */

export class BracketScreen implements Screen {
  el: HTMLElement;

  /**
   * `onBack` is passed when the bracket is shown IN PLACE of the hub — the
   * postseason opens on it automatically — so that leaving it returns to the
   * season rather than popping the whole career off the stack.
   */
  constructor(app: App, mode: CareerMode, onBack?: () => void) {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(topbar(app, 'Bracket', undefined, onBack), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel('No save', 'There is no career on this device.',
          [{ label: 'Back', primary: true, onClick: () => (onBack ? onBack() : app.pop()) }]))));
      return;
    }

    const rounds = bracketRounds(career);
    if (!rounds.length) {
      this.el = screenEl(topbar(app, 'Bracket', undefined, onBack), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'No bracket yet',
          'The postseason starts when the regular season finishes. Every result will be here, '
          + 'and you can follow it to the end whether or not your team is still in it.',
          [{ label: 'Back', primary: true, onClick: () => (onBack ? onBack() : app.pop()) }]))));
      return;
    }

    const body = h('div', { class: 'stack' });
    const render = () => {
      clear(body);
      body.appendChild(standingPanel(career));
      // Rounds are revealed one at a time so a coach who has been knocked out
      // can still watch the tournament play itself out.
      const revealed = Math.max(1, Math.min(rounds.length, career.postseason?.revealed || 0));
      if (!career.postseason.revealed) {
        career.postseason.revealed = Math.max(1, roundsDecidedFor(rounds));
        saveCareer(career);
      }
      const show = Math.max(revealed, roundsDecidedFor(rounds));

      const champId = champion(career);
      if (show >= rounds.length && champId) {
        const champTeam = effectiveTeam(career, champId);
        body.appendChild(h('div', { class: 'trophy' },
          h('div', { class: 'trophy__icon' }, trophyIcon(48)),
          h('div', { class: 'trophy__title', text: `${champTeam.short} win the ${seasonFormat(career).titleName}` }),
          h('div', { class: 'small', style: 'margin-top:6px', text: champId === career.teamId ? 'Yours.' : 'Somebody else\'s year.' })));
      }

      rounds.slice(0, show).forEach((r) => {
        body.appendChild(panel(r.label,
          ...r.games.map((g) => this.matchRow(career, g))));
      });

      if (show < rounds.length) {
        const next = rounds[show];
        body.appendChild(h('button', {
          class: 'btn btn--primary btn--block',
          text: `Play out the ${next.label.toLowerCase()}`,
          on: {
            click: () => {
              career.postseason.revealed = show + 1;
              saveCareer(career);
              render();
            },
          },
        }));
        body.appendChild(h('div', {
          class: 'tiny',
          text: career.eliminated
            ? 'Your season is over, but the tournament is not. Follow it to the end.'
            : 'The rest of the bracket plays out around you.',
        }));
      }
      // Redrawn with the bracket, because the bracket is redrawn every time a
      // round is played out and this is the only way back to the season.
      if (onBack) {
        const alive = !career.eliminated && !career.seasonComplete;
        body.appendChild(h('button', {
          class: `btn btn--block${alive ? ' btn--primary' : ''}`,
          style: 'min-height:48px',
          text: 'Continue to the season',
          on: { click: onBack },
        }));
      }
    };
    render();

    const status = postseasonStatus(career);
    this.el = screenEl(
      topbar(app, 'Playoff bracket',
        status && status.seed > 0 ? `${ordinal(status.seed)} seed` : divisionName(career),
        onBack),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, body)),
    );
  }

  private matchRow(career: Career, g: ScheduledGame): HTMLElement {
    const home = effectiveTeam(career, g.homeId);
    const away = effectiveTeam(career, g.awayId);
    const mine = g.featured;
    const homeWon = g.played && g.homeScore > g.awayScore;
    const seeds = (g.bracket === 'national' ? career.nationalSeeds : career.playoffSeeds) ?? [];
    const seedOf = (id: string) => {
      const i = seeds.indexOf(id);
      return i >= 0 ? `${i + 1}` : '';
    };
    return h('div', {
      class: 'row',
      style: `gap:8px;font-size:13px;padding:5px 4px${mine ? ';background:#ffc53d17' : ''}`,
    },
      h('span', { class: 'num', style: 'width:14px;color:var(--muted)', text: seedOf(away.id) }),
      teamBadge(away, 'sm'),
      h('span', {
        style: `flex:1 1 0;min-width:0;${!homeWon && g.played ? 'font-weight:700' : 'color:var(--text-2)'}`,
        text: away.short,
      }),
      h('span', { class: 'num', text: g.played ? `${g.awayScore}-${g.homeScore}` : 'vs' }),
      h('span', {
        style: `flex:1 1 0;min-width:0;text-align:right;${homeWon ? 'font-weight:700' : 'color:var(--text-2)'}`,
        text: home.short,
      }),
      teamBadge(home, 'sm'),
      h('span', { class: 'num', style: 'width:14px;color:var(--muted)', text: seedOf(home.id) }),
    );
  }
}

/**
 * Where the coach stands in this bracket, in one line he does not have to work
 * out from the rows underneath: his seed, who he plays next, or that his season
 * is over and the tournament is not.
 */
function standingPanel(career: Career): HTMLElement {
  const status = postseasonStatus(career);
  const fmt = seasonFormat(career);
  const team = userTeam(career);
  const opponent = status?.nextOpponentId ? effectiveTeam(career, status.nextOpponentId) : null;
  const champId = champion(career);

  const line = !status?.qualified
    ? `${team.short} did not make the field. The bracket plays out without them.`
    : career.eliminated
      ? `${team.short} are out. The tournament is not — follow it to a champion.`
      : opponent
        ? `${team.short} play ${opponent.name} next, for a place in the ${fmt.titleName}.`
        : champId === career.teamId
          ? `${team.short} won the ${fmt.titleName}.`
          : 'Waiting on the next round.';

  return panel(fmt.titleName,
    h('div', { class: 'row row--wrap', style: 'gap:6px' },
      status && status.qualified && status.seed > 0
        ? h('span', { class: 'pill pill--accent', text: `${ordinal(status.seed)} seed of ${status.field}` })
        : null,
      h('span', {
        class: career.eliminated || !status?.qualified ? 'pill pill--red' : 'pill pill--green',
        text: !status?.qualified ? 'Missed the field'
          : career.eliminated ? 'Eliminated' : status.roundName || 'In the bracket',
      }),
      h('span', { class: 'pill', text: recordText(career.standings[career.teamId]) })),
    h('div', { class: 'small', text: line }));
}

/**
 * How far the coach has already seen for himself: every round his own team
 * played in is his to look at, and nothing past that is revealed until he asks.
 */
function roundsDecidedFor(rounds: { games: ScheduledGame[] }[]): number {
  let n = 1;
  rounds.forEach((r, i) => {
    if (r.games.some((g) => g.featured)) n = Math.max(n, i + 1);
  });
  return n;
}
