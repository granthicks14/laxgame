import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl } from '../../../components';
import { hubButton } from '../../../hub';
import { HubTitleScreen } from '../../HubTitle';
import { teamOr } from '../../../../sports/football/nfl';
import { teamRatings } from '../../../../sports/football/data';
import {
  configFor, currentWeek, myBye, nextGame, recordPlayed, refresh, seasonRecord,
  simulateOwn, simulatePlayoffRound, simulateSeason, simulateToNext, skipWeek,
  startNextSeason, topPerformers, weekOf,
} from '../../../../sports/football/franchise/season';
import {
  conferenceTable, divisionTable, recordOf, seedsFor,
} from '../../../../sports/football/franchise/schedule';
import { playoffLabel } from '../../../../sports/football/franchise/playoffs';
import { gameRoster, injuredList } from '../../../../sports/football/franchise/world';
import { SALARY_CAP, capUsed, fanMood } from '../../../../sports/football/franchise/club';
import { boardLine, careerOver, takeJob } from '../../../../sports/football/franchise/challenge';
import { recentNews } from '../../../../sports/football/franchise/news';
import { saveFranchise } from '../../../../sports/football/franchise/save';
import type { Fixture, Franchise } from '../../../../sports/football/franchise/types';
import { FootballGameScreen } from '../FootballGameScreen';
import { FootballPostGameScreen } from '../FootballPostGame';
import { RosterScreen } from './RosterScreen';
import { LeagueScreen } from './LeagueScreen';
import { StaffScreen } from './StaffScreen';
import { FacilitiesScreen } from './FacilitiesScreen';
import { TradeScreen } from './TradeScreen';
import { HistoryScreen } from './HistoryScreen';
import { OffseasonScreen } from './OffseasonScreen';
import { SuperBowlScreen } from './SuperBowl';
import { badge, clubLine, kv, money, ordinal, teamName, tile, tileGrid } from './parts';

/* ---------------------------------------------------------------------------
 * THE FRANCHISE HUB
 * ---------------------------------------------------------------------------
 * Where a franchise lives, and the thing a coach came here to do is the first
 * thing on it: the next game, the opponent, and a button that starts it.
 *
 * Everything else is exactly one tap away and nothing is more than one tap
 * away, because a franchise mode whose depth is buried under three menus is a
 * franchise mode nobody sees the depth of. On a phone that matters twice over:
 * the fold is about four hundred pixels down, and what is above it had better
 * be the game.
 * ------------------------------------------------------------------------- */

export class FranchiseHub implements Screen {
  el: HTMLElement;
  private app: App;
  private fr: Franchise;
  private body = h('div', { class: 'wrapper stack' });
  private head = h('div', { class: 'topbar' });

  constructor(app: App, fr: Franchise) {
    this.app = app;
    this.fr = fr;
    refresh(fr);
    this.el = screenEl(this.head, h('div', { class: 'scroll' }, this.body));
    this.paint();
  }

  onUncovered(): void {
    refresh(this.fr);
    this.paint();
  }

  private save(): void {
    saveFranchise(this.fr);
  }

  private reload(): void {
    this.save();
    this.paint();
  }

  private paint(): void {
    const fr = this.fr;
    const team = teamOr(fr.teamId);

    this.head.replaceChildren(
      hubButton(() => this.app.reset((a) => new HubTitleScreen(a))),
      h('div', { class: 'topbar__title display', text: team.name }),
      h('div', {
        class: 'topbar__sub',
        text: `${fr.mode === 'challenge' ? 'Challenge' : 'Dynasty'} · Year ${fr.year} · ${team.divisionId}`,
      }));

    /* THE TROPHY IS SHOWN ONCE, the moment it is won, and never nagged about
     * again. A banner that reappears every time you open the hub stops meaning
     * anything by the second season. */
    if (!fr.titleSeen && fr.championId === fr.teamId) {
      fr.titleSeen = true;
      this.save();
      queueMicrotask(() => this.app.push((a) => new SuperBowlScreen(a, fr)));
    }

    const parts: (HTMLElement | null)[] = [
      this.header(),
      fr.challenge?.sacked ? this.sackedPanel() : null,
      fr.stage === 'offseason' ? this.offseasonPanel() : this.nextPanel(),
      fr.stage === 'regular' || fr.stage === 'playoffs' ? this.weekPanel() : null,
      this.squadPanel(),
      this.clubPanel(),
      this.newsPanel(),
      this.linksPanel(),
      h('div', { class: 'tiny center', text: team.stadium }),
    ];
    this.body.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
  }

