import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import type { CareerMode } from '../../league/types';
import { screenEl, topbar, panel, panelFlush, ratingBar, segmented, teamBadge, emptyPanel } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import { TRAIN_COST, awardCoachPoints, perksOf, spendCoachPoints, trainPlayer, userTeam } from '../../league/career';
import type { Career } from '../../league/types';
import {
  ATTR_LABEL, GRADE_LABEL, sortDepthChart, starTier,
  type PlayerAttrs, type PlayerData,
} from '../../data/players';
import { OFFENSE_STYLES, DEFENSE_STYLES, type DefenseStyle, type OffenseStyle } from '../../data/tactics';
import { POSITION_LABEL } from '../../data/constants';
import type { TeamData } from '../../data/teams';
import { rosterSourceFor } from '../../data/rosters';
import { PROJECTS, committedCost, project, projectCost, projectsFor } from '../../league/projects';
import { CURVES, TIERS, archetype, tierFor } from '../../data/archetypes';
import { levelPar } from '../../scouting/prospects';

export class TeamManageScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: CareerMode) {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(topbar(app, 'Team'), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'No roster loaded',
          `There is no ${mode} save on this device, so there is no roster to manage.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }
    const team = userTeam(career);

    const offBlurb = h('div', { class: 'small', text: OFFENSE_STYLES[career.tactics.offense].blurb });
    const defBlurb = h('div', { class: 'small', text: DEFENSE_STYLES[career.tactics.defense].blurb });

    this.el = screenEl(
      topbar(app, 'Team', `${career.coachingPoints} CP`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'panel' },
            h('span', { class: 'stripe', style: `background:${team.primary}` }),
            h('div', { class: 'panel__body row', style: 'gap:12px' },
              teamBadge(team, 'lg'),
              h('div', { class: 'stack', style: 'gap:6px;flex:1 1 auto;min-width:0' },
                h('div', { class: 'display', style: 'font-size:19px', text: team.name }),
                ratingBar('Overall', team.overall),
                ratingBar('Offense', team.offense, '#ff9d4d'),
                ratingBar('Defense', team.defense, '#4a9be8'),
                ratingBar('Goalie', team.goalie, '#3fbd77')))),

          panel('Offensive style',
            segmented<OffenseStyle>(
              (Object.keys(OFFENSE_STYLES) as OffenseStyle[]).map((k) => ({ value: k, label: OFFENSE_STYLES[k].label })),
              career.tactics.offense,
              (v) => {
                career.tactics.offense = v;
                saveCareer(career);
                offBlurb.textContent = OFFENSE_STYLES[v].blurb;
              }, true),
            offBlurb),

          panel('Defensive style',
            segmented<DefenseStyle>(
              (Object.keys(DEFENSE_STYLES) as DefenseStyle[]).map((k) => ({ value: k, label: DEFENSE_STYLES[k].label })),
              career.tactics.defense,
              (v) => {
                career.tactics.defense = v;
                saveCareer(career);
                defBlurb.textContent = DEFENSE_STYLES[v].blurb;
              }, true),
            defBlurb),

          panel('Strengths and weaknesses', ...profile(team)),

          panelFlush('Roster', rosterTable(app, career, mode)),
          h('div', {
            class: 'tiny',
            text: rosterSourceFor(career.teamId) === 'official'
              ? 'Player names, numbers and positions come from a published roster; all ratings are gameplay values.'
              : 'No published roster exists for this programme in the game data, so these players are fictional.',
          }),
          h('div', { class: 'tiny', text: `Training costs ${TRAIN_COST} coaching points. Earn points by playing games — more for wins, rivalry wins and playoff games.` }),
        )),
    );
  }
}

/** Reads the squad's ratings and says, in words, what this team is good and bad
 *  at — the thing a coach actually wants to know from a screen of numbers. */
function profile(team: TeamData): HTMLElement[] {
  const parts: { label: string; value: number; good: string; bad: string }[] = [
    { label: 'Attack', value: team.attack, good: 'Attackmen who can beat their man one-on-one', bad: 'Not enough finish at attack' },
    { label: 'Midfield', value: team.midfield, good: 'Midfield depth that runs all four quarters', bad: 'Thin at midfield — legs go late' },
    { label: 'Defense', value: team.defense, good: 'Poles who slide on time and check clean', bad: 'Defence gets beaten off the dodge' },
    { label: 'Goalie', value: team.goalie, good: 'A keeper who steals games', bad: 'Shaky in the cage' },
    { label: 'Faceoff', value: team.faceoff, good: 'Wins the draw and the possession battle', bad: 'Losing the draw hands away possessions' },
    { label: 'Speed', value: team.speed, good: 'Genuine transition speed', bad: 'Gets beaten down the field' },
    { label: 'Chemistry', value: team.chemistry, good: 'Passing and off-ball movement are sharp', bad: 'Sloppy passes under pressure' },
  ];
  const sorted = [...parts].sort((a, b) => b.value - a.value);
  const strengths = sorted.filter((p) => p.value >= 74).slice(0, 3);
  const weaknesses = sorted.filter((p) => p.value <= 69).slice(-3).reverse();

  const line = (text: string, cls: string, tag: string) => h('div', { class: 'row', style: 'gap:8px;align-items:flex-start' },
    h('span', { class: `pill ${cls}`, style: 'flex:0 0 auto', text: tag }),
    h('span', { class: 'small', style: 'flex:1 1 auto', text }));

  const out: HTMLElement[] = [];
  if (strengths.length) {
    out.push(h('div', { class: 'eyebrow', text: 'What is working' }));
    for (const p of strengths) out.push(line(p.good, 'pill--green', p.label));
  }
  if (weaknesses.length) {
    out.push(h('div', { class: 'eyebrow', style: 'margin-top:6px', text: 'What needs work' }));
    for (const p of weaknesses) out.push(line(p.bad, 'pill--red', p.label));
  }
  if (!out.length) {
    out.push(h('div', { class: 'small', text: 'A balanced squad with no obvious hole and no obvious edge.' }));
  }
  return out;
}

/** The same star a player wears on the field, so the two never disagree. */
export function starMark(overall: number): HTMLElement | null {
  const tier = starTier(overall);
  if (!tier) return null;
  return h('span', {
    class: `star star--${tier}`,
    title: tier === 2 ? 'Elite player' : 'Star player',
    text: tier === 2 ? '★★' : '★',
  });
}

function rosterTable(app: App, career: Career, mode: CareerMode): HTMLElement {
  const roster = sortDepthChart(career.roster);
  const rows = roster.map((p) => {
    const starter = isStarter(roster, p);
    return h('tr', {
      class: starter ? 'is-you' : '',
      on: { click: () => app.push((a) => new PlayerScreen(a, mode, p.id)) },
    },
      h('td', { class: 'name' },
        h('div', { style: 'display:flex;align-items:center;gap:8px' },
          h('span', { class: 'num', style: 'color:var(--muted);width:22px', text: `#${p.number}` }),
          h('span', { text: `${p.first} ${p.last}` }),
          starMark(p.overall))),
      h('td', { text: p.pos }),
      h('td', { text: GRADE_LABEL[p.grade] }),
      h('td', { text: String(p.overall) }),
      h('td', { text: String(p.season.goals) }),
      h('td', { text: String(p.season.assists) }),
      h('td', { text: String(p.season.groundBalls) }),
      h('td', { text: p.pos === 'G' ? String(p.season.saves) : '—' }),
    );
  });
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table table--compact' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Player' }), h('th', { text: 'Pos' }), h('th', { text: 'Yr' }),
        h('th', { text: 'OVR' }), h('th', { text: 'G' }), h('th', { text: 'A' }),
        h('th', { text: 'GB' }), h('th', { text: 'SV' }))),
      h('tbody', null, ...rows)));
}

