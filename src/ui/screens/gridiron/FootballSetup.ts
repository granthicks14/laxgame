import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel, segmented } from '../../components';
import { teamRatings } from '../../../sports/football/data';
import { allTeams, rosterFor, type WorldTeam } from '../../../sports/football/world';
import { LEVELS, LEVEL_ORDER } from '../../../sports/football/levels';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS, type GameLengthKey,
} from '../../../sports/football/tuning';
import { currentDifficulty, currentLength, FOOTBALL_SPORT } from '../../../sports/football/settings';
import { setPref } from '../../../state/sportPrefs';
import type { DifficultyKey } from '../../../sports/football/types';
import { Rng } from '../../../core/rng';
import { FootballGameScreen } from './FootballGameScreen';
import { FootballPostGameScreen } from './FootballPostGame';

/* ---------------------------------------------------------------------------
 * SETTING UP A GAME
 * ---------------------------------------------------------------------------
 * Two clubs, a difficulty and a length, and what each choice actually costs
 * shown next to it. Football adds one thing the other sports' setup screens do
 * not need: a LEVEL, because the clubs in this world are spread over seven tiers
 * and a district high school against a professional club is not a game, it is a
 * formality. Picking the tier first keeps the matchups honest without stopping
 * anybody who wants that game from scrolling to it.
 * ------------------------------------------------------------------------- */

export class FootballSetupScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const year = 1;
    const seed = new Rng(`fb:setup:${Date.now()}`).int(1, 0x7fff_ffff);
    let level = LEVEL_ORDER[LEVEL_ORDER.length - 1];
    let pool = allTeams().filter((t) => t.level === level);
    let homeId = pool[0].id;
    let awayId = pool[Math.min(4, pool.length - 1)].id;
    let difficulty = currentDifficulty(app);
    let length = currentLength(app);

    const byId = (id: string): WorldTeam =>
      allTeams().find((t) => t.id === id) ?? pool[0];

    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[difficulty].blurb });
    const lenBlurb = h('div', { class: 'small', text: GAME_LENGTHS[length].blurb });

    const card = (team: WorldTeam): HTMLElement => {
      const r = teamRatings(rosterFor(team, year));
      return h('div', { class: 'club-line' },
        h('span', {
          class: 'club-line__badge',
          style: `background:${team.primary};border-color:${team.secondary}`,
          text: team.abbr,
        }),
        h('div', { class: 'club-line__body' },
          h('div', { class: 'club-line__name', text: `${team.city} ${team.name}` }),
          h('div', {
            class: 'club-line__note tiny',
            text: `${team.stadium} · pass ${r.passing} / run ${r.rushing} · def ${r.defense}`,
          })),
        h('div', { class: 'club-line__ovr num', text: String(r.overall) }));
    };

    const homeSlot = h('div', { class: 'stack', style: 'gap:6px' });
    const awaySlot = h('div', { class: 'stack', style: 'gap:6px' });
    const homeSelect = h('select', { class: 'select' });
    const awaySelect = h('select', { class: 'select' });

    const fillSelects = (): void => {
      for (const [sel, current] of [[homeSelect, homeId], [awaySelect, awayId]] as const) {
        sel.replaceChildren(...pool.map((t) => {
          const opt = h('option', { value: t.id, text: `${t.city} ${t.name}` });
          if (t.id === current) opt.selected = true;
          return opt;
        }));
      }
    };
    const paint = (): void => {
      homeSlot.replaceChildren(card(byId(homeId)));
      awaySlot.replaceChildren(card(byId(awayId)));
    };

    homeSelect.addEventListener('change', () => {
      homeId = homeSelect.value;
      paint();
    });
    awaySelect.addEventListener('change', () => {
      awayId = awaySelect.value;
      paint();
    });

    const setLevel = (next: typeof level): void => {
      level = next;
      pool = allTeams().filter((t) => t.level === level);
      homeId = pool[0].id;
      awayId = pool[Math.min(4, pool.length - 1)].id;
      fillSelects();
      paint();
      levelBlurb.textContent = LEVELS[level].blurb;
    };

    const levelBlurb = h('div', { class: 'small', text: LEVELS[level].blurb });
    fillSelects();
    paint();

    const kick = (humanSide: 'home' | 'away'): void => {
      if (homeId === awayId) {
        app.toast('Pick two different clubs', 'bad');
        return;
      }
      const home = byId(homeId);
      const away = byId(awayId);
      app.replace((a) => new FootballGameScreen(a, {
        config: {
          home: { team: home, roster: rosterFor(home, year) },
          away: { team: away, roster: rosterFor(away, year) },
          humanSide,
          quarterSeconds: GAME_LENGTHS[length].quarterSeconds,
          difficulty: DIFFICULTIES[difficulty],
          seed,
        },
        onComplete: (game) => a.replace((b) => new FootballPostGameScreen(b, game)),
        onQuit: () => a.pop(),
      }));
    };

    this.el = screenEl(
      topbar(app, 'Play Now', 'An exhibition game'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The level',
            segmented(
              LEVEL_ORDER.map((k) => ({ value: k, label: LEVELS[k].short })),
              level,
              (v) => setLevel(v), true),
            levelBlurb),
          panel('Away',
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Club' }),
              awaySelect),
            awaySlot),
          panel('Home',
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Club' }),
              homeSelect),
            homeSlot),
          panel('The game',
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Difficulty' }),
              segmented<DifficultyKey>(
                DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
                difficulty,
                (v) => {
                  difficulty = v;
                  setPref(app, FOOTBALL_SPORT, 'difficulty', v);
                  diffBlurb.textContent = DIFFICULTIES[v].blurb;
                }, true),
              diffBlurb),
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Length' }),
              segmented<GameLengthKey>(
                (Object.keys(GAME_LENGTHS) as GameLengthKey[])
                  .map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
                length,
                (v) => {
                  length = v;
                  setPref(app, FOOTBALL_SPORT, 'length', v);
                  lenBlurb.textContent = GAME_LENGTHS[v].blurb;
                }, true),
              lenBlurb)),
          h('div', { class: 'stack' },
            h('button', {
              class: 'btn btn--primary',
              text: 'Coach the home side',
              on: { click: () => kick('home') },
            }),
            h('button', {
              class: 'btn',
              text: 'Coach the away side',
              on: { click: () => kick('away') },
            })),
        )),
    );
  }
}