  /* ------------------------------------------------------------- the header */

  private header(): HTMLElement {
    const fr = this.fr;
    const team = teamOr(fr.teamId);
    const rec = seasonRecord(fr);
    const table = divisionTable(fr.standings, fr.schedule, team.divisionId);
    const place = table.findIndex((s) => s.teamId === fr.teamId) + 1;
    const conf = conferenceTable(fr.standings, fr.schedule, team.conference);
    const confPlace = conf.findIndex((s) => s.teamId === fr.teamId) + 1;
    const seeds = seedsFor(fr.standings, fr.schedule, team.conference);
    const seed = seeds.find((s) => s.teamId === fr.teamId);

    return h('div', { class: 'career-head' },
      h('div', {
        class: 'career-head__rec num',
        text: `${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ''}`,
      }),
      h('div', { class: 'career-head__bits' },
        h('div', { class: 'small', text: place > 0 ? `${ordinal(place)} in the ${team.division}` : '' }),
        h('div', {
          class: 'small',
          text: seed
            ? `${ordinal(seed.seed)} seed${seed.bye ? ' — first-round bye' : ''}`
            : `${ordinal(confPlace)} in the ${team.conference} — outside the picture`,
        }),
        h('div', { class: 'small', text: `Team rating ${teamRatings(gameRoster(fr)).overall}` }),
        fr.finish ? h('div', { class: 'small', text: fr.finish }) : null));
  }

  /* --------------------------------------------------------- the next game */

  private nextPanel(): HTMLElement {
    const fr = this.fr;
    const f = nextGame(fr);

    if (!f) {
      /* NOTHING FOR YOU THIS WEEK. A bye, or a playoff round you are not in —
       * and both need a button, because a screen with no way forward is a
       * screen somebody is stuck on. */
      const bye = myBye(fr);
      const week = currentWeek(fr);
      const isBye = fr.stage === 'regular' && bye === week;
      return panel(fr.stage === 'playoffs' ? 'The playoffs' : isBye ? 'Bye week' : 'The season',
        h('div', {
          class: 'small',
          text: fr.stage === 'playoffs'
            ? 'January carries on without you.'
            : isBye ? 'No game this week. The league plays on.'
              : 'Nothing left on the card.',
        }),
        h('button', {
          class: 'btn btn--primary',
          text: fr.stage === 'playoffs' ? 'Play the round out' : 'Move on a week',
          on: {
            click: () => {
              if (fr.stage === 'playoffs') simulatePlayoffRound(fr);
              else skipWeek(fr);
              this.reload();
            },
          },
        }),
        h('button', {
          class: 'btn btn--muted',
          text: 'Simulate the rest of the season',
          on: { click: () => { simulateSeason(fr); this.reload(); } },
        }));
    }

    const otherId = f.homeId === fr.teamId ? f.awayId : f.homeId;
    const other = teamOr(otherId);
    const home = f.homeId === fr.teamId;
    const theirRec = recordOf(fr.standings[otherId]);
    const theirRating = teamRatings(configFor(fr, f)[home ? 'away' : 'home'].roster).overall;

    /* JANUARY ESCALATES, and the screen should say so. A divisional game that
     * reads like week six is a divisional game that feels like week six. */
    const stakes = f.round === 'superbowl'
      ? 'One game. Everything.'
      : f.round === 'conference'
        ? 'Win this and you play in February.'
        : f.round === 'divisional'
          ? 'Two wins from the Super Bowl. Lose and the season is over.'
          : f.round === 'wildcard'
            ? 'Win or go home.'
            : this.stakesLine(f);

    return panel(
      f.round ? playoffLabel(f) : `Week ${f.week}${f.rivalry ? ' — the rivalry' : ''}`,
      stakes ? h('div', { class: `small${f.round ? ' accent' : ''}`, text: stakes }) : null,
      clubLine(
        otherId,
        `${home ? 'v' : 'at'} ${other.city} ${other.name}`,
        `${theirRec}${f.division ? ' · division game' : f.conference ? ' · conference game' : ''}`,
        String(theirRating),
      ),
      h('div', { class: 'stack' },
        h('button', {
          class: 'btn btn--primary',
          text: 'Play',
          on: { click: () => this.play() },
        }),
        h('button', {
          class: 'btn',
          text: 'Simulate this game',
          on: { click: () => { simulateOwn(fr, f); this.reload(); } },
        }),
        h('button', {
          class: 'btn btn--muted',
          text: 'Simulate the rest of the season',
          on: { click: () => { simulateSeason(fr); this.reload(); } },
        })));
  }

