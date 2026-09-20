import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, panel } from '../../../components';
import { hubButton } from '../../../hub';
import { HubTitleScreen } from '../../HubTitle';
import { worldTeam } from '../../../../sports/football/world';
import { LEVELS } from '../../../../sports/football/levels';
import { teamRatings } from '../../../../sports/football/data';
import type { FootballCareer, Fixture } from '../../../../sports/football/career/types';
import {
  configFor, currentWeek, nextGame, recordPlayed, refresh, seasonRecord, simulateOwn,
  simulateSeason, simulateToNext, startNextSeason, topPerformers, weekOf,
} from '../../../../sports/football/career/season';
import { recordOf, sortStandings } from '../../../../sports/football/career/schedule';
import { saveFootballCareer } from '../../../../sports/football/career/save';
import { FootballGameScreen } from '../FootballGameScreen';
import { FootballPostGameScreen } from '../FootballPostGame';
import { CareerRosterScreen } from './CareerRoster';
import { CareerLeagueScreen } from './CareerLeague';
import { CareerOffseasonScreen } from './CareerOffseason';
import { CareerHistoryScreen } from './CareerHistory';

/* ---------------------------------------------------------------------------
 * THE SEASON HUB
 * ---------------------------------------------------------------------------
 * Where a football career lives. One screen, and the thing a coach came here to
 * do is the first thing on it: the next game, with the opponent, the record and
 * a button that starts it.
 *
 * Everything else is one tap away and nothing is more than one tap away, because
 * a career mode whose depth is buried under three menus is a career mode nobody
 * sees the depth of.
 * ------------------------------------------------------------------------- */

export class FootballCareerHub implements Screen {
  el: HTMLElement;
  private app: App;
  private career: FootballCareer;
  private body = h('div', { class: 'wrapper stack' });

  constructor(app: App, career: FootballCareer) {
    this.app = app;
    this.career = career;
    refresh(career);
    this.el = screenEl(this.topbar(), h('div', { class: 'scroll' }, this.body));
    this.paint();
  }

  private topbar(): HTMLElement {
    const team = worldTeam(this.career.teamId);
    return h('div', { class: 'topbar' },
      hubButton(() => this.app.reset((a) => new HubTitleScreen(a))),
      h('div', { class: 'topbar__title display', text: team ? team.name : 'Career' }),
      h('div', {
        class: 'topbar__sub',
        text: `${this.career.mode === 'challenge' ? 'Challenge' : 'Dynasty'} · `
          + `Year ${this.career.year} · ${LEVELS[this.career.level].short}`,
      }));
  }

  private save(): void {
    saveFootballCareer(this.career);
  }

  private reload(): void {
    this.save();
    this.paint();
  }

  onUncovered(): void {
    refresh(this.career);
    this.paint();
  }

  private paint(): void {
    const c = this.career;
    const team = worldTeam(c.teamId);
    const rec = seasonRecord(c);
    const r = teamRatings(c.roster);

    const parts: (HTMLElement | null)[] = [
      this.header(rec, r),
      c.stage === 'offseason' ? this.offseasonPanel() : this.nextPanel(),
      c.stage !== 'offseason' ? this.weekPanel() : null,
      this.squadPanel(),
      panel('The programme',
        this.row('Coach', `${c.coach.name} · ${c.coach.careerWins}-${c.coach.careerLosses}`
          + `${c.coach.careerTies ? `-${c.coach.careerTies}` : ''}`),
        this.row('Coach Points', `${c.coach.points} unspent`),
        this.row('Reputation', `${c.coach.reputation}`),
        c.championships > 0
          ? this.row('Titles', `${c.championships}`)
          : null,
        c.challenge
          ? this.row('The board', c.challenge.heat > 70 ? 'Running out of patience'
            : c.challenge.heat > 40 ? 'Watching' : 'Happy enough')
          : null,
        h('div', { class: 'stack', style: 'margin-top:8px' },
          h('button', {
            class: 'btn',
            text: 'Roster and coaching',
            on: { click: () => this.app.push((a) => new CareerRosterScreen(a, c, () => this.save())) },
          }),
          h('button', {
            class: 'btn',
            text: 'League and standings',
            on: { click: () => this.app.push((a) => new CareerLeagueScreen(a, c)) },
          }),
          h('button', {
            class: 'btn',
            text: 'Career history',
            on: { click: () => this.app.push((a) => new CareerHistoryScreen(a, c)) },
          }))),
      h('div', { class: 'tiny center', text: team ? `${team.stadium}` : '' }),
    ];
    this.body.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
  }

  private row(label: string, value: string): HTMLElement {
    return h('div', { class: 'kv' },
      h('span', { class: 'kv__k', text: label }),
      h('span', { class: 'kv__v', text: value }));
  }

