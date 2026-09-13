import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel, segmented, emptyPanel } from '../../components';
import { TEAMS, generateRoster, teamRatings, type HoopsTeam } from '../../../sports/basketball/data';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS, type GameLengthKey,
} from '../../../sports/basketball/tuning';
import { currentDifficulty, currentLength } from '../../../sports/basketball/settings';
import type { DifficultyKey } from '../../../sports/basketball/types';
import {
  advanceLeague, advancePlayoffs, conferenceTable, createSeason, gameFor, loadSeason,
  nextPlayoffGame, nextUserGame, playoffGameFor, playoffSeeds, recordPlayoff,
  recordUserGame, rollOver, saveSeason, seasonRecord, simulateGame, standings,
  stillPlaying, type HoopsSeason, type PlayoffGame,
} from '../../../sports/basketball/season';
import { HoopsGameScreen } from './HoopsGameScreen';
import { HoopsPostGameScreen } from './HoopsPostGame';

/* ---------------------------------------------------------------------------
 * THE SEASON
 * ---------------------------------------------------------------------------
 * One screen for the whole thing, with the next game at the top where it belongs.
 * The lesson the Super Challenge hub taught applies here from the start: the
 * control the player presses forty times in a season goes above the fold, and the
 * table they read once a week goes under it.
 * ------------------------------------------------------------------------- */

const byId = (id: string): HoopsTeam => TEAMS.find((t) => t.id === id) ?? TEAMS[0];

