import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { worldTeam } from '../../../../sports/basketball/world';
import { OFFENSES, DEFENSES, fitLabel } from '../../../../sports/basketball/schemes';
import { teamRatings } from '../../../../sports/basketball/data';
import {
  advanceLeague, awaitingDecision, beginPostseason, gameConfigFor, nextGame,
  nextPostseasonFixture, needsFor, pendingBefore, postseasonComplete, recordPlayedGame,
  regularSeasonDone, runOffseason, schemeAdvice, simulatePostseasonGame,
  simulateRestOfSeason, simulateUserGame, squadLine, teamLeaders,
} from '../../../../sports/basketball/career/season';
import { rowFor, streakText } from '../../../../sports/basketball/career/schedule';
import { squadRank, standingOf, expectedWinPct } from '../../../../sports/basketball/career/league';
import { postseasonFinish, seedNumber, stillAlive } from '../../../../sports/basketball/career/playoffs';
import { coachLevel } from '../../../../sports/basketball/career/coach';
import { rungLabel } from '../../../../sports/basketball/career/ladder';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer, HoopsFixture } from '../../../../sports/basketball/career/types';
import { HoopsGameScreen } from '../HoopsGameScreen';
import { HoopsPostGameScreen } from '../HoopsPostGame';
import { badge, bigButton, bigStat, pill, tileGrid } from './bits';
import { SquadScreen } from './Squad';
import { PlanScreen } from './Plan';
import { OfficeScreen } from './Office';
import { TablesScreen } from './Tables';
import { CareerStatsScreen } from './CareerStats';
import { OffseasonScreen } from './Offseason';
import { JobsScreen } from './Jobs';
import { BoardScreen } from './Board';
import { WindowScreen } from './Window';

/* ---------------------------------------------------------------------------
 * THE CAREER HUB
 * ---------------------------------------------------------------------------
 * The screen a coach lives on, and the one screen in the mode that has to be
 * right. The lesson the lacrosse Super Challenge hub taught, applied from the
 * start: THE THING YOU PRESS FORTY TIMES A SEASON GOES AT THE TOP. Everything
 * read once a week — the table, the squad, the board — goes underneath it as a
 * tile, where it is one tap away and not in the way.
 *
 * Dynasty and Challenge are the same screen. What differs is the header: a
 * dynasty coach sees his programme and his year, a challenge coach sees his rung
 * on the ladder, what the board wants and how close he is to being sacked.
 * ------------------------------------------------------------------------- */

export class HoopsCareerHub implements Screen {
  el: HTMLElement;

  constructor(app: App, private career: HoopsCareer) {
    this.el = this.build(app);
  }

  private refresh(app: App): void {
    saveHoopsCareer(this.career);
    app.replace((a) => new HoopsCareerHub(a, this.career));
  }

