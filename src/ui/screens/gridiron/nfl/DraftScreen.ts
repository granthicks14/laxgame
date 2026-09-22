import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, segmented, topbar } from '../../../components';
import { POSITIONS, POSITION_LABEL, type Position } from '../../../../sports/football/data';
import { teamOr } from '../../../../sports/football/nfl';
import {
  autoPick, draftDone, draftOrder, draftSlots, makePick, onTheClock, roundLabel, runDraft,
  scout, scoutLabel, type Slot,
} from '../../../../sports/football/franchise/draft';
import { needFor } from '../../../../sports/football/franchise/autogm';
import { push } from '../../../../sports/football/franchise/news';
import type { Franchise, Prospect } from '../../../../sports/football/franchise/types';
import { attrGrid, badge, kv, tile, tileGrid } from './parts';

/* ---------------------------------------------------------------------------
 * THE DRAFT ROOM
 * ---------------------------------------------------------------------------
 * The one place in the franchise where YOU DO NOT KNOW WHAT YOU ARE BUYING, and
 * that is deliberate. Every prospect has a true rating and a true ceiling which
 * this screen never shows you; what you see is a REPORT, and the report is
 * wrong by an amount that shrinks as you spend scouting on him.
 *
 * Scout nobody and you are drafting on projected round and a hunch. Scout six
 * men properly and you know those six and nothing about the other hundred and
 * thirty-four — which is exactly the trade every scouting department makes.
 *
 * It is never certain, even fully scouted. A draft you can solve by clicking
 * enough times is a shop.
 * ------------------------------------------------------------------------- */

type Filter = 'board' | 'need' | 'scouted' | 'taken';

export class DraftScreen implements Screen {
  el: HTMLElement;
  private app: App;
  private fr: Franchise;
  private onChange: () => void;
  private slots: Slot[];
  private filter: Filter = 'board';
  private posFilter: Position | 'ALL' = 'ALL';
  private body = h('div', { class: 'stack' });
  private head = h('div', { class: 'stack' });