export class HoopsSeasonScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const season = loadSeason();
    this.el = season ? this.hub(app, season) : this.start(app);
  }

  /* ------------------------------------------------------------- new season */

  private start(app: App): HTMLElement {
    let teamId = TEAMS[0].id;
    let difficulty = currentDifficulty(app);
    let length = currentLength(app);
    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[difficulty].blurb });

    const detail = h('div', { class: 'stack', style: 'gap:4px' });
    const paint = (): void => {
      const team = byId(teamId);
      const r = teamRatings(generateRoster(team, 1));
      detail.replaceChildren(
        h('div', { class: 'club-line' },
          h('span', {
            class: 'club-line__badge',
            style: `background:${team.primary};border-color:${team.secondary}`,
            text: team.abbr,
          }),
          h('div', { class: 'club-line__body' },
            h('div', { class: 'club-line__name', text: `${team.city} ${team.name}` }),
            h('div', { class: 'club-line__note tiny', text: `${team.arena} · ${team.conference} conference` })),
          h('div', { class: 'club-line__ovr num', text: String(r.overall) })),
        h('div', {
          class: 'tiny',
          text: `Offence ${r.offense} · defence ${r.defense} · shooting ${r.shooting}`
            + ` · inside ${r.inside} · rebounding ${r.rebounding} · bench ${r.depth}`,
        }),
      );
    };
    paint();

    return screenEl(
      topbar(app, 'New season', '22 games'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('Your club',
            h('select', {
              class: 'select',
              on: {
                change: (e: Event) => {
                  teamId = (e.target as HTMLSelectElement).value;
                  paint();
                },
              },
            }, ...TEAMS.map((t) => {
              const opt = h('option', { value: t.id, text: `${t.city} ${t.name}` });
              if (t.id === teamId) opt.selected = true;
              return opt;
            })),
            detail,
            h('div', {
              class: 'tiny',
              text: 'A weaker club is a harder season, and the table will say so. '
                + 'Every roster is generated from the season’s own seed, so it stays '
                + 'the same all year.',
            })),

          panel('The season',
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Difficulty' }),
              segmented<DifficultyKey>(
                DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
                difficulty,
                (v) => {
                  difficulty = v;
                  diffBlurb.textContent = DIFFICULTIES[v].blurb;
                }, true),
              diffBlurb),
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Game length' }),
              segmented<GameLengthKey>(
                (Object.keys(GAME_LENGTHS) as GameLengthKey[])
                  .map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
                length,
                (v) => { length = v; }, true)),
            h('div', {
              class: 'tiny',
              text: 'Twenty-two games — everybody home and away — then the top four in '
                + 'each conference play a bracket.',
            })),

          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:52px;font-size:18px',
            text: 'Start the season',
            on: {
              click: () => {
                const season = createSeason(teamId, difficulty, length);
                saveSeason(season);
                app.replace((a) => new HoopsSeasonScreen(a));
              },
            },
          }),
        ),
      ),
    );
  }

  /* ------------------------------------------------------------------- hub */

  private hub(app: App, season: HoopsSeason): HTMLElement {
    // Catch the league up before anything is drawn, so the table on screen is
    // never behind the player's own schedule.
    advanceLeague(season);
    if (season.stage === 'playoffs') advancePlayoffs(season);
    saveSeason(season);

    const team = byId(season.teamId);
    const rec = seasonRecord(season);
    const rebuild = (): void => app.replace((a) => new HoopsSeasonScreen(a));

    return screenEl(
      h('div', { class: 'topbar' },
        h('button', {
          class: 'btn btn--icon btn--ghost',
          ariaLabel: 'Back',
          text: '←',
          on: { click: () => app.pop() },
        }),
        h('div', { class: 'topbar__title display', text: `${team.city} ${team.name}` }),
        h('div', {
          class: 'topbar__sub',
          text: `Year ${season.year} · ${rec.wins}-${rec.losses}`
            + `${season.titles ? ` · ${season.titles} title${season.titles === 1 ? '' : 's'}` : ''}`,
        })),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          this.nextUp(app, season, rebuild),
          this.bracket(season),
          this.table(season),
          panel('Season',
            h('button', {
              class: 'btn btn--block',
              text: 'Simulate to the end of the regular season',
              disabled: season.stage !== 'regular',
              on: {
                click: () => {
                  let guard = 0;
                  while (season.stage === 'regular' && guard++ < 500) {
                    const next = nextUserGame(season);
                    if (!next) { advanceLeague(season); break; }
                    simulateGame(season, next.index);
                    advanceLeague(season);
                  }
                  saveSeason(season);
                  rebuild();
                },
              },
            })),
        ),
      ),
    );
  }

  /** The one control that matters: the next game. */
  private nextUp(app: App, season: HoopsSeason, rebuild: () => void): HTMLElement {
    if (season.stage === 'done') {
      const champ = season.championId ? byId(season.championId) : null;
      const won = season.championId === season.teamId;
      return panel(won ? 'Champions' : 'Season over',
        h('div', {
          class: 'small',
          text: champ
            ? `${champ.city} ${champ.name} took the title.`
            : 'The season is finished.',
        }),
        h('button', {
          class: 'btn btn--primary btn--block',
          text: 'Start next season',
          on: {
            click: () => {
              const next = rollOver(season);
              saveSeason(next);
              rebuild();
            },
          },
        }));
    }

    if (season.stage === 'playoffs') {
      const alive = stillPlaying(season);
      const game = nextPlayoffGame(season);
      if (!alive) {
        return panel('Knocked out',
          h('div', {
            class: 'small',
            text: 'Your season is over, but the bracket is not. Play it out to see who '
              + 'takes the title.',
          }),
          h('button', {
            class: 'btn btn--block',
            text: 'Simulate the rest of the bracket',
            on: {
              click: () => {
                let guard = 0;
                for (;;) {
                  if (guard++ > 40) break;
                  const g = nextPlayoffGame(season);
                  if (!g) break;
                  const sim = playoffGameFor(season, g, null);
                  sim.simulateRest();
                  recordPlayoff(g, sim.score.home, sim.score.away);
                }
                nextPlayoffGame(season);
                saveSeason(season);
                rebuild();
              },
            },
          }));
      }
      if (!game) {
        return emptyPanel('Waiting on the bracket',
          'The other half of the draw has still to be played.',
          [{
            label: 'Play it out',
            primary: true,
            onClick: () => { advancePlayoffs(season); saveSeason(season); rebuild(); },
          }]);
      }
      return this.gamePanel(app, season, {
        title: game.round === 'final' ? 'The Final'
          : game.round === 'conf-final' ? 'Conference final' : 'Conference semi-final',
        homeId: game.homeId,
        awayId: game.awayId,
        play: (humanSide) => {
          const live = playoffGameFor(season, game, humanSide);
          this.launch(app, season, live, () => {
            recordPlayoff(game, live.score.home, live.score.away);
            nextPlayoffGame(season);
            advancePlayoffs(season);
            saveSeason(season);
          });
        },
        sim: () => {
          const sim = playoffGameFor(season, game, null);
          sim.simulateRest();
          recordPlayoff(game, sim.score.home, sim.score.away);
          nextPlayoffGame(season);
          advancePlayoffs(season);
          saveSeason(season);
          rebuild();
        },
      });
    }

    const next = nextUserGame(season);
    if (!next) {
      return emptyPanel('Regular season complete',
        'The bracket is next.',
        [{ label: 'On to the playoffs', primary: true, onClick: rebuild }]);
    }
    // The player's own game number, not the league's fixture index. "Game 6 of
    // 132" is true of the schedule and meaningless to the coach reading it.
    const mine = season.schedule.filter(
      (f) => f.homeId === season.teamId || f.awayId === season.teamId,
    ).length;
    const played = season.results.filter((r) => {
      const f = season.schedule[r.game];
      return f && (f.homeId === season.teamId || f.awayId === season.teamId);
    }).length;
    return this.gamePanel(app, season, {
      title: `Game ${played + 1} of ${mine}`,
      homeId: next.fixture.homeId,
      awayId: next.fixture.awayId,
      play: (humanSide) => {
        const live = gameFor(season, next.index, humanSide);
        this.launch(app, season, live, () => {
          recordUserGame(season, next.index, live);
          advanceLeague(season);
          saveSeason(season);
        });
      },
      sim: () => {
        simulateGame(season, next.index);
        advanceLeague(season);
        saveSeason(season);
        rebuild();
      },
    });
  }

  private gamePanel(
    app: App, season: HoopsSeason,
    o: {
      title: string; homeId: string; awayId: string;
      play: (side: 'home' | 'away') => void;
      sim: () => void;
    },
  ): HTMLElement {
    void app;
    const home = byId(o.homeId);
    const away = byId(o.awayId);
    const mine: 'home' | 'away' = home.id === season.teamId ? 'home' : 'away';
    const opponent = mine === 'home' ? away : home;
    return panel(o.title,
      h('div', { class: 'hoop-next' },
        h('span', {
          class: 'club-line__badge',
          style: `background:${opponent.primary};border-color:${opponent.secondary}`,
          text: opponent.abbr,
        }),
        h('div', null,
          h('div', { class: 'club-line__name', text: `${mine === 'home' ? 'vs' : 'at'} ${opponent.city} ${opponent.name}` }),
          h('div', { class: 'tiny', text: `${home.arena}` }))),
      h('button', {
        class: 'btn btn--primary btn--block',
        style: 'min-height:48px',
        text: 'Play game',
        on: { click: () => o.play(mine) },
      }),
      h('button', {
        class: 'btn btn--block',
        text: 'Simulate this game',
        on: { click: o.sim },
      }));
  }

  private launch(
    app: App, season: HoopsSeason, game: ReturnType<typeof gameFor>, record: () => void,
  ): void {
    app.replace((a) => new HoopsGameScreen(a, {
      config: game.cfg,
      onComplete: () => {
        record();
        a.replace((b) => new HoopsPostGameScreen(b, game, {
          onDone: () => b.replace((c) => new HoopsSeasonScreen(c)),
          doneLabel: 'Back to the season',
        }));
      },
      onQuit: () => a.replace((b) => new HoopsSeasonScreen(b)),
    }));
    void season;
  }

  /** The bracket, once there is one. */
  private bracket(season: HoopsSeason): HTMLElement | null {
    if (season.stage === 'regular') return null;
    const seeds = playoffSeeds(season);
    const row = (g: PlayoffGame): HTMLElement => {
      const home = byId(g.homeId);
      const away = byId(g.awayId);
      const done = g.homeScore !== null && g.awayScore !== null;
      const homeWon = done && (g.homeScore ?? 0) > (g.awayScore ?? 0);
      return h('div', { class: 'po-row' },
        h('span', { class: `po-row__team${done && !homeWon ? ' is-out' : ''}`, text: away.abbr }),
        h('span', { class: 'po-row__score num', text: done ? String(g.awayScore) : '—' }),
        h('span', { class: 'po-row__at', text: 'at' }),
        h('span', { class: `po-row__team${done && homeWon ? '' : done ? ' is-out' : ''}`, text: home.abbr }),
        h('span', { class: 'po-row__score num', text: done ? String(g.homeScore) : '—' }));
    };
    const group = (label: string, round: PlayoffGame['round']): HTMLElement | null => {
      const games = season.playoffs.filter((g) => g.round === round);
      if (!games.length) return null;
      return h('div', { class: 'stack', style: 'gap:3px' },
        h('div', { class: 'tiny', style: 'color:var(--muted)', text: label }),
        ...games.map(row));
    };
    return panel('The bracket',
      h('div', {
        class: 'tiny',
        text: `East: ${seeds.East.map((r) => r.team.abbr).join(', ')}`
          + `  ·  West: ${seeds.West.map((r) => r.team.abbr).join(', ')}`,
      }),
      group('Conference semi-finals', 'conf-semi'),
      group('Conference finals', 'conf-final'),
      group('The Final', 'final'));
  }

  /** The table, under the controls where it belongs. */
  private table(season: HoopsSeason): HTMLElement {
    const conf = (name: 'East' | 'West'): HTMLElement => {
      const rows = conferenceTable(season, name);
      return h('div', { class: 'stack', style: 'gap:2px' },
        h('div', { class: 'tiny', style: 'color:var(--muted)', text: `${name} conference` }),
        h('table', { class: 'standings' },
          h('thead', null,
            h('tr', null,
              h('th', { text: '' }),
              h('th', { text: 'Club' }),
              h('th', { text: 'W' }),
              h('th', { text: 'L' }),
              h('th', { text: 'PD' }))),
          h('tbody', null, ...rows.map((r, i) => h('tr', {
            class: r.team.id === season.teamId ? 'is-mine' : '',
          },
            h('td', { class: 'num', text: String(i + 1) }),
            h('td', null,
              h('span', {
                class: 'standings__badge',
                style: `background:${r.team.primary};border-color:${r.team.secondary}`,
                text: r.team.abbr,
              }),
              r.team.city),
            h('td', { class: 'num', text: String(r.wins) }),
            h('td', { class: 'num', text: String(r.losses) }),
            h('td', {
              class: 'num',
              text: `${r.pointsFor - r.pointsAgainst > 0 ? '+' : ''}${r.pointsFor - r.pointsAgainst}`,
            }))))));
    };
    const all = standings(season);
    return panel('The table',
      conf('East'),
      conf('West'),
      h('div', {
        class: 'tiny',
        text: `Best record: ${all[0].team.city} ${all[0].team.name}`
          + ` (${all[0].wins}-${all[0].losses})`,
      }));
  }
}
