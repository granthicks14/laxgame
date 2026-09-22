import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel, segmented } from '../../components';
import { teamRatings } from '../../../sports/football/data';
import {
  CONFERENCES, TEAMS, badgeColours, divisionsIn, rosterFor, teamOr, teamsInDivision,
  type Conference, type NflTeam,
} from '../../../sports/football/nfl';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS, type GameLengthKey,
} from '../../../sports/football/tuning';
import { currentDifficulty, currentLength, FOOTBALL_SPORT } from '../../../sports/football/settings';
import { setPref } from '../../../state/sportPrefs';
import { GAME_PLANS, type DifficultyKey, type GamePlan } from '../../../sports/football/types';
import { Rng } from '../../../core/rng';
import { FootballGameScreen } from './FootballGameScreen';
import { FootballPostGameScreen } from './FootballPostGame';

/* ---------------------------------------------------------------------------
 * PLAY NOW
 * ---------------------------------------------------------------------------
 * One game, two clubs, no consequences. Every club in the league is available
 * because there is no ladder any more — this is one competition and a bad team
 * playing a good one is a real fixture rather than a formality.
 *
 * The one choice that is not obvious is the last one, and it is the choice the
 * whole football section is built around: YOU PLAY OFFENCE. On defence your
 * eleven play it out on their own ratings and the plan you set. Somebody who
 * would rather steer a safety can turn that off here, once, and the engine does
 * the rest — but the default is the game this is.
 * ------------------------------------------------------------------------- */

export class FootballSetupScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const seed = new Rng(`fb:setup:${Date.now()}`).int(1, 0x7fff_ffff);
    let conference: Conference = 'AFC';
    let homeId = 'kc';
    let awayId = 'buf';
    let difficulty = currentDifficulty(app);
    let length = currentLength(app);
    let plan: GamePlan = 'balanced';
    let offenceOnly = true;
    let picking: 'home' | 'away' = 'away';

    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[difficulty].blurb });
    const lenBlurb = h('div', { class: 'small', text: GAME_LENGTHS[length].blurb });
    const planBlurb = h('div', {
      class: 'tiny',
      text: GAME_PLANS.find((p) => p.key === plan)?.blurb ?? '',
    });

    const card = (team: NflTeam): HTMLElement => {
      const r = teamRatings(rosterFor(team, seed, 1));
      const c = badgeColours(team);
      return h('div', { class: 'club-line' },
        h('span', {
          class: 'club-line__badge',
          style: `background:${c.fill};border-color:${c.edge};color:${c.text}`,
          text: team.abbr,
        }),
        h('div', { class: 'club-line__body' },
          h('div', { class: 'club-line__name', text: `${team.city} ${team.name}` }),
          h('div', {
            class: 'club-line__note tiny',
            text: `${team.divisionId} · pass ${r.passing} / run ${r.rushing} · def ${r.defense}`,
          })),
        h('div', { class: 'club-line__ovr num', text: String(r.overall) }));
    };

    const homeSlot = h('div', { class: 'stack', style: 'gap:6px' });
    const awaySlot = h('div', { class: 'stack', style: 'gap:6px' });
    const list = h('div', { class: 'stack', style: 'gap:4px' });

    const paint = (): void => {
      homeSlot.replaceChildren(card(teamOr(homeId)));
      awaySlot.replaceChildren(card(teamOr(awayId)));
      list.replaceChildren(...divisionsIn(conference).map((divisionId) =>
        h('div', { class: 'stack', style: 'gap:3px' },
          h('div', { class: 'eyebrow', text: divisionId }),
          ...teamsInDivision(divisionId).map((t) => {
            const c = badgeColours(t);
            return h('button', {
              class: `btn btn--sm${t.id === homeId || t.id === awayId ? ' btn--primary' : ''}`,
              on: {
                click: () => {
                  if (picking === 'home') homeId = t.id;
                  else awayId = t.id;
                  paint();
                },
              },
            },
            h('span', {
              class: 'club-line__badge club-line__badge--sm',
              style: `background:${c.fill};border-color:${c.edge};color:${c.text}`,
              text: t.abbr,
            }),
            h('span', { text: ` ${t.city} ${t.name}` }));
          }))));
    };
    paint();

    const kick = (): void => {
      if (homeId === awayId) {
        app.toast('Pick two different clubs', 'bad');
        return;
      }
      const home = teamOr(homeId);
      const away = teamOr(awayId);
      const humanSide = picking === 'home' ? 'home' : 'away';
      app.replace((a) => new FootballGameScreen(a, {
        config: {
          home: { team: home, roster: rosterFor(home, seed, 1) },
          away: { team: away, roster: rosterFor(away, seed, 1) },
          humanSide,
          quarterSeconds: GAME_LENGTHS[length].quarterSeconds,
          difficulty: DIFFICULTIES[difficulty],
          seed,
          offenseOnly: offenceOnly,
          gamePlan: plan,
        },
        onComplete: (game) => a.replace((b) => new FootballPostGameScreen(b, game)),
        onQuit: () => a.pop(),
      }));
    };

    this.el = screenEl(
      topbar(app, 'Play Now', 'One game, no consequences'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('Away', awaySlot),
          panel('Home', homeSlot),
          panel('Pick the clubs',
            segmented<'away' | 'home'>([
              { value: 'away', label: 'Choose away' },
              { value: 'home', label: 'Choose home' },
            ], picking, (v) => { picking = v; }, true),
            segmented<Conference>(
              CONFERENCES.map((c) => ({ value: c, label: c })),
              conference,
              (v) => { conference = v; paint(); }, true),
            list,
            h('div', {
              class: 'tiny',
              text: 'Whichever side you were last choosing is the side you coach.',
            })),

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

          panel('Defence',
            segmented<'coach' | 'play'>([
              { value: 'coach', label: 'Coach it' },
              { value: 'play', label: 'Play it too' },
            ], 'coach', (v) => { offenceOnly = v === 'coach'; }, true),
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Game plan' }),
              segmented<GamePlan>(
                GAME_PLANS.map((p) => ({ value: p.key, label: p.label })),
                plan,
                (v) => {
                  plan = v;
                  planBlurb.textContent = GAME_PLANS.find((p) => p.key === v)?.blurb ?? '';
                }, true),
              planBlurb),
            h('div', {
              class: 'tiny',
              text: 'Coaching it is the game this is: you play every snap your side '
                + 'has the ball, and theirs runs on fast-forward while your eleven '
                + 'get on with it. Playing it too gives you a defender to steer.',
            })),

          h('button', {
            class: 'btn btn--primary btn--block',
            text: 'Kick off',
            on: { click: () => kick() },
          }),
          h('div', {
            class: 'tiny center',
            text: `${TEAMS.length} clubs. Every player in them is invented for this game.`,
          }),
        )),
    );
  }
}
