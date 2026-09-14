import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel } from '../../../components';
import { worldTeam } from '../../../../sports/basketball/world';
import { LEVELS } from '../../../../sports/basketball/levels';
import { SITUATIONS, legacyScore, type JobOffer } from '../../../../sports/basketball/career/challenge';
import { rungAt, chapterOf, rungLabel } from '../../../../sports/basketball/career/ladder';
import { refuseJobs, takeJob } from '../../../../sports/basketball/career/season';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { badge, kvRow, pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE JOBS ON THE TABLE
 * ---------------------------------------------------------------------------
 * Winning a championship does not promote you. It gets you INTERVIEWS — and the
 * best programme in the list is reliably the one in the deepest trouble, which
 * is the whole decision. A settled side at a smaller school, or a sleeping giant
 * whose last coach left half the squad in the portal?
 *
 * Turning them all down is a real option. After a title it means staying where
 * you are, which is sometimes right. After a sacking it means a year out of the
 * game, and the second of those ends the career.
 * ------------------------------------------------------------------------- */

export class JobsScreen implements Screen {
  el: HTMLElement;

  constructor(private app: App, private career: HoopsCareer) {
    this.el = this.build();
  }

  private build(): HTMLElement {
    const c = this.career;
    const st = c.challenge;
    const app = this.app;

    if (!st || !st.offers) {
      return screenEl(topbar(app, 'The jobs', ''),
        h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
          panel(null, h('div', { class: 'small', text: 'Nothing on the table.' })))));
    }

    if (st.complete) return this.ending();

    const sacked = st.offerKind === 'demotion';
    const chapter = chapterOf(st.rungIndex);

    return screenEl(
      topbar(app, sacked ? 'Out of a job' : 'The phone is ringing',
        rungLabel(st.rungIndex)),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel(null,
          h('div', { class: 'small', text: sacked
            ? 'You have been let go. These are the programmes still willing to talk.'
            : st.offerKind === 'rehire'
              ? 'A year out of the game. Somebody has finally called.'
              : `You won it. ${chapter.key === 'professional' ? '' : 'Programmes above you want to talk.'}` }),
          kvRow(
            ['Reputation', String(Math.round(st.reputation))],
            ['Seasons', String(st.totalYears)],
            ['Titles', String(Object.values(st.titles).reduce((a, b) => a + b, 0))],
            ['Rung', `${st.rungIndex + 1}/9`],
          ),
          h('div', { class: 'tiny',
            text: 'The strongest programme here is usually the one in the most trouble. '
              + 'What you inherit is what the situation says you inherit.' })),

        ...st.offers.map((o) => this.job(o)),

        panel(null,
          h('button', {
            class: 'btn btn--ghost btn--wide',
            on: { click: () => this.refuse() },
          },
          h('span', { class: 'btn__label', text: sacked ? 'Take a year out' : 'Stay where you are' }),
          h('span', { class: 'btn__sub', text: sacked
            ? `A year on the sofa. ${st.strikes >= 1 ? 'A second one ends the career.' : 'Then whoever will still call.'}`
            : `Keep building at ${worldTeam(c.teamId).name}.` }))),
      )),
    );
  }

  private job(o: JobOffer): HTMLElement {
    const team = worldTeam(o.teamId);
    const sit = SITUATIONS[o.situation];
    const rung = rungAt(o.rungIndex);
    return h('button', { class: 'job', on: { click: () => this.take(o) } },
      h('div', { class: 'job__head' },
        badge(team),
        h('div', { class: 'job__name', text: `${team.city} ${team.name}` }),
        pill(rung.short, 'warn')),
      h('div', { class: 'job__note', text: `${sit.label}. ${sit.blurb}` }),
      h('div', { class: 'job__ask tiny',
        text: `They are rated ${o.standing} at this level · ${LEVELS[rung.level].name}` }),
      h('div', { class: 'job__ask tiny', text: `The board: ${o.expectation.text}` }),
    );
  }

  private take(o: JobOffer): void {
    takeJob(this.career, o);
    saveHoopsCareer(this.career);
    this.app.toast(`You are the coach at ${worldTeam(o.teamId).name}.`);
    this.app.pop();
  }

  private refuse(): void {
    const message = refuseJobs(this.career);
    saveHoopsCareer(this.career);
    this.app.toast(message);
    if (this.career.challenge?.complete) {
      this.app.replace((a) => new JobsScreen(a, this.career));
      return;
    }
    this.app.pop();
  }

  /* --------------------------------------------------------------- the end */

  private ending(): HTMLElement {
    const c = this.career;
    const st = c.challenge!;
    const legacy = legacyScore(st);
    const won = st.rungIndex >= 8 && Object.keys(st.titles).length > 0
      && !!st.endedReason?.startsWith('You won');
    return screenEl(
      topbar(this.app, won ? 'The climb is over' : 'The end of a career', ''),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel(null,
          h('div', { class: 'small', text: st.endedReason ?? '' }),
          kvRow(
            ['Seasons', String(st.totalYears)],
            ['Titles', String(Object.values(st.titles).reduce((a, b) => a + b, 0))],
            ['Record', `${c.careerWins}-${c.careerLosses}`],
            ['Legacy', String(legacy.score)],
          ),
          h('div', { class: 'small', text: legacy.title })),
        panel('What it was worth',
          ...legacy.lines.map((l) => h('div', { class: 'kv' },
            h('div', { class: 'kv__k tiny', text: l.label }),
            h('div', { class: 'kv__v', text: `${l.value}  (+${l.points})` })))),
        panel('Every job',
          ...st.steps.filter((s) => s.champion || s.outcome !== 'stay').map((s) =>
            h('div', { class: 'kv' },
              h('div', { class: 'kv__k tiny', text: `Y${s.year}` }),
              h('div', { class: 'kv__v',
                text: `${s.teamShort} ${s.wins}-${s.losses} · ${s.finish}` })))),
        h('button', { class: 'btn btn--primary', text: 'Done',
          on: { click: () => this.app.pop() } }),
      )),
    );
  }
}
