import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush } from '../../../components';
import {
  BRANCHES, BRANCH_ORDER, UPGRADES, buyUpgrade, coachLevel, coachSummary,
  lockReason, priceOf, xpToNextLevel,
} from '../../../../sports/basketball/career/coach';
import { TIERS, modsFor } from '../../../../sports/basketball/career/difficulty';
import { LEVELS } from '../../../../sports/basketball/levels';
import { GAME_LENGTHS, type GameLengthKey } from '../../../../sports/basketball/tuning';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { kvRow, pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE COACH'S OFFICE
 * ---------------------------------------------------------------------------
 * Six branches, twenty-six upgrades, and not enough points to buy them — ever.
 * That is the design: a career is a sequence of choices about what kind of coach
 * you are, and a tree you can finish is a tree that stopped asking.
 *
 * Two gates, and they are different on purpose. LEVEL is experience, which comes
 * from seasons and wins and is the same on every difficulty. PRICE is money, and
 * the difficulty tier scales it — which is why a harder career is a career with
 * fewer of these, not a career with worse players.
 * ------------------------------------------------------------------------- */

export class OfficeScreen implements Screen {
  el: HTMLElement;
  private body!: HTMLElement;

  constructor(private app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'The office', coachSummary(career.coach)),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private buy(key: string): void {
    const c = this.career;
    const scale = modsFor(c.tier).upgradeCost;
    if (buyUpgrade(c.coach, key, scale)) {
      saveHoopsCareer(c);
      this.app.toast('Bought.');
      this.paint();
    } else {
      this.app.toast('You cannot buy that yet.', 'bad');
    }
  }

  /**
   * HOW LONG THE GAMES ARE, and why it can only be changed between seasons.
   *
   * The length is a property of the LEAGUE, not of one night: every simulated
   * fixture in the world runs the same clock the coach's own games do, which is
   * what makes a scoring average comparable between his squad and the leader
   * board. Changing it mid-season would leave half a season's box scores measured
   * against a different clock from the other half, so the control is shown and
   * disabled rather than hidden — a coach can see the setting, see when he can
   * change it, and not wonder where it went.
   */
  private gameLength(): HTMLElement {
    const c = this.career;
    const between = c.stage === 'offseason' || c.stage === 'preseason';
    const current = c.gameLength;
    const options: (GameLengthKey | 'default')[] = [
      'default', ...(Object.keys(GAME_LENGTHS) as GameLengthKey[]),
    ];
    return panelFlush('Game length',
      h('div', { class: 'prospect__open tiny',
        text: between
          ? 'The whole league plays whatever you pick.'
          : 'Changeable between seasons. Half a season measured against a different '
            + 'clock from the other half would make every average meaningless.' }),
      ...options.map((key) => {
        const on = key === 'default' ? current === null : current === key;
        const label = key === 'default'
          ? `The level's own (${quarterText(LEVELS[c.level].quarterSeconds)})`
          : GAME_LENGTHS[key].label;
        const note = key === 'default'
          ? `${LEVELS[c.level].name} plays this by default.`
          : GAME_LENGTHS[key].blurb;
        return h(between ? 'button' : 'div', {
          class: `roster-row${on ? ' roster-row--on' : ''}`,
          ...(between ? { on: { click: () => this.setLength(key) } } : {}),
        },
        h('div', { class: 'roster-row__body' },
          h('div', { class: 'roster-row__name', text: label }),
          h('div', { class: 'roster-row__note tiny', text: note })),
        on ? pill('PLAYING', 'good') : null);
      }));
  }

  private setLength(key: GameLengthKey | 'default'): void {
    this.career.gameLength = key === 'default' ? null : key;
    saveHoopsCareer(this.career);
    this.paint();
  }

  private paint(): void {
    const c = this.career;
    const scale = modsFor(c.tier).upgradeCost;
    const level = coachLevel(c.coach);
    const xp = xpToNextLevel(c.coach);
    const owned = new Set(c.coach.owned);

    this.body.replaceChildren(
      panel(null,
        kvRow(
          ['Points', String(c.coach.points)],
          ['Level', String(level)],
          ['Owned', `${c.coach.owned.length}/${UPGRADES.length}`],
          ['Seasons', String(c.coach.seasons)],
        ),
        h('div', { class: 'tiny',
          text: `${xp.have} of ${xp.need} toward level ${level + 1}. `
            + `Prices here are ${TIERS[c.tier].name.toLowerCase()}: `
            + `${scale === 1 ? 'the honest ones' : `${Math.round(scale * 100)}% of the honest ones`}.` })),

      this.gameLength(),

      ...BRANCH_ORDER.map((branch) => panelFlush(BRANCHES[branch].label,
        h('div', { class: 'prospect__open tiny', text: BRANCHES[branch].blurb }),
        ...UPGRADES.filter((u) => u.branch === branch).map((u) => {
          const has = owned.has(u.key);
          const why = has ? null : lockReason(c.coach, u, scale);
          const price = priceOf(u, scale);
          return h(has ? 'div' : 'button', {
            class: `roster-row${has ? ' roster-row--on' : ''}`,
            ...(has ? {} : { on: { click: () => this.buy(u.key) } }),
          },
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: u.label }),
            h('div', { class: 'roster-row__note tiny', text: u.blurb }),
            why ? h('div', { class: 'tiny warn', text: why }) : null),
          has ? pill('OWNED', 'good')
            : h('span', { class: 'roster-row__ovr num', text: String(price) }));
        }))),

      h('div', { class: 'tiny',
        text: 'You will not buy all of this. A career is a decision about which coach '
          + 'you are going to be, and the tree is deliberately longer than a lifetime.' }),
    );
  }
}

/** "4 x 3:30" from a number of seconds, which is how a game length is said. */
function quarterText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `4 x ${m}:${String(sec).padStart(2, '0')}`;
}
