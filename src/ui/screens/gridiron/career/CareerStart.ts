import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, segmented } from '../../../components';
import { teamRatings } from '../../../../sports/football/data';
import { rosterFor, teamsAtLevel, IDENTITY_LABEL, type WorldTeam } from '../../../../sports/football/world';
import { LEVELS, LEVEL_ORDER, type FootballLevel } from '../../../../sports/football/levels';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../../../sports/football/tuning';
import type { DifficultyKey } from '../../../../sports/football/types';
import { createCareer } from '../../../../sports/football/career/season';
import { newChallenge, startingJob } from '../../../../sports/football/career/challenge';
import { saveFootballCareer } from '../../../../sports/football/career/save';
import { currentDifficulty } from '../../../../sports/football/settings';
import { FootballCareerHub } from './CareerHub';

/* ---------------------------------------------------------------------------
 * STARTING A CAREER
 * ---------------------------------------------------------------------------
 * Two doors, and they are deliberately different shapes.
 *
 * DYNASTY lets a coach choose. Any programme at any tier, and the screen shows
 * what he is choosing — what the roster is, what the club is known for, how hard
 * the job will be — because a choice made blind is not a choice.
 *
 * CHALLENGE does not. He is handed the worst programme at the bottom of the
 * sport, and the only way to see anything else is to win his way there. That is
 * the entire mode, and offering a menu at the start of it would be offering to
 * skip it.
 * ------------------------------------------------------------------------- */

function clubCard(team: WorldTeam, year: number): HTMLElement {
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
        text: `${IDENTITY_LABEL[team.identity]} · pass ${r.passing} / run ${r.rushing} `
          + `· def ${r.defense}`,
      })),
    h('div', { class: 'club-line__ovr num', text: String(r.overall) }));
}

export class DynastyStartScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    let level: FootballLevel = 'college-big';
    let teamId = teamsAtLevel(level)[5].id;
    let difficulty: DifficultyKey = currentDifficulty(app);
    const name = h('input', {
      class: 'input',
      value: 'Coach',
      ariaLabel: 'Your name',
    }) as HTMLInputElement;

    const list = h('div', { class: 'stack', style: 'gap:6px' });
    const chosen = h('div', { class: 'stack', style: 'gap:6px' });
    const levelBlurb = h('div', { class: 'small' });
    const diffBlurb = h('div', { class: 'small' });

    const paint = (): void => {
      const teams = teamsAtLevel(level).sort((a, b) => b.standing - a.standing);
      if (!teams.some((t) => t.id === teamId)) teamId = teams[Math.floor(teams.length / 2)].id;
      levelBlurb.textContent = LEVELS[level].blurb;
      diffBlurb.textContent = DIFFICULTIES[difficulty].blurb;
      list.replaceChildren(...teams.map((t) => h('button', {
        class: `pick${t.id === teamId ? ' is-on' : ''}`,
        on: { click: () => { teamId = t.id; paint(); } },
      }, clubCard(t, 1))));
      const team = teams.find((t) => t.id === teamId);
      chosen.replaceChildren(team
        ? h('div', { class: 'small' },
          `${team.city}. ${LEVELS[level].name}. `
          + `${team.standing >= 70 ? 'A programme with everything, and everything to lose.'
            : team.standing >= 40 ? 'A fair job. What you do with it is yours.'
              : 'Nobody expects anything here, which is its own kind of freedom.'}`)
        : h('div'));
    };
    paint();

    const start = (): void => {
      const career = createCareer({
        mode: 'dynasty',
        teamId,
        coachName: name.value.trim() || 'Coach',
        difficulty,
      });
      saveFootballCareer(career);
      app.replace((a) => new FootballCareerHub(a, career));
    };

    this.el = screenEl(
      topbar(app, 'Dynasty', 'Pick a programme and build it'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('You',
            h('div', { class: 'field-row__label', text: 'Name' }),
            name),
          panel('The level',
            segmented(
              LEVEL_ORDER.map((k) => ({ value: k, label: LEVELS[k].short })),
              level,
              (v) => { level = v; paint(); }, true),
            levelBlurb),
          panel('The programme', list, chosen),
          panel('Difficulty',
            segmented<DifficultyKey>(
              DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
              difficulty,
              (v) => { difficulty = v; paint(); }, true),
            diffBlurb,
            h('div', {
              class: 'tiny',
              text: 'This is fixed for the career. It changes how well the opposition '
                + 'coaches, never what its players are rated.',
            })),
          h('button', { class: 'btn btn--primary', text: 'Take the job', on: { click: start } }),
        )),
    );
  }
}

export class ChallengeStartScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const seed = Math.floor(Math.random() * 0x7fff_ffff);
    const job = startingJob(seed);
    const team = teamsAtLevel(job.level).find((t) => t.id === job.teamId)!;
    let difficulty: DifficultyKey = currentDifficulty(app);
    const name = h('input', {
      class: 'input',
      value: 'Coach',
      ariaLabel: 'Your name',
    }) as HTMLInputElement;
    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[difficulty].blurb });

    const start = (): void => {
      const career = createCareer({
        mode: 'challenge',
        teamId: job.teamId,
        coachName: name.value.trim() || 'Coach',
        difficulty,
        seed,
      });
      career.challenge = newChallenge(job.teamId, job.level);
      saveFootballCareer(career);
      app.replace((a) => new FootballCareerHub(a, career));
    };

    this.el = screenEl(
      topbar(app, 'Challenge', 'Start at the bottom and climb'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The climb',
            h('div', { class: 'small' },
              'Seven levels of football, and you are starting under all of them. '
              + 'A championship gets you looked at by somebody a level up. A bad run '
              + 'gets you sacked and sent back down. Nothing else moves you.'),
            h('div', { class: 'tiny' },
              'Your record, your coaching tree and every season you have ever coached '
              + 'come with you from job to job. The programme does not.')),
          panel('Where you start', clubCard(team, 1),
            h('div', {
              class: 'small',
              text: 'You do not get to choose this one. That is the point of the mode.',
            })),
          panel('You',
            h('div', { class: 'field-row__label', text: 'Name' }),
            name),
          panel('Difficulty',
            segmented<DifficultyKey>(
              DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
              difficulty,
              (v) => { difficulty = v; diffBlurb.textContent = DIFFICULTIES[v].blurb; }, true),
            diffBlurb),
          h('button', { class: 'btn btn--primary', text: 'Start the climb', on: { click: start } }),
        )),
    );
  }
}
