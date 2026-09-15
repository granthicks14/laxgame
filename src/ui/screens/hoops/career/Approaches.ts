import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel } from '../../../components';
import { worldTeam } from '../../../../sports/basketball/world';
import { LEVELS } from '../../../../sports/basketball/levels';
import {
  approachSummary, approachesFor, resume, resumeLabel, type Approach,
} from '../../../../sports/basketball/career/interest';
import { acceptApproach } from '../../../../sports/basketball/career/season';
import { rosterFor } from '../../../../sports/basketball/career/league';
import { teamRatings } from '../../../../sports/basketball/data';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { badge, kvRow, pill } from './bits';

/* ---------------------------------------------------------------------------
 * SOMEBODY ELSE WANTS YOU
 * ---------------------------------------------------------------------------
 * The Dynasty job market. Win at a small school and a bigger one calls; win
 * there and a college does. It is the same pyramid the Challenge ladder climbs,
 * and what climbs it is the coach's own name.
 *
 * THE DECISION IS SHOWN, NOT HIDDEN. The squad he would inherit is the squad the
 * world actually has, so its rating is printed here before he says yes — a coach
 * should be able to tell a good job from a proud name with nothing in the
 * building, because that is the whole choice. Staying is always on the table and
 * is often right: the programme he has built is his, and the one calling is
 * somebody else's problem.
 * ------------------------------------------------------------------------- */

export class ApproachesScreen implements Screen {
  el: HTMLElement;

  constructor(private app: App, private career: HoopsCareer) {
    this.el = this.build();
  }

  private build(): HTMLElement {
    const c = this.career;
    const app = this.app;
    const offers = approachesFor(c);
    const score = resume(c);
    const here = worldTeam(c.teamId);

    return screenEl(
      topbar(app, 'The phone is ringing', `${LEVELS[c.level].short} · year ${c.year}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel('Your name',
          kvRow(
            ['Record', `${c.coach.careerWins}-${c.coach.careerLosses}`],
            ['Seasons', String(c.coach.seasons)],
            ['Titles', String(c.championships)],
            ['Standing', String(Math.round(resumeBar(score)))],
          ),
          h('div', { class: 'small', text: resumeLabel(score) })),

        offers.length
          ? panel(null, h('div', { class: 'small',
            text: `${offers.length} programme${offers.length === 1 ? ' has' : 's have'} `
              + 'made an approach. You would take over their squad as it stands.' }))
          : panel(null, h('div', { class: 'small',
            text: 'Nobody has called this year. Keep winning and they will.' })),

        ...offers.map((o) => this.offer(o)),

        panel(null,
          h('button', {
            class: 'btn btn--ghost btn--wide',
            on: { click: () => app.pop() },
          },
          h('span', { class: 'btn__label', text: 'Stay where you are' }),
          h('span', { class: 'btn__sub',
            text: `Keep building at ${here.city} ${here.name}.` }))),
      )),
    );
  }

  private offer(o: Approach): HTMLElement {
    const c = this.career;
    const team = worldTeam(o.teamId);
    /* WHAT HE WOULD ACTUALLY INHERIT. Derived from the world, which is the same
     * squad every table in the game has been describing all season — so this
     * number is a promise the career keeps. */
    const squad = teamRatings(rosterFor(c, o.teamId));
    const mine = teamRatings(c.roster);
    const better = squad.overall - mine.overall;
    return h('button', { class: 'job', on: { click: () => this.take(o) } },
      h('div', { class: 'job__head' },
        badge(team),
        h('div', { class: 'job__name', text: `${team.city} ${team.name}` }),
        pill(o.stepUp ? 'A STEP UP' : LEVELS[o.level].short, o.stepUp ? 'good' : 'warn')),
      h('div', { class: 'job__note', text: o.pitch }),
      h('div', { class: 'job__ask tiny', text: approachSummary(o) }),
      h('div', { class: 'job__ask tiny',
        text: `Their squad is rated ${squad.overall} — `
          + `${better > 2 ? `${better} better than yours`
            : better < -2 ? `${-better} worse than yours` : 'about the same as yours'}. `
          + `You would be starting again on recruiting.` }),
    );
  }

  private take(o: Approach): void {
    if (!acceptApproach(this.career, o)) {
      this.app.toast('That job is no longer open.');
      this.app.replace((a) => new ApproachesScreen(a, this.career));
      return;
    }
    saveHoopsCareer(this.career);
    this.app.toast(`You are the coach at ${worldTeam(o.teamId).name}.`);
    this.app.pop();
  }
}

/** The résumé as the sport would rate a programme, so it reads on the same scale. */
function resumeBar(score: number): number {
  return 20 + score * 0.78;
}
