import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush, segmented } from '../../../components';
import { worldTeam } from '../../../../sports/basketball/world';
import {
  PRIORITY_LABEL, classGrade, committedTo, interestFactors, makeOffer, openOffers,
  prospectOdds, reportText, withdrawOffer, type Prospect, type ProgramPitch,
} from '../../../../sports/basketball/career/recruit';
import { modsFor } from '../../../../sports/basketball/career/difficulty';
import { perksOf } from '../../../../sports/basketball/career/coach';
import { standingOf } from '../../../../sports/basketball/career/league';
import { rowFor } from '../../../../sports/basketball/career/schedule';
import {
  coachStature, needsFor, recruitWeek, recruitingDone,
} from '../../../../sports/basketball/career/season';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { bigButton, pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE RECRUITING BOARD
 * ---------------------------------------------------------------------------
 * Everything a recruiting screen has to say, and it is not "click to roll":
 *
 *   WHAT HE IS      a ranking and a scouting report, both of which can be wrong,
 *                   and get less wrong the longer you are around him.
 *   WHAT HE WANTS   minutes, winning, development, the programme, home — his own
 *                   weights, shown as bars, because two identical players do not
 *                   want the same thing.
 *   WHETHER YOU CAN GET HIM. The odds column. A programme at the bottom does not
 *                   sign the best player in the class; it signs the ones nobody
 *                   else called and turns them into the best player in the class,
 *                   and a board that hides this teaches the player nothing.
 *
 * And the needs line above it all, with NEED and PLACES stated separately: no
 * immediate need at a position never stops you recruiting there, it just means
 * the boy will have somebody in front of him.
 * ------------------------------------------------------------------------- */

type Filter = 'all' | 'offered' | 'gettable';

export class BoardScreen implements Screen {
  el: HTMLElement;
  private filter: Filter = 'all';
  private open = new Set<string>();
  private body!: HTMLElement;

  constructor(private app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'Recruiting', this.weekLine()),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private weekLine(): string {
    const st = this.career.recruiting;
    if (!st) return '';
    return st.week >= st.weeks ? 'The cycle is closed'
      : `Week ${st.week + 1} of ${st.weeks}`;
  }

  private pitch(): ProgramPitch {
    const c = this.career;
    const row = rowFor(c.standings, c.teamId);
    const games = Math.max(1, row.wins + row.losses);
    return {
      teamId: c.teamId,
      standing: standingOf(c, c.teamId),
      form: row.wins / games,
      perks: perksOf(c.coach),
      needs: needsFor(c),
      region: 'in state',
      level: c.level,
      reputation: coachStature(c),
    };
  }

  private advance(): void {
    const news = recruitWeek(this.career);
    saveHoopsCareer(this.career);
    if (news.length) this.app.toast(news[0]);
    this.paint();
  }

  private paint(): void {
    const c = this.career;
    const st = c.recruiting;
    if (!st) {
      this.body.replaceChildren(panel(null,
        h('div', { class: 'small', text: 'Recruiting is closed.' })));
      return;
    }
    const mods = modsFor(c.tier);
    const prog = this.pitch();
    const needs = prog.needs;
    const signed = committedTo(st, c.teamId);
    const grade = classGrade(st, c.teamId);
    const done = recruitingDone(c);

    const rows = st.prospects
      .map((p) => ({ p, odds: prospectOdds(p, prog, mods) }))
      .filter((x) => {
        if (this.filter === 'offered') return x.p.offered || x.p.committedTo === c.teamId;
        if (this.filter === 'gettable') {
          return !x.p.committedTo && (x.odds.odds === 'favourite' || x.odds.odds === 'contest');
        }
        return true;
      })
      .sort((a, b) => b.p.seenCeiling - a.p.seenCeiling);

    this.body.replaceChildren(
      panel(`${needs.openSpots} place${needs.openSpots === 1 ? '' : 's'} to fill`,
        h('div', { class: 'small',
          text: needs.list.map((n) => `${n.pos} ${n.needLabel.toLowerCase()} (${n.open} free)`).join(' · ') }),
        h('div', { class: 'tiny',
          text: `${openOffers(st)} of ${st.offerLimit} offers out · `
            + `${signed.length} committed${grade.signed ? ` · class ${grade.grade}` : ''}` })),

      done
        ? panel(null, h('div', { class: 'small',
          text: `The cycle is over. ${signed.length} player`
            + `${signed.length === 1 ? '' : 's'} will arrive in the autumn.` }))
        : panel(null, bigButton('Work the week', 'Calls, visits and whatever the rivals do',
          () => this.advance())),

      ...(st.news.length ? [panelFlush('Word from the road',
        ...st.news.slice(0, 6).map((n) => h('div', { class: 'kv' },
          h('div', { class: 'kv__v', text: n }))))] : []),

      segmented<Filter>([
        { value: 'all', label: `Board (${st.prospects.length})` },
        { value: 'gettable', label: 'Winnable' },
        { value: 'offered', label: 'Offered' },
      ], this.filter, (v) => { this.filter = v; this.paint(); }, true),

      panelFlush(null, ...(rows.length
        ? rows.map((x) => this.prospect(x.p, x.odds, prog, done))
        : [h('div', { class: 'prospect__open small', text: 'Nobody here.' })])),
    );
  }

  private prospect(
    p: Prospect, odds: ReturnType<typeof prospectOdds>, prog: ProgramPitch, done: boolean,
  ): HTMLElement {
    const c = this.career;
    const opened = this.open.has(p.id);
    const mine = p.committedTo === c.teamId;
    const gone = !!p.committedTo && !mine;
    const tone = odds.odds === 'favourite' ? 'good'
      : odds.odds === 'contest' ? 'warn' : odds.odds === 'longshot' ? 'flat' : 'bad';

    const head = h('button', {
      class: 'prospect__head',
      on: { click: () => { if (opened) this.open.delete(p.id); else this.open.add(p.id); this.paint(); } },
    },
    h('span', { class: 'prospect__stars', text: '★'.repeat(p.stars) }),
    h('div', { class: 'prospect__body' },
      h('div', { class: 'prospect__name', text: `${p.player.first} ${p.player.last}` }),
      h('div', { class: 'prospect__note tiny',
        text: `${p.player.pos} · from ${p.region} · ${reportText(p)}` })),
    mine ? pill('COMMITTED', 'good')
      : gone ? pill('GONE', 'bad')
        : pill(odds.label, tone),
    h('span', { class: 'prospect__ovr num', text: String(p.seenOverall) }));

    if (!opened) return h('div', { class: 'prospect' }, head);

    const factors = interestFactors(p, prog);
    const needs = prog.needs.byPos[p.player.pos];
    return h('div', { class: 'prospect' }, head,
      h('div', { class: 'prospect__open stack' },
        h('div', { class: 'tiny',
          text: `Seen at ${p.seenOverall}, ceiling around ${p.seenCeiling}`
            + `${p.scouted ? ' — scouted properly' : ' — that is a rumour, not a report'}.` }),
        h('div', { class: 'tiny',
          text: `At your programme: ${needs.needLabel.toLowerCase()} at ${p.player.pos}, `
            + `${needs.open} place${needs.open === 1 ? '' : 's'} open.` }),
        ...factors.map((f) => h('div', { class: 'factor' },
          h('div', { class: 'factor__label', text: f.label }),
          h('div', { class: 'factor__bar' },
            h('div', {
              class: `factor__fill${f.score < 0 ? ' is-neg' : ''}`,
              style: f.score >= 0
                ? `left:50%;width:${Math.min(50, f.score * 50 * f.weight + 1)}%`
                : `right:50%;left:auto;width:${Math.min(50, -f.score * 50 * f.weight + 1)}%`,
            })),
          h('div', { class: 'factor__note', text: f.note }))),
        h('div', { class: 'tiny',
          text: `He wants: ${(Object.entries(p.wants) as [keyof typeof PRIORITY_LABEL, number][])
            .sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([k, v]) => `${PRIORITY_LABEL[k]} ${v > 0.7 ? 'HIGH' : v > 0.4 ? 'MEDIUM' : 'LOW'}`)
            .join(' · ')}` }),
        h('div', { class: 'tiny',
          text: `${odds.note}. You stand at ${odds.mine}`
            + `${p.suitors.length ? `, the programme ahead of you at ${odds.rival}` : ''}.` }),
        p.committedTo || done ? null
          : p.offered
            ? h('button', { class: 'btn btn--ghost', text: 'Withdraw the offer',
              on: { click: () => { withdrawOffer(this.career.recruiting!, p.id); saveHoopsCareer(c); this.paint(); } } })
            : h('button', { class: 'btn btn--primary', text: 'Offer him a place',
              on: { click: () => {
                const why = makeOffer(this.career.recruiting!, p.id);
                if (why) this.app.toast(why, 'bad');
                else { saveHoopsCareer(c); this.paint(); }
              } } }),
        gone && p.committedTo && p.committedTo !== 'unsigned'
          ? h('div', { class: 'tiny', text: `He chose ${worldTeam(p.committedTo).abbr}.` })
          : null,
      ));
  }
}