  /**
   * WHAT THIS ONE IS WORTH, in the regular season. Only said when it is worth
   * saying: a line on every fixture is a line nobody reads by week four.
   */
  private stakesLine(f: Fixture): string | null {
    const fr = this.fr;
    const team = teamOr(fr.teamId);
    const played = (fr.standings[fr.teamId]?.wins ?? 0)
      + (fr.standings[fr.teamId]?.losses ?? 0) + (fr.standings[fr.teamId]?.ties ?? 0);
    if (f.rivalry) return 'The one the town circles.';
    if (played < 10) return f.division ? 'A division game. These are the ones that decide it.' : null;
    const seeds = seedsFor(fr.standings, fr.schedule, team.conference);
    const mine = seeds.find((s) => s.teamId === fr.teamId);
    if (mine && mine.seed === 1) return 'You are holding the bye. Keep it.';
    if (mine) return 'You are in, on today\u2019s numbers. Nothing is signed.';
    const table = conferenceTable(fr.standings, fr.schedule, team.conference);
    const place = table.findIndex((s) => s.teamId === fr.teamId) + 1;
    if (place > 0 && place <= 10) return 'On the outside, and close enough to matter.';
    return null;
  }

  private play(): void {
    const fr = this.fr;
    simulateToNext(fr);
    // Simulating up to the game can finish the season if the fixture vanished.
    const live = nextGame(fr);
    if (!live) { this.reload(); return; }
    this.app.push((a) => new FootballGameScreen(a, {
      config: configFor(fr, live),
      onPlanChange: (plan) => { fr.gamePlan = plan; this.save(); },
      onComplete: (game) => {
        recordPlayed(fr, live, game);
        this.save();
        a.replace((b) => new FootballPostGameScreen(b, game, {
          onDone: () => { b.pop(); this.paint(); },
          doneLabel: 'Back to the season',
        }));
      },
      onQuit: () => { a.pop(); this.paint(); },
    }));
  }

  /* --------------------------------------------------- the rest of the week */

  private weekPanel(): HTMLElement | null {
    const fr = this.fr;
    const week = currentWeek(fr);
    const games = weekOf(fr, week).filter((f) => !f.featured);
    if (!games.length) return null;
    return panel(
      fr.stage === 'playoffs' ? 'Elsewhere in January' : `Around the league — week ${week}`,
      ...games.slice(0, 8).map((f) => h('div', { class: 'fixture' },
        h('span', { class: 'fixture__team', text: teamOr(f.awayId).abbr }),
        h('span', {
          class: 'fixture__score num',
          text: f.played ? `${f.awayScore}-${f.homeScore}` : 'at',
        }),
        h('span', { class: 'fixture__team', text: teamOr(f.homeId).abbr }))));
  }

  /* -------------------------------------------------------------- the squad */

  private squadPanel(): HTMLElement {
    const fr = this.fr;
    const best = topPerformers(fr);
    const hurt = injuredList(fr).filter((p) => (p.injury?.weeks ?? 0) >= 1);
    return panel('The squad',
      ...(best.length
        ? best.map(({ player, line }) => h('div', { class: 'small' },
          h('b', { text: `${player.pos} ${player.first} ${player.last}` }),
          ` — ${line}`))
        : [h('div', { class: 'small', text: 'Nobody has played a down yet.' })]),
      hurt.length
        ? h('div', { class: 'tiny warn', style: 'margin-top:6px' },
          `Out: ${hurt.slice(0, 4).map((p) => `${p.pos} ${p.last} (${p.injury!.weeks}w)`).join(', ')}`
          + `${hurt.length > 4 ? ` and ${hurt.length - 4} more` : ''}`)
        : null);
  }