  private header(rec: { wins: number; losses: number; ties: number }, r: { overall: number }): HTMLElement {
    const c = this.career;
    const table = sortStandings(c.standings);
    const place = table.findIndex((s) => s.teamId === c.teamId) + 1;
    return h('div', { class: 'career-head' },
      h('div', { class: 'career-head__rec num', text: `${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ''}` }),
      h('div', { class: 'career-head__bits' },
        h('div', { class: 'small', text: place > 0 ? `${ordinal(place)} of ${table.length}` : '' }),
        h('div', { class: 'small', text: `Team rating ${r.overall}` }),
        c.finish ? h('div', { class: 'small', text: c.finish }) : null));
  }

  /** The next game, and the three things a coach can do with it. */
  private nextPanel(): HTMLElement {
    const c = this.career;
    const f = nextGame(c);
    if (!f) {
      return panel('The season',
        h('div', { class: 'small', text: c.stage === 'postseason' ? 'The postseason is under way.' : 'Nothing left to play.' }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Play it out',
          on: { click: () => { simulateSeason(c); this.reload(); } },
        }));
    }
    const other = worldTeam(f.homeId === c.teamId ? f.awayId : f.homeId);
    const home = f.homeId === c.teamId;
    const theirRec = recordOf(c.standings[other?.id ?? '']);

    return panel(f.postseason
      ? `${LEVELS[c.level].title} — ${f.postseason}`
      : `Week ${f.week}${f.rivalry ? ' — the rivalry' : ''}`,
    h('div', { class: 'club-line' },
      h('span', {
        class: 'club-line__badge',
        style: `background:${other?.primary};border-color:${other?.secondary}`,
        text: other?.abbr ?? '??',
      }),
      h('div', { class: 'club-line__body' },
        h('div', { class: 'club-line__name', text: `${home ? 'v' : 'at'} ${other?.city} ${other?.name}` }),
        h('div', { class: 'club-line__note tiny', text: `${theirRec}${f.conference ? ' · conference game' : ''}` })),
      h('div', {
        class: 'club-line__ovr num',
        text: String(teamRatings(
          f.homeId === c.teamId ? configFor(c, f).away.roster : configFor(c, f).home.roster,
        ).overall),
      })),
    h('div', { class: 'stack' },
      h('button', {
        class: 'btn btn--primary',
        text: 'Play',
        on: { click: () => this.play(f) },
      }),
      h('button', {
        class: 'btn',
        text: 'Simulate this game',
        on: { click: () => { simulateOwn(c, f); this.reload(); } },
      }),
      h('button', {
        class: 'btn btn--muted',
        text: 'Simulate the rest of the season',
        on: { click: () => { simulateSeason(c); this.reload(); } },
      })));
  }

  private play(f: Fixture): void {
    const c = this.career;
    simulateToNext(c);
    this.app.push((a) => new FootballGameScreen(a, {
      config: configFor(c, f),
      onComplete: (game) => {
        recordPlayed(c, f, game);
        this.save();
        a.replace((b) => new FootballPostGameScreen(b, game, {
          onDone: () => { b.pop(); this.paint(); },
          doneLabel: 'Back to the season',
        }));
      },
      onQuit: () => { a.pop(); this.paint(); },
    }));
  }

  /** The rest of the league this week, because a season is not only your games. */
  private weekPanel(): HTMLElement | null {
    const c = this.career;
    const week = currentWeek(c);
    const games = weekOf(c, week).filter((f) => !f.featured);
    if (!games.length) return null;
    return panel(`Around the league — week ${week}`,
      ...games.slice(0, 6).map((f) => {
        const home = worldTeam(f.homeId);
        const away = worldTeam(f.awayId);
        return h('div', { class: 'fixture' },
          h('span', { class: 'fixture__team', text: away?.abbr ?? '' }),
          h('span', { class: 'fixture__score num', text: f.played ? `${f.awayScore}-${f.homeScore}` : 'at' }),
          h('span', { class: 'fixture__team', text: home?.abbr ?? '' }));
      }));
  }

  private squadPanel(): HTMLElement {
    const best = topPerformers(this.career);
    if (!best.length) {
      return panel('The squad',
        h('div', { class: 'small', text: 'Nobody has played a down yet.' }));
    }
    return panel('Leading the way',
      ...best.map(({ player, line }) => h('div', { class: 'small' },
        h('b', { text: `${player.pos} ${player.first} ${player.last}` }),
        ` — ${line}`)));
  }

  private offseasonPanel(): HTMLElement {
    const c = this.career;
    return panel('The offseason',
      h('div', { class: 'small', text: c.finish ?? 'The season is over.' }),
      h('div', { class: 'tiny', text: `${c.lastDepartures.length} left the programme. `
        + `${c.recruits.length} on the recruiting board.` }),
      h('button', {
        class: 'btn btn--primary',
        text: 'Work the offseason',
        on: {
          click: () => this.app.push((a) => new CareerOffseasonScreen(a, c, () => {
            this.save();
            this.paint();
          })),
        },
      }),
      h('button', {
        class: 'btn',
        text: 'Skip to next season',
        on: { click: () => { startNextSeason(c); this.reload(); } },
      }));
  }
}

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