  constructor(app: App, fr: Franchise, onChange: () => void) {
    this.app = app;
    this.fr = fr;
    this.onChange = onChange;
    this.slots = draftSlots(fr, draftOrder(fr));
    // Bring the room up to your pick the moment the screen opens.
    runDraft(fr, this.slots);

    this.el = screenEl(
      topbar(app, 'The draft', `Year ${fr.year} · ${fr.draftClass.length} prospects`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.head,
        segmented<Filter>([
          { value: 'board', label: 'Board' },
          { value: 'need', label: 'By need' },
          { value: 'scouted', label: 'Scouted' },
          { value: 'taken', label: 'Off the board' },
        ], this.filter, (v) => { this.filter = v; this.paint(); }, true),
        segmented<Position | 'ALL'>(
          [{ value: 'ALL' as const, label: 'All' },
            ...POSITIONS.map((p) => ({ value: p, label: p }))],
          this.posFilter, (v) => { this.posFilter = v; this.paint(); }, true),
        this.body)),
    );
    this.paint();
  }

  onUncovered(): void {
    this.paint();
  }

  private save(): void {
    this.onChange();
  }

  private paint(): void {
    const fr = this.fr;
    const clock = onTheClock(fr, this.slots);
    const mine = clock?.ownerId === fr.teamId;

    this.head.replaceChildren(
      tileGrid(
        tile('On the clock', clock ? `#${clock.overall}` : '—',
          clock ? `${teamOr(clock.ownerId).abbr} · ${roundLabel(clock.round)}` : 'Draft over'),
        tile('Scouting', String(fr.scoutPoints), 'trips left'),
        tile('Taken', String(fr.draftClass.filter((p) => p.takenBy).length), ''),
        tile('Your picks', String(fr.lastDraft.length), 'made')),
      mine
        ? panel('You are on the clock',
          h('div', { class: 'small', text: 'Take a man from the board, or let the room decide.' }),
          h('button', {
            class: 'btn',
            text: 'Best available',
            on: {
              click: () => {
                const p = autoPick(fr, clock!);
                if (p) push(fr, 'draft', `Drafted ${p.pos} ${p.first} ${p.last} at #${clock!.overall}.`);
                runDraft(fr, this.slots);
                this.save();
                this.paint();
              },
            },
          }))
        : draftDone(fr, this.slots)
          ? panel('The draft is over',
            h('div', { class: 'small', text: `${fr.lastDraft.length} picks made.` }),
            ...fr.lastDraft.map((d) => h('div', {
              class: 'small',
              text: `R${d.round} #${d.pick} — ${d.pos} ${d.name} (graded ${d.grade})`,
            })),
            h('button', {
              class: 'btn btn--primary',
              text: 'Back to the offseason',
              on: { click: () => this.app.pop() },
            }))
          : panel('Waiting',
            h('div', { class: 'small', text: `${teamOr(clock!.ownerId).name} are picking.` }),
            h('button', {
              class: 'btn',
              text: 'Let the board come to you',
              on: {
                click: () => { runDraft(fr, this.slots); this.save(); this.paint(); },
              },
            })),
    );

    this.body.replaceChildren(...this.list(clock, mine));
  }

  private list(clock: Slot | null, mine: boolean): HTMLElement[] {
    const fr = this.fr;
    let pool = fr.draftClass.filter((p) => (this.filter === 'taken' ? p.takenBy : !p.takenBy));
    if (this.posFilter !== 'ALL') pool = pool.filter((p) => p.pos === this.posFilter);
    if (this.filter === 'scouted') pool = pool.filter((p) => p.scouted > 0);
    if (this.filter === 'need') {
      pool = pool.sort((a, b) => (needFor(fr.roster, b.pos) * 26 + b.grade)
        - (needFor(fr.roster, a.pos) * 26 + a.grade));
    } else {
      pool = pool.sort((a, b) => b.grade - a.grade);
    }
    if (!pool.length) {
      return [panel('The board', h('div', { class: 'small', text: 'Nobody here.' }))];
    }
    return [panel(this.filter === 'taken' ? 'Off the board' : 'The board',
      ...pool.slice(0, 40).map((p) => this.row(p, clock, mine)))];
  }

  private row(p: Prospect, clock: Slot | null, mine: boolean): HTMLElement {
    const fr = this.fr;
    const need = needFor(fr.roster, p.pos);
    const canScout = p.scouted < 3 && fr.scoutPoints > 0 && !p.takenBy;

    return h('div', { class: 'job' },
      h('div', { class: 'job__head' },
        h('div', { class: 'job__name', text: `${p.pos} ${p.first} ${p.last}` }),
        h('div', { class: 'job__ask num', text: String(p.grade) })),
      h('div', {
        class: 'job__note tiny',
        text: `${p.college} · age ${p.age} · ${roundLabel(p.projectedRound)} projection · ${scoutLabel(p.scouted)}`,
      }),
      h('div', {
        class: 'tiny',
        text: `Report: ${p.floor}–${p.ceiling} at his best. `
          + `${p.strengths.length ? `Good: ${p.strengths.join(', ')}. ` : ''}`
          + `${p.weaknesses.length ? `Poor: ${p.weaknesses.join(', ')}.` : ''}`,
      }),
      need > 0.45 ? h('div', { class: 'tiny good', text: `You need a ${POSITION_LABEL[p.pos].toLowerCase()}.` }) : null,
      p.takenBy
        ? h('div', { class: 'tiny' }, badge(p.takenBy, 'sm'),
          h('span', { text: ` taken at #${p.takenAt}` }))
        : h('div', { class: 'row' },
          h('button', {
            class: 'btn btn--sm',
            text: canScout ? `Scout (${fr.scoutPoints} left)` : 'Scouted out',
            disabled: !canScout,
            on: {
              click: () => {
                if (scout(fr, p.id)) { this.save(); this.paint(); }
              },
            },
          }),
          h('button', {
            class: 'btn btn--sm',
            text: 'Look closer',
            on: { click: () => this.app.push((a) => new ProspectScreen(a, p)) },
          }),
          mine && clock
            ? h('button', {
              class: 'btn btn--sm btn--primary',
              text: `Draft at #${clock.overall}`,
              on: {
                click: () => {
                  const taken = makePick(fr, clock, p.id);
                  if (taken) {
                    push(fr, 'draft',
                      `Drafted ${taken.pos} ${taken.first} ${taken.last} at #${clock.overall}.`);
                  }
                  runDraft(fr, this.slots);
                  this.save();
                  this.paint();
                },
              },
            })
            : null));
  }
}

/* --------------------------------------------------------------- one prospect
 *
 * The attributes shown here are the REPORT's, not the truth: they are the true
 * numbers blurred by however much work has gone into him, so an unscouted man's
 * card is a rumour and a studied one's is nearly right.
 */
export class ProspectScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, p: Prospect) {
    /* THE CARD IS THE REPORT, NOT THE TRUTH. The true numbers are blurred by
     * however much work has gone into him, deterministically from his id — so
     * an unscouted man's card is a rumour, a studied one's is nearly right, and
     * neither changes when somebody reopens the page. */
    const blur = 3 - p.scouted;
    const attrs = { ...p.player.attrs };
    for (const key of Object.keys(attrs) as (keyof typeof attrs)[]) {
      const wobble = ((p.id.charCodeAt(key.length % p.id.length) % 7) - 3) * blur;
      attrs[key] = Math.max(20, Math.min(99, Math.round(attrs[key] + wobble)));
    }
    const shown = { ...p.player, attrs, overall: p.grade };

    this.el = screenEl(
      topbar(app, `${p.first} ${p.last}`, `${POSITION_LABEL[p.pos]} · ${p.college}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel('The report',
          kv('Grade', `${p.grade} now, ${p.floor}–${p.ceiling} at his best`),
          kv('Work done', scoutLabel(p.scouted)),
          kv('Projection', roundLabel(p.projectedRound)),
          kv('Age', String(p.age)),
          p.strengths.length ? kv('Strengths', p.strengths.join(', ')) : null,
          p.weaknesses.length ? kv('Weaknesses', p.weaknesses.join(', ')) : null,
          h('div', {
            class: 'tiny',
            text: p.scouted >= 3
              ? 'You know him about as well as anybody does. That is still not certainty.'
              : 'Send scouts and this gets closer to the truth. It never reaches it.',
          })),
        panel('What the scouts think he does', attrGrid(shown)),
      )),
    );
  }
}