  /* --------------------------------------------------------------- the club */

  private clubPanel(): HTMLElement {
    const fr = this.fr;
    const used = capUsed(fr.roster);
    return panel('The club',
      tileGrid(
        tile('Cap room', money(Math.max(0, SALARY_CAP - used)), `${money(used)} of ${SALARY_CAP}M`),
        tile('Funds', money(fr.funds), 'Staff and buildings'),
        tile('Support', String(fr.fanSupport), fanMood(fr.fanSupport)),
        tile('Roster', String(fr.roster.length), `${fr.staff.HC.overall} head coach`)),
      fr.challenge && !fr.challenge.sacked
        ? kv('The owner', boardLine(fr))
        : null,
      fr.championships > 0 ? kv('Championships', String(fr.championships)) : null);
  }

  /* ---------------------------------------------------------------- the wire */

  private newsPanel(): HTMLElement | null {
    const items = recentNews(this.fr, 5);
    if (!items.length) return null;
    return panel('The wire',
      ...items.map((n) => h('div', { class: 'small' },
        h('span', { class: 'eyebrow', text: n.week ? `W${n.week}` : String(n.year) }),
        ` ${n.text}`)));
  }

  /* -------------------------------------------------------------- the links */

  private linksPanel(): HTMLElement {
    const fr = this.fr;
    const go = (make: (a: App) => Screen) => () => this.app.push(make);
    const link = (label: string, make: (a: App) => Screen): HTMLElement =>
      h('button', { class: 'btn', text: label, on: { click: go(make) } });
    return panel('The front office',
      h('div', { class: 'stack' },
        link('Roster and depth', (a) => new RosterScreen(a, fr, () => this.save())),
        link('League, standings and bracket', (a) => new LeagueScreen(a, fr)),
        link('Coaching staff', (a) => new StaffScreen(a, fr, () => this.save())),
        link('Facilities and finances', (a) => new FacilitiesScreen(a, fr, () => this.save())),
        link('Trade desk', (a) => new TradeScreen(a, fr, () => this.save())),
        link('Franchise history', (a) => new HistoryScreen(a, fr))));
  }

  /* ----------------------------------------------------------- the offseason */

  private offseasonPanel(): HTMLElement {
    const fr = this.fr;
    return panel('The offseason',
      h('div', { class: 'small', text: fr.finish ?? 'The season is over.' }),
      h('div', {
        class: 'tiny',
        text: `${fr.lastDepartures.length} retired. `
          + `${fr.roster.filter((p) => p.contractYears <= 0).length} out of contract. `
          + `${fr.scoutPoints} scouting trips to spend.`,
      }),
      h('button', {
        class: 'btn btn--primary',
        text: 'Work the offseason',
        on: {
          click: () => this.app.push((a) => new OffseasonScreen(a, fr, () => {
            this.save();
            this.paint();
          })),
        },
      }),
      h('button', {
        class: 'btn',
        text: 'Skip to camp',
        on: { click: () => { startNextSeason(fr); this.reload(); } },
      }));
  }

  /* ------------------------------------------------------------ the hot seat */

  private sackedPanel(): HTMLElement {
    const fr = this.fr;
    const ch = fr.challenge!;
    if (careerOver(fr)) {
      return panel('Out of a job',
        h('div', { class: 'small', text: 'Nobody is calling. That is how it ends for most of them.' }),
        h('button', {
          class: 'btn',
          text: 'Back to the hub',
          on: { click: () => this.app.reset((a) => new HubTitleScreen(a)) },
        }));
    }
    return panel('Out of a job',
      h('div', { class: 'small', text: 'Somebody still wants you. Pick one.' }),
      ...ch.offers.map((id) => clubLine(
        id, teamName(id), teamOr(id).divisionId, '',
        () => {
          if (takeJob(fr, id)) {
            startNextSeason(fr);
            this.reload();
          }
        },
      )),
      h('div', { class: 'tiny', text: 'A new club means a new roster, new buildings and nothing in the bank. Your record follows you.' }));
  }
}

export { badge };
