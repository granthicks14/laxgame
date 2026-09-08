import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import type { CareerMode } from '../../league/types';
import { MODE_LABEL } from '../../league/modes';
import { screenEl, topbar, panel, emptyPanel, segmented } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import {
  buyCoachUpgrade, coachProfile, spendCoachPoints, syncUserTeamRatings, userTeam,
} from '../../league/career';
import {
  BRANCHES, BRANCH_ORDER, UPGRADES, coachTitle, levelOf, lockReason, upgrade,
  upgradesIn, xpForNextLevel, type UpgradeBranch,
} from '../../challenge/coach';
import { isClimbMode } from '../../league/modes';
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
          `There is no ${MODE_LABEL[mode]} save on this device, so there is no staff to build.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }

    const body = h('div', { class: 'wrapper stack' });
    const points = h('div', { class: 'topbar__sub', text: `${career.coachingPoints} CP` });
    let tab: 'you' | 'staff' = isClimbMode(mode) ? 'you' : 'staff';
    const render = () => {
      clear(body);
      points.textContent = `${career.coachingPoints} CP`;
      if (isClimbMode(mode)) {
        body.appendChild(this.coachPanel(career));
        body.appendChild(segmented(
          [{ value: 'you', label: 'Your career' }, { value: 'staff', label: 'The programme' }],
          tab,
          (v) => { tab = v as 'you' | 'staff'; render(); },
          true,
        ));
      }
      if (tab === 'you' && isClimbMode(mode)) {
        for (const branch of BRANCH_ORDER) {
          body.appendChild(this.branchPanel(app, career, branch, render));
        }
        body.appendChild(h('div', {
          class: 'tiny',
          text: 'Everything on this page belongs to YOU, not to the programme. It follows you to '
            + 'every job you take for the rest of your career.',
        }));
        return;
      }
      body.appendChild(this.summary(career));
      for (const track of TRACK_ORDER) body.appendChild(this.trackPanel(app, career, track, render));
      body.appendChild(h('div', {
        class: 'tiny',
        text: isClimbMode(mode)
          ? 'The staff you hire works for the PROGRAMME. Take a new job and you build one again — '
            + 'what you know goes with you, the assistants do not.'
          : 'Coach Points come from playing games, winning them, and finishing a season. '
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

  /** The coach himself: level, experience, and what his career adds up to. */
  private coachPanel(career: Career): HTMLElement {
    const profile = coachProfile(career);
    const level = levelOf(profile.xp);
    const { into, needed } = xpForNextLevel(profile.xp);
    const bar = h('div', { class: 'interest' },
      h('div', {
        class: 'interest__fill',
        style: `width:${Math.round((into / Math.max(1, needed)) * 100)}%;background:var(--accent)`,
      }));
    const jobs = profile.jobs.length;
    return panel('You',
      h('div', { class: 'row', style: 'justify-content:space-between;gap:10px;align-items:baseline' },
        h('div', { class: 'display', style: 'font-size:20px', text: coachTitle(level) }),
        h('span', { class: 'pill pill--accent', text: `Level ${level}` })),
      bar,
      h('div', { class: 'tiny', text: level >= 12 ? 'Nothing left to learn.' : `${Math.round(into)} / ${needed} experience to level ${level + 1}` }),
      h('div', { class: 'row row--wrap', style: 'gap:6px;margin-top:4px' },
        h('span', { class: 'pill pill--green', text: `${profile.points} CP` }),
        h('span', { class: 'pill', text: `${profile.careerWins}-${profile.careerLosses} career` }),
        h('span', { class: 'pill', text: `${profile.championships} title${profile.championships === 1 ? '' : 's'}` }),
        h('span', { class: 'pill', text: `${profile.seasons} season${profile.seasons === 1 ? '' : 's'}` }),
        h('span', { class: 'pill', text: `${jobs} programme${jobs === 1 ? '' : 's'}` }),
        h('span', { class: 'pill', text: `${profile.owned.length}/${UPGRADES.length} upgrades` })),
      profile.jobs.length > 1
        ? h('div', { class: 'stack', style: 'gap:1px;margin-top:4px' },
          h('div', { class: 'eyebrow', text: 'Where you have been' }),
          ...profile.jobs.slice().reverse().slice(0, 6).map((j) => h('div', {
            class: 'tiny',
            text: `${j.teamShort} · ${j.fromYear}–${j.toYear ?? 'now'} · ${j.wins}-${j.losses}`
              + (j.titles ? ` · ${j.titles} title${j.titles === 1 ? '' : 's'}` : ''),
          })))
        : null);
  }

  /** One branch of the coach's own upgrade tree. */
  private branchPanel(app: App, career: Career, branch: UpgradeBranch, render: () => void): HTMLElement {
    const profile = coachProfile(career);
    const info = BRANCHES[branch];
    const rows = upgradesIn(branch).map((u) => {
      const reason = lockReason(profile, u);
      const owned = reason === 'owned';
      const why = reason === 'level' ? `Coach level ${u.level}`
        : reason === 'requires'
          ? `Needs ${u.requires.map((r) => upgrade(r)?.label ?? r).join(' + ')}`
          : reason === 'cost' ? `${u.cost} CP` : `${u.cost} CP`;
      return h('div', {
        class: 'row',
        style: `gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line-soft)${owned ? ';opacity:.85' : ''}`,
      },
        h('span', {
          class: owned ? 'pill pill--green' : reason ? 'pill' : 'pill pill--accent',
          style: 'flex:0 0 auto',
          text: owned ? 'OWNED' : reason === 'level' ? `LV ${u.level}` : `${u.cost} CP`,
        }),
        h('div', { class: 'stack', style: 'gap:1px;flex:1 1 auto;min-width:0' },
          h('div', { class: 'small', style: 'color:var(--text)', text: u.label }),
          h('div', { class: 'tiny', text: u.blurb })),
        owned
          ? null
          : h('button', {
            class: `btn btn--sm${reason === null ? ' btn--primary' : ''}`,
            disabled: reason !== null,
            text: reason === null ? 'Buy' : why,
            on: {
              click: () => {
                if (!buyCoachUpgrade(career, u.key)) { app.toast('Not available yet.'); return; }
                syncUserTeamRatings(career);
                saveCareer(career);
                app.toast(`${u.label} unlocked`);
                render();
              },
            },
          }));
    });
    return panel(info.label,
      h('div', { class: 'tiny', text: info.blurb }),
      ...rows);
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
            spendCoachPoints(career, cost);
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