function isStarter(roster: PlayerData[], p: PlayerData): boolean {
  const counts: Record<string, number> = { G: 1, D: 3, M: 3, A: 3, FO: 1 };
  const group = roster.filter((x) => x.pos === p.pos);
  return group.indexOf(p) < (counts[p.pos] ?? 0);
}

const TRAINABLE: (keyof PlayerAttrs)[] = [
  'speed', 'acceleration', 'stamina', 'passing', 'shooting', 'shotPower', 'shotAccuracy',
  'dodging', 'defense', 'checking', 'faceoff', 'goalie', 'awareness',
];

export class PlayerScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: CareerMode, playerId: string) {
    const career = loadCareer(mode);
    const p = career?.roster.find((x) => x.id === playerId);
    if (!career || !p) {
      this.el = screenEl(topbar(app, 'Player'), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'Player not found',
          'This player is no longer on the roster — he may have graduated between saves.',
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }

    const cpLabel = h('span', { class: 'pill pill--green', text: `${career.coachingPoints} CP` });
    const attrsBox = h('div', { class: 'stack', style: 'gap:6px' });
    const maxed = () => p.overall >= p.potential + 4;

    const renderAttrs = () => {
      attrsBox.replaceChildren();
      const relevant = TRAINABLE.filter((k) => (p.pos === 'G' ? k !== 'faceoff' : k !== 'goalie'));
      for (const k of relevant) {
        const canTrain = career.coachingPoints >= TRAIN_COST && p.attrs[k] < 99 && !maxed();
        attrsBox.appendChild(h('div', { class: 'row', style: 'gap:8px' },
          h('div', { style: 'flex:1 1 auto' }, ratingBar(ATTR_LABEL[k], p.attrs[k])),
          h('button', {
            class: 'btn btn--sm',
            text: '+2',
            disabled: !canTrain,
            title: canTrain ? `Spend ${TRAIN_COST} CP` : 'Not enough coaching points, or this player is at his ceiling',
            on: {
              click: () => {
                if (trainPlayer(career, p.id, k)) {
                  saveCareer(career);
                  cpLabel.textContent = `${career.coachingPoints} CP`;
                  ovr.textContent = String(p.overall);
                  renderAttrs();
                  app.toast(`${p.last} +2 ${ATTR_LABEL[k]}`);
                } else {
                  app.toast('Cannot train that right now');
                }
              },
            },
          })));
      }
    };
    const ovr = h('div', { class: 'display', style: 'font-size:30px', text: String(p.overall) });
    renderAttrs();

    const s = p.season;
    this.el = screenEl(
      topbar(app, `${p.first} ${p.last}`, `#${p.number}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel(null,
            h('div', { class: 'row', style: 'gap:14px' },
              h('div', { class: 'stack', style: 'gap:0;align-items:center' },
                h('div', { class: 'eyebrow', text: 'OVR' }), ovr),
              h('div', { class: 'stack', style: 'gap:4px;flex:1 1 auto' },
                h('div', { class: 'row row--wrap', style: 'gap:6px' },
                  h('span', { class: 'pill pill--accent', text: POSITION_LABEL[p.pos] }),
                  h('span', { class: 'pill', text: gradeWord(p.grade) }),
                  starTier(p.overall)
                    ? h('span', {
                      class: 'pill pill--green',
                      text: starTier(p.overall) === 2 ? '★★ Elite' : '★ Star',
                    })
                    : null,
                  cpLabel),
                h('div', { class: 'small', text: potentialText(p) })))),

          panel('Season stats',
            h('div', { class: 'row row--wrap', style: 'gap:14px' },
              stat('G', s.goals), stat('A', s.assists), stat('SH', s.shots),
              stat('GB', s.groundBalls), stat('CT', s.causedTurnovers),
              p.pos === 'G' ? stat('SV', s.saves) : null,
              p.pos === 'G' ? stat('GA', s.goalsAgainst) : null,
              stat('TO', s.turnovers))),

          this.profilePanel(career, p),
          this.projectPanel(app, career, p),
          panel('Attributes', attrsBox),
          this.historyPanel(p),
        )),
    );
  }

  /**
   * Who this player actually is: his archetype, how he develops, and where his
   * ceiling sits at this level. A coach only sees this for his OWN players —
   * a prospect is still a guess.
   */
  private profilePanel(career: Career, p: PlayerData): HTMLElement {
    const dev = p.dev;
    if (!dev) return panel('Profile', h('div', { class: 'small', text: 'No development profile on this player.' }));
    const arch = archetype(dev.archetype);
    const tier = tierFor(p.potential, levelPar(career.level));
    return panel('Profile',
      h('div', { class: 'row row--wrap', style: 'gap:6px' },
        arch ? h('span', { class: 'pill pill--accent', text: arch.label }) : null,
        h('span', { class: 'pill', text: CURVES[dev.curve].label }),
        h('span', { class: 'pill', text: TIERS[tier].label })),
      arch ? h('div', { class: 'small', text: arch.blurb }) : null,
      h('div', { class: 'tiny', text: CURVES[dev.curve].blurb }),
      h('div', { class: 'tiny', text: potentialText(p) }));
  }

  /**
   * A season-long commitment to one player. It costs Coach Points, it
   * concentrates his growth, and it suppresses everything outside it.
   */
  private projectPanel(app: App, career: Career, p: PlayerData): HTMLElement {
    const box = h('div', { class: 'stack' });
    const redraw = () => {
      clear(box);
      const active = project(p.project);
      const spent = committedCost(career.roster, perksOf(career).projectDiscount);
      box.appendChild(h('div', {
        class: 'tiny',
        text: `${spent} CP committed to projects across the squad. A project runs for one offseason and then ends.`,
      }));
      if (active) {
        box.appendChild(h('div', { class: 'small', style: 'color:var(--accent)', text: `${active.label} — ${active.blurb}` }));
        box.appendChild(h('div', { class: 'tiny', text: active.tradeoff }));
        box.appendChild(h('button', {
          class: 'btn btn--block',
          text: `Cancel and refund ${projectCost(active, perksOf(career).projectDiscount)} CP`,
          on: {
            click: () => {
              awardCoachPoints(career, projectCost(active, perksOf(career).projectDiscount), 0);
              p.project = null;
              saveCareer(career);
              redraw();
              app.toast('Project cancelled.');
            },
          },
        }));
        return;
      }
      const discount = perksOf(career).projectDiscount;
      for (const info of projectsFor(p).slice(0, 4)) {
        const cost = projectCost(info, discount);
        const afford = career.coachingPoints >= cost;
        box.appendChild(h('div', { class: 'row', style: 'gap:10px;align-items:center' },
          h('div', { class: 'stack', style: 'gap:1px;flex:1 1 auto;min-width:0' },
            h('div', { class: 'small', style: 'color:var(--text)', text: info.label }),
            h('div', { class: 'tiny', text: info.blurb }),
            h('div', { class: 'tiny', text: info.tradeoff })),
          h('button', {
            class: `btn btn--sm${afford ? ' btn--primary' : ''}`,
            text: `${cost} CP`,
            on: {
              click: () => {
                if (career.coachingPoints < cost) { app.toast('Not enough Coach Points.'); return; }
                spendCoachPoints(career, cost);
                p.project = info.key;
                saveCareer(career);
                redraw();
                app.toast(`${p.last} is on the ${info.label.toLowerCase()}.`);
              },
            },
          })));
      }
      void PROJECTS;
    };
    redraw();
    return panel('Development project', box);
  }

  /** What every offseason actually did to him. */
  private historyPanel(p: PlayerData): HTMLElement | null {
    const hist = p.dev?.history ?? [];
    if (!hist.length) return null;
    return panel('Development history',
      ...hist.slice().reverse().map((y) => h('div', { class: 'row', style: 'justify-content:space-between;gap:10px' },
        h('span', { class: 'small', text: `Year ${y.year} · ${y.note}` }),
        h('span', {
          class: 'num',
          style: y.to > y.from ? 'color:var(--green)' : y.to < y.from ? 'color:var(--red)' : '',
          text: `${y.from} → ${y.to}`,
        }))));
  }
}

function stat(label: string, value: number): HTMLElement {
  return h('div', { class: 'stack', style: 'gap:0;align-items:center;min-width:44px' },
    h('div', { class: 'display num', style: 'font-size:22px', text: String(value) }),
    h('div', { class: 'eyebrow', text: label }));
}

const gradeWord = (g: number): string =>
  ({ 9: 'Freshman', 10: 'Sophomore', 11: 'Junior', 12: 'Senior' } as Record<number, string>)[g] ?? 'Player';

function potentialText(p: PlayerData): string {
  const room = p.potential - p.overall;
  if (room <= 1) return 'At his ceiling — what you see is what you get.';
  if (room <= 5) return 'Some room left to grow.';
  if (room <= 10) return 'Real upside if he gets reps.';
  return 'Raw, but the ceiling is high.';
}
