import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, segmented } from '../../../components';
import { POSITION_LABEL } from '../../../../sports/football/data';
import { worldTeam } from '../../../../sports/football/world';
import {
  classSize, interestOf, interestReasons, offer, visit,
} from '../../../../sports/football/career/recruit';
import { startNextSeason } from '../../../../sports/football/career/season';
import {
  takeJob, verdictFor, type ChallengeVerdict,
} from '../../../../sports/football/career/challenge';
import type { FootballCareer, Recruit } from '../../../../sports/football/career/types';

/* ---------------------------------------------------------------------------
 * THE OFFSEASON
 * ---------------------------------------------------------------------------
 * Four things, in the order they happen, and the screen does not pretend
 * otherwise: who left, who got better, who you are chasing, and — in Challenge —
 * whether you still have a job.
 *
 * THE RECRUITING BOARD IS THE POINT OF IT. Every recruit says what he thinks of
 * the programme AND WHY, itemised, because an interest number a coach cannot
 * account for is a number he will assume is random and stop reading.
 * ------------------------------------------------------------------------- */

type Tab = 'summary' | 'board';

export class CareerOffseasonScreen implements Screen {
  el: HTMLElement;
  private tab: Tab = 'summary';
  private body = h('div', { class: 'stack' });
  private sortBy: 'need' | 'best' | 'keen' = 'need';

  constructor(private app: App, private career: FootballCareer, private onChange: () => void) {
    this.paint();
    this.el = screenEl(
      topbar(app, 'The offseason', `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          segmented<Tab>(
            [{ value: 'summary', label: 'What happened' }, { value: 'board', label: 'Recruiting' }],
            this.tab,
            (v) => { this.tab = v; this.paint(); }, true),
          this.body)),
    );
  }

  private paint(): void {
    this.body.replaceChildren(...(this.tab === 'summary' ? this.summary() : this.board()));
  }

  private summary(): HTMLElement[] {
    const c = this.career;
    const out: HTMLElement[] = [];

    if (c.challenge) out.push(this.challengePanel());

    out.push(panel('Who left',
      ...(c.lastDepartures.length
        ? c.lastDepartures.map((d) => h('div', { class: 'small' },
          h('b', { text: `${d.pos} ${d.name}` }), ` — ${d.reason}`))
        : [h('div', { class: 'small', text: 'Nobody.' })])));

    const grew = c.lastDevelopment.filter((d) => d.after > d.before);
    out.push(panel('Who got better',
      ...(grew.length
        ? grew.slice(0, 12).map((d) => h('div', { class: 'small' },
          h('b', { text: `${d.pos} ${d.name}` }),
          ` — ${d.before} to ${d.after}`,
          h('span', { class: 'grew', text: ` +${d.after - d.before}` })))
        : [h('div', { class: 'small', text: 'A quiet winter.' })]),
      h('div', {
        class: 'tiny',
        text: 'Players improve most in their first years, most when they played, and '
          + 'most when the programme is well coached.',
      })));

    out.push(h('button', {
      class: 'btn btn--primary',
      text: `Sign the class and start year ${c.year}`,
      on: {
        click: () => {
          startNextSeason(c);
          this.onChange();
          this.app.pop();
        },
      },
    }));
    return out;
  }

  private challengePanel(): HTMLElement {
    const c = this.career;
    const champion = c.history[c.history.length - 1]?.champion ?? false;
    const verdict: ChallengeVerdict = verdictFor(c, champion);

    const take = (id: string): void => {
      takeJob(c, id);
      this.onChange();
      this.paint();
    };

    if (verdict.kind === 'sacked' && verdict.fallback) {
      const club = worldTeam(verdict.fallback.teamId);
      return panel(verdict.headline,
        h('div', { class: 'small', text: verdict.line }),
        h('button', {
          class: 'btn btn--primary',
          text: `Take over at ${club?.city} ${club?.name}`,
          on: { click: () => take(verdict.fallback!.teamId) },
        }));
    }
    if (verdict.kind === 'offers') {
      return panel(verdict.headline,
        h('div', { class: 'small', text: verdict.line }),
        ...verdict.offers.map((id) => {
          const t = worldTeam(id);
          if (!t) return h('div');
          return h('button', {
            class: 'btn',
            text: `${t.city} ${t.name} — ${t.level}`,
            on: { click: () => take(id) },
          });
        }),
        h('div', { class: 'tiny', text: 'Or stay where you are and finish the job.' }));
    }
    return panel(verdict.headline, h('div', { class: 'small', text: verdict.line }));
  }

  private board(): HTMLElement[] {
    const c = this.career;
    const limit = classSize(c);
    const shape = c.roster;
    const need = (pos: string): number =>
      -shape.filter((p) => p.pos === pos).length;

    const sorted = [...c.recruits].sort((a, b) => {
      if (this.sortBy === 'best') return b.overall - a.overall;
      if (this.sortBy === 'keen') return interestOf(c, b) - interestOf(c, a);
      return need(a.pos) - need(b.pos) || b.overall - a.overall;
    });

    return [
      panel('The class',
        h('div', { class: 'small', text: `Room for ${limit}. `
          + `${c.offersLeft} offers left, ${c.visitsLeft} visits left.` }),
        h('div', {
          class: 'tiny',
          text: 'A visit warms a recruit up. An offer is what he actually signs. '
            + 'Nobody signs without one.',
        }),
        segmented<'need' | 'best' | 'keen'>(
          [{ value: 'need', label: 'By need' }, { value: 'best', label: 'Best' },
            { value: 'keen', label: 'Keenest' }],
          this.sortBy,
          (v) => { this.sortBy = v; this.paint(); }, true)),
      ...sorted.slice(0, 30).map((r) => this.recruitRow(r)),
    ];
  }

  private recruitRow(r: Recruit): HTMLElement {
    const c = this.career;
    const keen = interestOf(c, r);
    const reasons = interestReasons(c, r);
    const committed = r.committedTo !== null;

    return panel(`${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}  `
      + `${POSITION_LABEL[r.pos]} — ${r.first} ${r.last}`,
    h('div', { class: 'club-line' },
      h('div', { class: 'club-line__body' },
        h('div', { class: 'club-line__note tiny', text: `Ceiling ${r.potential}` }),
        h('div', { class: 'meter' },
          h('div', { class: 'meter__label tiny', text: 'Interest' }),
          h('div', { class: 'meter__track' },
            h('div', { class: 'meter__fill', style: `width:${keen}%` })),
          h('div', { class: 'meter__num num', text: String(keen) }))),
      h('div', { class: 'club-line__ovr num', text: String(r.overall) })),
    h('div', { class: 'tiny' }, reasons.map((x) =>
      `${x.label} ${x.delta > 0 ? '+' : ''}${x.delta}`).join(' · ')),
    committed
      ? h('div', { class: 'small', text: r.committedTo === c.teamId ? 'Committed to you.' : 'Gone elsewhere.' })
      : h('div', { class: 'stack', style: 'gap:6px' },
        h('button', {
          class: 'btn btn--sm',
          text: `Visit (${c.visitsLeft} left)`,
          disabled: c.visitsLeft <= 0,
          on: { click: () => { if (visit(c, r)) { this.onChange(); this.paint(); } } },
        }),
        h('button', {
          class: 'btn btn--sm btn--primary',
          text: r.offered ? 'Offered' : `Offer (${c.offersLeft} left)`,
          disabled: r.offered || c.offersLeft <= 0,
          on: { click: () => { if (offer(c, r)) { this.onChange(); this.paint(); } } },
        })));
  }
}
