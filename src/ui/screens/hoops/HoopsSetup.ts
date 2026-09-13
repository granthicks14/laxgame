import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel, segmented } from '../../components';
import { TEAMS, generateRoster, teamRatings, type HoopsTeam } from '../../../sports/basketball/data';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS, type GameLengthKey,
} from '../../../sports/basketball/tuning';
import { currentDifficulty, currentLength, HOOPS_SPORT } from '../../../sports/basketball/settings';
import { setPref } from '../../../state/sportPrefs';
import type { DifficultyKey } from '../../../sports/basketball/types';
import { Rng } from '../../../core/rng';
import { HoopsGameScreen } from './HoopsGameScreen';
import { HoopsPostGameScreen } from './HoopsPostGame';

/* ---------------------------------------------------------------------------
 * SETTING UP A GAME
 * ---------------------------------------------------------------------------
 * Two clubs, a difficulty and a length, and what each choice actually means
 * shown next to it: the overall of the roster you are picking, and the score a
 * game of that length is expected to produce. A setup screen that hides the
 * consequences of its own options is a screen the player has to learn by losing.
 * ------------------------------------------------------------------------- */

export class HoopsSetupScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const seed = new Rng(`hoops:setup:${Date.now()}`).int(1, 0x7fff_ffff);
    let homeId = TEAMS[0].id;
    let awayId = TEAMS[6].id;
    let difficulty = currentDifficulty(app);
    let length = currentLength(app);

    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[difficulty].blurb });
    const lenBlurb = h('div', { class: 'small', text: GAME_LENGTHS[length].blurb });

    const card = (team: HoopsTeam): HTMLElement => {
      const r = teamRatings(generateRoster(team, seed));
      return h('div', { class: 'club-line' },
        h('span', {
          class: 'club-line__badge',
          style: `background:${team.primary};border-color:${team.secondary}`,
          text: team.abbr,
        }),
        h('div', { class: 'club-line__body' },
          h('div', { class: 'club-line__name', text: `${team.city} ${team.name}` }),
          h('div', { class: 'club-line__note tiny', text: `${team.arena} · ${team.conference}` })),
        h('div', { class: 'club-line__ovr num', text: String(r.overall) }));
    };

    const homeSlot = h('div', { class: 'stack', style: 'gap:6px' });
    const awaySlot = h('div', { class: 'stack', style: 'gap:6px' });
    const paint = (): void => {
      homeSlot.replaceChildren(card(byId(homeId)));
      awaySlot.replaceChildren(card(byId(awayId)));
    };
    paint();

    const picker = (
      label: string, get: () => string, set: (id: string) => void,
    ): HTMLElement => h('div', { class: 'stack', style: 'gap:6px' },
      h('div', { class: 'field-row__label', text: label }),
      h('select', {
        class: 'select',
        on: {
          change: (e: Event) => {
            set((e.target as HTMLSelectElement).value);
            paint();
          },
        },
      }, ...TEAMS.map((t) => {
        const opt = h('option', { value: t.id, text: `${t.city} ${t.name}` });
        if (t.id === get()) opt.selected = true;
        return opt;
      })));

    const tip = (humanSide: 'home' | 'away'): void => {
      if (homeId === awayId) {
        app.toast('Pick two different clubs', 'bad');
        return;
      }
      const home = byId(homeId);
      const away = byId(awayId);
      app.replace((a) => new HoopsGameScreen(a, {
        config: {
          home: { team: home, roster: generateRoster(home, seed) },
          away: { team: away, roster: generateRoster(away, seed) },
          humanSide,
          quarterSeconds: GAME_LENGTHS[length].quarterSeconds,
          difficulty: DIFFICULTIES[difficulty],
          seed,
          label: 'Exhibition',
        },
        subtitle: `${away.abbr} at ${home.abbr}`,
        onComplete: (game) => {
          a.replace((b) => new HoopsPostGameScreen(b, game, {
            onAgain: () => b.replace((c) => new HoopsSetupScreen(c)),
            onDone: () => b.pop(),
          }));
        },
        onQuit: () => a.pop(),
      }));
    };

    this.el = screenEl(
      topbar(app, 'Play Now', 'Exhibition'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The matchup',
            picker('Away', () => awayId, (id) => { awayId = id; }),
            awaySlot,
            picker('Home', () => homeId, (id) => { homeId = id; }),
            homeSlot,
            h('button', {
              class: 'btn btn--sm',
              text: 'Swap',
              on: {
                click: () => {
                  const t = homeId;
                  homeId = awayId;
                  awayId = t;
                  app.replace((a) => new HoopsSetupScreen(a));
                },
              },
            })),

          panel('The game',
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Difficulty' }),
              segmented<DifficultyKey>(
                DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
                difficulty,
                (v) => {
                  difficulty = v;
                  setPref(app, HOOPS_SPORT, 'difficulty', v);
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
                  setPref(app, HOOPS_SPORT, 'length', v);
                  lenBlurb.textContent = GAME_LENGTHS[v].blurb;
                }, true),
              lenBlurb)),

          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:52px;font-size:18px',
            text: 'Tip off (home)',
            on: { click: () => tip('home') },
          }),
          h('button', {
            class: 'btn btn--block',
            text: 'Tip off as the away club',
            on: { click: () => tip('away') },
          }),
        ),
      ),
    );
  }
}

const byId = (id: string): HoopsTeam => TEAMS.find((t) => t.id === id) ?? TEAMS[0];
