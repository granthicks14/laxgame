import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import type { CareerMode } from '../../league/types';
import { screenEl, topbar, panel, emptyPanel } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import { syncUserTeamRatings, userTeam } from '../../league/career';
import {
  MAX_LEVEL, TRACKS, TRACK_ORDER, coachEffects, staffInvestment, upgradeCost,
  type CoachTrack,
} from '../../league/coaching';
import type { Career } from '../../league/types';

/**
 * The coach's office. Coach Points buy staff, staff changes how the team plays
 * and develops, and the costs are steep enough that a coach has to choose what
 * their programme is going to be good at.
 */
export class CoachOfficeScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: CareerMode) {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(topbar(app, 'Coach'), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'No programme yet',
          `There is no ${mode} save on this device, so there is no staff to build.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }

    const body = h('div', { class: 'wrapper stack' });
    const points = h('div', { class: 'topbar__sub', text: `${career.coachingPoints} CP` });
    const render = () => {
      clear(body);
      points.textContent = `${career.coachingPoints} CP`;
      body.appendChild(this.summary(career));
      for (const track of TRACK_ORDER) body.appendChild(this.trackPanel(app, career, track, render));
      body.appendChild(h('div', {
        class: 'tiny',
        text: 'Coach Points come from playing games, winning them, and finishing a season. '
          + 'Costs rise with every level, so nothing here is a formality.',
      }));
    };

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('button', {
          class: 'btn btn--icon btn--ghost', ariaLabel: 'Back', text: '←',
          on: { click: () => app.pop() },
        }),
        h('div', { class: 'topbar__title', text: 'Coaching' }),
        points),
      h('div', { class: 'scroll' }, body),
    );
    render();
  }

  private summary(career: Career): HTMLElement {
    const fx = coachEffects(career.staff);
    const team = userTeam(career);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const row = (label: string, value: string) => h('div', { class: 'field-row' },
      h('div', { class: 'field-row__label', text: label }),
      h('div', { class: 'num', text: value }));

    return panel('Where the programme stands',
      h('div', { class: 'small', text: `${team.name} · ${career.prestige.toFixed(0)} prestige · ${staffInvestment(career.staff)} CP invested in staff` }),
      row('Offensive scheme', TRACKS.offense.levels[career.staff.offense]),
      row('Defensive scheme', TRACKS.defense.levels[career.staff.defense]),
      row('Development rate', `${fx.developmentRate.toFixed(2)}×`),
      row('Late-game stamina', `+${pct(fx.staminaRate - 1)}`),
      row('Transfer appeal', pct(fx.appeal)),
    );
  }

  private trackPanel(app: App, career: Career, track: CoachTrack, render: () => void): HTMLElement {
    const info = TRACKS[track];
    const level = career.staff[track];
    const cost = upgradeCost(level);
    const maxed = cost === null;
    const afford = !maxed && career.coachingPoints >= cost;

    const pips = h('div', { class: 'pips' });
    for (let i = 0; i < MAX_LEVEL; i++) {
      pips.appendChild(h('span', { class: `pip${i < level ? ' is-on' : ''}` }));
    }

    return panel(info.label,
      h('div', { class: 'row', style: 'justify-content:space-between;gap:10px' },
        h('div', { class: 'display', style: 'font-size:17px', text: info.levels[level] }),
        pips),
      h('div', { class: 'small', text: info.effects[level] }),
      !maxed
        ? h('div', { class: 'small', style: 'color:var(--muted)', text: `Next: ${info.levels[level + 1]} — ${info.effects[level + 1]}` })
        : null,
      h('button', {
        class: `btn btn--block${afford ? ' btn--primary' : ''}`,
        disabled: maxed || !afford,
        text: maxed ? 'Fully developed' : afford ? `Upgrade — ${cost} CP` : `Needs ${cost} CP`,
        on: {
          click: () => {
            if (maxed || !afford) return;
            career.coachingPoints -= cost;
            career.staff[track] = level + 1;
            // Culture feeds chemistry straight away; the rest show up in games.
            if (track === 'culture') syncUserTeamRatings(career);
            saveCareer(career);
            app.toast(`${info.label}: ${info.levels[level + 1]}`);
            render();
          },
        },
      }),
      h('div', { class: 'tiny', text: info.blurb }),
    );
  }
}