  private build(app: App): HTMLElement {
    const c = this.career;
    const team = worldTeam(c.teamId);
    const row = rowFor(c.standings, c.teamId);
    const played = row.wins + row.losses;

    // A career waiting on a job decision has nothing else to offer.
    if (awaitingDecision(c)) {
      return screenEl(
        topbar(app, 'The phone is ringing', rungLabel(c.challenge!.rungIndex)),
        h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
          panel('You have a decision to make',
            h('div', { class: 'small', text: c.challenge!.offerKind === 'promotion'
              ? 'You won it. Programmes above you want to talk.'
              : c.challenge!.offerKind === 'demotion'
                ? 'You have been let go. These are the jobs still open to you.'
                : 'A year out of the game. Somebody will take the call.' }),
            bigButton('See the jobs', `${c.challenge!.offers!.length} on the table`,
              () => app.push((a) => new JobsScreen(a, c)))))),
      );
    }

    return screenEl(
      topbar(app, `${team.city} ${team.name}`, this.subtitle()),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.header(row.wins, row.losses, played),
        this.action(app),
        c.mode === 'challenge' ? this.boardExpects() : null,
        this.tiles(app),
        this.leaders(),
      )),
    );
  }

  private subtitle(): string {
    const c = this.career;
    if (c.mode === 'challenge' && c.challenge) {
      return `${rungLabel(c.challenge.rungIndex)} · year ${c.year}`;
    }
    return `${LEVELS[c.level].short} · year ${c.year}`;
  }

  /* ----------------------------------------------------------- the header */

  private header(wins: number, losses: number, played: number): HTMLElement {
    const c = this.career;
    const rank = squadRank(c);
    const r = teamRatings(c.roster);
    const seed = c.postseasonSeeds ? seedNumber(c, c.teamId) : 0;
    return panel(null,
      h('div', { class: 'bigstat-row' },
        bigStat(`${wins}-${losses}`, played ? streakText(rowFor(c.standings, c.teamId)) : 'no games yet'),
        bigStat(String(r.overall), `squad · ${rank.rank} of ${rank.of}`),
        bigStat(String(c.coach.points), `points · level ${coachLevel(c.coach)}`),
        seed > 0 ? bigStat(`#${seed}`, 'seed') : null),
      h('div', { class: 'tiny', text: squadLine(c) }),
    );
  }

  /* --------------------------------------------------------- the one action */

  private action(app: App): HTMLElement {
    const c = this.career;

    if (c.stage === 'offseason' || c.stage === 'preseason') {
      return panel(null, bigButton(
        'The offseason', 'Departures, development, recruiting and next season',
        () => app.push((a) => new OffseasonScreen(a, c))));
    }

    if (c.stage === 'complete') {
      return panel(null, h('div', { class: 'small',
        text: c.challenge?.endedReason ?? 'This career is over.' }));
    }

    if (!regularSeasonDone(c)) {
      const f = nextGame(c);
      if (!f) {
        return panel(null, bigButton('Into the postseason', postseasonFinish(c) || 'The bracket is drawn',
          () => { beginPostseason(c); this.refresh(app); }));
      }
      return this.fixture(app, f, false);
    }

    if (!c.postseasonSeeds) {
      return panel(null, bigButton(
        'The regular season is over', `See where you finished`,
        () => { beginPostseason(c); this.refresh(app); }));
    }

    if (!postseasonComplete(c)) {
      const f = nextPostseasonFixture(c);
      if (f && (f.homeId === c.teamId || f.awayId === c.teamId)) return this.fixture(app, f, true);
      return panel(null,
        h('div', { class: 'small', text: stillAlive(c)
          ? 'Waiting on the other half of the bracket.'
          : `${postseasonFinish(c)}. The tournament finishes without you.` }),
        bigButton('Play it out', 'Watch the rest of the bracket resolve',
          () => { simulateRestOfSeason(c); this.refresh(app); }));
    }

    return panel(null,
      h('div', { class: 'small', text: `${postseasonFinish(c)}.` }),
      bigButton('Close the season', 'Awards, departures and the offseason',
        () => { runOffseason(c); this.refresh(app); }));
  }

  /** The next game, with both ways of getting through it. */
  private fixture(app: App, f: HoopsFixture, postseason: boolean): HTMLElement {
    const c = this.career;
    const home = f.homeId === c.teamId;
    const other = worldTeam(home ? f.awayId : f.homeId);
    const before = pendingBefore(c);
    const label = postseason ? (f.postseason ?? 'Postseason')
      : f.conference ? 'Conference game' : 'Non-conference';

    const play = (): void => {
      // The rest of the league plays its round first, so the table the player
      // walks back out to is the table after everybody's night, not just his.
      if (!postseason) advanceLeague(c);
      app.push((a) => new HoopsGameScreen(a, {
        config: gameConfigFor(c, f, home ? 'home' : 'away'),
        subtitle: label,
        onQuit: () => a.pop(),
        onComplete: (game) => {
          recordPlayedGame(c, f, game);
          saveHoopsCareer(c);
          a.replace((b) => new HoopsPostGameScreen(b, game, {
            doneLabel: 'Back to the programme',
            onDone: () => b.replace((d) => new HoopsCareerHub(d, c)),
          }));
        },
      }));
    };
    const sim = (): void => {
      if (!postseason) advanceLeague(c);
      if (postseason) simulatePostseasonGame(c, f); else simulateUserGame(c, f);
      this.refresh(app);
    };

    /* And the whole thing at once. A coach who wants to skip a rebuilding year —
     * or who has just taken over a squad he knows cannot win — should not have to
     * press Simulate thirty times to find out how it went. */
    const rest = (): void => {
      simulateRestOfSeason(c);
      this.refresh(app);
    };
    const left = c.schedule.filter((g) => g.featured && !g.played).length;

    return panel(null,
      h('div', { class: 'club-line' },
        badge(other),
        h('div', { class: 'club-line__body' },
          h('div', { class: 'club-line__name', text: `${home ? 'vs' : 'at'} ${other.city} ${other.name}` }),
          h('div', { class: 'club-line__note tiny',
            text: `${label}${f.rivalry ? ' · RIVALRY' : ''} · they are rated `
              + `${standingOf(c, other.id)} in this level` })),
        pill(home ? 'HOME' : 'AWAY', home ? 'good' : 'flat')),
      bigButton('Play it', 'Coach it on the floor', play),
      bigButton('Simulate', before.length > 1
        ? `Straight to the result (${before.length - 1} other games go first)`
        : 'Straight to the result', sim, 'btn--ghost'),
      postseason ? null : bigButton('Simulate the season',
        `All ${left} remaining games and the postseason`, rest, 'btn--ghost'),
    );
  }

  /* ------------------------------------------------ what the board wants */

  private boardExpects(): HTMLElement | null {
    const st = this.career.challenge;
    if (!st) return null;
    const want = Math.round(st.expectation.winPct * 100);
    const heatText = ['Nobody is talking about your job', 'There is some noise',
      'One more season like that and you are out'][st.heat] ?? 'You are out of time';
    return panel('The board',
      h('div', { class: 'small', text: st.expectation.text }),
      h('div', { class: 'kv-row' },
        h('div', { class: 'kv' },
          h('div', { class: 'kv__k tiny', text: 'They want' }),
          h('div', { class: 'kv__v num', text: `${want}%` })),
        h('div', { class: 'kv' },
          h('div', { class: 'kv__k tiny', text: 'Reputation' }),
          h('div', { class: 'kv__v num', text: String(Math.round(st.reputation)) })),
        h('div', { class: 'kv' },
          h('div', { class: 'kv__k tiny', text: 'Season' }),
          h('div', { class: 'kv__v num', text: String(st.tenure + 1) })),
        h('div', { class: 'kv' },
          h('div', { class: 'kv__k tiny', text: 'Titles' }),
          h('div', { class: 'kv__v num',
            text: String(Object.values(st.titles).reduce((a, b) => a + b, 0)) }))),
      h('div', { class: `tiny${st.heat >= 2 ? ' warn' : ''}`, text: heatText }),
    );
  }

  /* ------------------------------------------------------------- the rest */

  private tiles(app: App): HTMLElement {
    const c = this.career;
    const advice = schemeAdvice(c);
    const needs = needsFor(c);
    const urgent = needs.list.filter((n) => n.need >= 3).length;
    return panel(null, tileGrid([
      {
        label: 'Squad',
        note: `${c.roster.length} players · ${urgent ? `${urgent} position${urgent === 1 ? '' : 's'} thin` : 'no holes'}`,
        badge: urgent ? 'NEEDS' : undefined,
        go: () => app.push((a) => new SquadScreen(a, c)),
      },
      {
        label: 'The plan',
        note: `${OFFENSES[c.offense].label} · ${DEFENSES[c.defense].label}`
          + ` · ${fitLabel(Math.min(advice.offenseFit, advice.defenseFit)).toLowerCase()}`,
        badge: advice.shouldChange ? 'FIT' : undefined,
        go: () => app.push((a) => new PlanScreen(a, c)),
      },
      {
        label: 'Coach',
        note: `${c.coach.points} points · level ${coachLevel(c.coach)}`,
        badge: c.coach.points >= 10 ? 'SPEND' : undefined,
        go: () => app.push((a) => new OfficeScreen(a, c)),
      },
      {
        label: 'The table',
        note: `${LEVELS[c.level].short} · ${c.conferenceId.toUpperCase()} conference`,
        go: () => app.push((a) => new TablesScreen(a, c)),
      },
      {
        label: 'Statistics',
        note: 'This season, and the whole career',
        go: () => app.push((a) => new CareerStatsScreen(a, c)),
      },
      ...(c.recruiting ? [{
        label: 'Recruiting',
        note: `Week ${c.recruiting.week} of ${c.recruiting.weeks}`,
        badge: 'OPEN',
        go: () => app.push((a: App) => new BoardScreen(a, c)),
      }] : []),
      ...(c.market.length ? [{
        label: 'The portal',
        note: `${c.pitchesLeft} approach${c.pitchesLeft === 1 ? '' : 'es'} left`,
        badge: c.pitchesLeft > 0 ? 'OPEN' : undefined,
        go: () => app.push((a: App) => new WindowScreen(a, c)),
      }] : []),
    ]));
  }

  private leaders(): HTMLElement | null {
    const c = this.career;
    const rows = teamLeaders(c);
    if (!rows.length) return null;
    const expect = Math.round(expectedWinPct(c) * 100);
    return panelFlush('Leading the way',
      ...rows.map((l) => h('div', { class: 'kv' },
        h('div', { class: 'kv__k tiny', text: l.label }),
        h('div', { class: 'kv__v', text: `${l.name} ${l.value}` }))),
      h('div', { class: 'kv' },
        h('div', { class: 'kv__k tiny', text: 'Par here' }),
        h('div', { class: 'kv__v', text: `${expect}% of games, for this squad` })));
  }
}
