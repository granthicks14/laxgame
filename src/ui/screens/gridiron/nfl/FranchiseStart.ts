import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, segmented, topbar } from '../../../components';
import { getPref, setPref } from '../../../../state/sportPrefs';
import { FOOTBALL_SPORT } from '../../../../sports/football/settings';
import {
  CONFERENCES, TEAMS, divisionsIn, teamsInDivision, type Conference,
} from '../../../../sports/football/nfl';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../../../sports/football/tuning';
import { GAME_PLANS, type DifficultyKey, type GamePlan } from '../../../../sports/football/types';
import { createFranchise } from '../../../../sports/football/franchise/season';
import { saveFranchise } from '../../../../sports/football/franchise/save';
import type { FranchiseMode } from '../../../../sports/football/franchise/types';
import { FranchiseHub } from './FranchiseHub';
import { badge, clubLine } from './parts';

/* ---------------------------------------------------------------------------
 * TAKING A JOB
 * ---------------------------------------------------------------------------
 * Three decisions and then you are coaching: which club, how hard, and what
 * your name is. Everything else has a sensible default and can be changed from
 * inside the franchise, because a setup screen with nine questions on it is a
 * setup screen people bounce off.
 *
 * THE CLUBS ARE SHOWN BY DIVISION, because that is how the league is shaped and
 * because the first thing anybody wants to know is who they will be playing
 * twice a year. Each one says plainly what it is: a club with a name and a full
 * stadium is a different job from one with neither, and choosing between them
 * IS the choice.
 * ------------------------------------------------------------------------- */

const STRENGTH: Record<number, string> = {
  5: 'A machine. Anything short of January is a failure.',
  4: 'A proper club. The talent is there; the trophy is not.',
  3: 'Middling. A good draft either way decides the decade.',
  2: 'Thin. You will be rebuilding, and the town knows it.',
  1: 'A mess. Nobody expects anything, which is its own kind of freedom.',
};

export class FranchiseStartScreen implements Screen {
  el: HTMLElement;
  private app: App;
  private mode: FranchiseMode;
  private conference: Conference = 'AFC';
  private teamId: string | null = null;
  private difficulty: DifficultyKey;
  private plan: GamePlan = 'balanced';
  private name: string;
  private list = h('div', { class: 'stack' });
  private startBtn!: HTMLButtonElement;
  private chosen = h('div', { class: 'small', text: 'Pick a club to take over.' });

  constructor(app: App, mode: FranchiseMode) {
    this.app = app;
    this.mode = mode;
    this.difficulty = getPref<DifficultyKey>(app, FOOTBALL_SPORT, 'difficulty', 'pro');
    this.name = getPref<string>(app, FOOTBALL_SPORT, 'coachName', 'Coach');

    const nameInput = h('input', {
      class: 'input',
      type: 'text',
      value: this.name,
      ariaLabel: 'Your name',
      on: {
        input: (e: Event) => {
          this.name = (e.target as HTMLInputElement).value.slice(0, 22) || 'Coach';
          setPref(app, FOOTBALL_SPORT, 'coachName', this.name);
        },
      },
    });

    this.startBtn = h('button', {
      class: 'btn btn--primary btn--block',
      text: 'Take the job',
      disabled: true,
      on: { click: () => this.begin() },
    }) as HTMLButtonElement;

    const diffBlurb = h('div', { class: 'tiny', text: DIFFICULTIES[this.difficulty].blurb });
    const planBlurb = h('div', {
      class: 'tiny',
      text: GAME_PLANS.find((p) => p.key === this.plan)?.blurb ?? '',
    });

    this.el = screenEl(
      topbar(app, mode === 'challenge' ? 'Challenge' : 'Dynasty',
        mode === 'challenge' ? 'One job at a time, and only for as long as they keep you'
          : 'One club, for as long as you like'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel('You',
          h('div', { class: 'field-row' },
            h('div', null,
              h('div', { class: 'field-row__label', text: 'Name' }),
              h('div', { class: 'field-row__hint', text: 'What the wire calls you.' })),
            nameInput),
          h('div', { class: 'stack', style: 'gap:6px' },
            h('div', { class: 'field-row__label', text: 'Difficulty' }),
            segmented<DifficultyKey>(
              DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
              this.difficulty,
              (v) => {
                this.difficulty = v;
                setPref(app, FOOTBALL_SPORT, 'difficulty', v);
                diffBlurb.textContent = DIFFICULTIES[v].blurb;
              }, true),
            diffBlurb),
          h('div', { class: 'stack', style: 'gap:6px' },
            h('div', { class: 'field-row__label', text: 'How your defence plays' }),
            segmented<GamePlan>(
              GAME_PLANS.map((p) => ({ value: p.key, label: p.label })),
              this.plan,
              (v) => {
                this.plan = v;
                planBlurb.textContent = GAME_PLANS.find((p) => p.key === v)?.blurb ?? '';
              }, true),
            planBlurb),
          h('div', {
            class: 'tiny',
            text: 'You call and play every snap your side has the ball. When they '
              + 'have it, your eleven play it out on their own ratings, your '
              + 'coordinator’s coaching and this plan. You can change it any time.',
          })),

        panel('The club',
          segmented<Conference>(
            CONFERENCES.map((c) => ({ value: c, label: c })),
            this.conference,
            (v) => { this.conference = v; this.paintList(); }, true),
          this.list),

        panel('Ready',
          this.chosen,
          this.startBtn),
      )),
    );
    this.paintList();
  }

  private paintList(): void {
    /* EACH CLUB LOOKS LIKE SOMETHING YOU CAN PRESS, and the one you pressed
     * stays lit. The first version was a column of plain text with no edge and
     * no selected state, and the only sign anything had happened was a line
     * sixteen clubs further down the screen. */
    const groups = divisionsIn(this.conference).map((divisionId) => h('div', { class: 'stack', style: 'gap:6px' },
      h('div', { class: 'eyebrow', text: divisionId }),
      ...teamsInDivision(divisionId).map((t) => {
        const line = clubLine(
          t.id,
          `${t.city} ${t.name}`,
          `${STRENGTH[t.prestige]}`,
          t.id === this.teamId ? '✓' : '',
          () => this.choose(t.id),
        );
        line.classList.add('club-line--pick');
        if (t.id === this.teamId) line.classList.add('is-on');
        return line;
      })));
    this.list.replaceChildren(...groups);
  }

  private choose(id: string): void {
    this.teamId = id;
    const team = TEAMS.find((t) => t.id === id)!;
    this.chosen.replaceChildren(
      badge(id),
      h('span', { text: ` ${team.city} ${team.name} — ${team.divisionId}. ${STRENGTH[team.prestige]}` }),
    );
    this.startBtn.disabled = false;
    this.startBtn.textContent = `Take the job — ${team.name}`;
    this.paintList();
    this.startBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private begin(): void {
    if (!this.teamId) return;
    const fr = createFranchise({
      mode: this.mode,
      teamId: this.teamId,
      coachName: this.name,
      difficulty: this.difficulty,
      gamePlan: this.plan,
    });
    saveFranchise(fr);
    this.app.replace((a) => new FranchiseHub(a, fr));
  }
}

export const DynastyStartScreen = (app: App): Screen => new FranchiseStartScreen(app, 'dynasty');
export const ChallengeStartScreen = (app: App): Screen => new FranchiseStartScreen(app, 'challenge');
