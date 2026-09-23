import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, segmented } from '../../../components';
import { teamOr } from '../../../../sports/football/nfl';
import { POSITIONS, type Player, type Position } from '../../../../sports/football/data';
import {
  OFFSEASON_LABEL, OFFSEASON_STEPS, type FreeAgent, type Franchise, type OffseasonStep,
} from '../../../../sports/football/franchise/types';
import {
  advanceOffseason, startNextSeason,
} from '../../../../sports/football/franchise/season';
import {
  SALARY_CAP, capRoom, capUsed, marketValue, starterBar,
} from '../../../../sports/football/franchise/club';
import {
  FA_WAVES, chanceOf, offerTo, reSign, reSignAsk, resolveWave, suggestedOffer, withdrawOffer,
} from '../../../../sports/football/franchise/freeAgency';
import { needFor } from '../../../../sports/football/franchise/autogm';
import { push } from '../../../../sports/football/franchise/news';
import { StaffScreen } from './StaffScreen';
import { FacilitiesScreen } from './FacilitiesScreen';
import { DraftScreen } from './DraftScreen';
import { kv, money, playerRow, tile, tileGrid } from './parts';

/* ---------------------------------------------------------------------------
 * THE OFFSEASON
 * ---------------------------------------------------------------------------
 * Six decisions, in the order they happen, ONE AT A TIME:
 *
 *   review -> staff -> your own contracts -> free agency -> the draft ->
 *   the buildings -> camp
 *
 * Each one closes behind you, which is the whole reason it is sequential: a
 * spring where contracts, free agency and the draft are all live at once is a
 * screen nobody can read on a phone, and a market you can go back and re-open
 * is a market you can re-roll until it gives you what you wanted.
 *
 * WHATEVER YOU SKIP, THE CLUB DOES FOR YOU. Not nothing — a real organisation
 * re-signs its own and bids on the market whether or not the coach is in the
 * building. Skip the lot and you get a competent, unremarkable spring; do it
 * yourself and you can do much better, which is the entire point of doing it
 * yourself.
 * ------------------------------------------------------------------------- */

export class OffseasonScreen implements Screen {
  el: HTMLElement;
  private app: App;
  private fr: Franchise;
  private onChange: () => void;
  private body = h('div', { class: 'wrapper stack' });
  private head = h('div', { class: 'topbar' });
  /** Which positions the market list shows. 'need' is the default for a reason. */
  private faFilter: Position | 'ALL' | 'NEED' = 'NEED';

  constructor(app: App, fr: Franchise, onChange: () => void) {
    this.app = app;
    this.fr = fr;
    this.onChange = onChange;
    this.el = screenEl(this.head, h('div', { class: 'scroll' }, this.body));
    this.paint();
  }

  onUncovered(): void {
    this.paint();
  }

  private save(): void {
    this.onChange();
  }

  private step(): OffseasonStep {
    return this.fr.offseasonStep;
  }

  private paint(): void {
    const fr = this.fr;
    const step = this.step();
    const i = Math.max(0, OFFSEASON_STEPS.indexOf(step));

    this.head.replaceChildren(
      h('button', {
        class: 'btn btn--icon btn--ghost',
        ariaLabel: 'Back',
        text: '←',
        on: { click: () => this.app.pop() },
      }),
      h('div', { class: 'topbar__title', text: OFFSEASON_LABEL[step] }),
      h('div', { class: 'topbar__sub', text: `Step ${i + 1} of ${OFFSEASON_STEPS.length} · year ${fr.year}` }));

    const body: (HTMLElement | null)[] = [this.progress(i)];
    if (step === 'review') body.push(...this.review());
    else if (step === 'staff') body.push(...this.staffStep());
    else if (step === 'contracts') body.push(...this.contracts());
    else if (step === 'freeagency') body.push(...this.freeAgency());
    else if (step === 'draft') body.push(...this.draftStep());
    else if (step === 'facilities') body.push(...this.facilities());
    else body.push(...this.ready());

    this.body.replaceChildren(...body.filter((x): x is HTMLElement => x !== null));
  }

  private progress(i: number): HTMLElement {
    return h('div', { class: 'stack', style: 'gap:4px' },
      h('div', { class: 'meter__track' },
        h('div', {
          class: 'meter__fill',
          style: `width:${((i + 1) / OFFSEASON_STEPS.length) * 100}%`,
        })),
      h('div', {
        class: 'tiny',
        text: OFFSEASON_STEPS.map((s, n) => (n === i ? OFFSEASON_LABEL[s].toUpperCase() : '·')).join(' '),
      }));
  }

  private next(label = 'Next'): HTMLElement {
    return h('button', {
      class: 'btn btn--primary btn--block',
      text: label,
      on: {
        click: () => {
          advanceOffseason(this.fr);
          this.save();
          this.paint();
        },
      },
    });
  }

  private skipAll(): HTMLElement {
    return h('button', {
      class: 'btn btn--muted',
      text: 'Let the front office handle the rest',
      on: {
        click: () => {
          startNextSeason(this.fr);
          this.save();
          this.app.pop();
        },
      },
    });
  }

  /* ------------------------------------------------------------- 1. review */

  private review(): HTMLElement[] {
    const fr = this.fr;
    const last = fr.history[fr.history.length - 1];
    const grew = fr.lastDevelopment.filter((d) => d.after > d.before);
    const fell = fr.lastDevelopment.filter((d) => d.after < d.before);

    return [
      panel(`Year ${fr.year - 1}`,
        last
          ? tileGrid(
            tile('Record', `${last.wins}-${last.losses}${last.ties ? `-${last.ties}` : ''}`, last.finish),
            tile('Points', `${last.pointsFor}`, `${last.pointsAgainst} against`),
            tile('Support', String(fr.fanSupport), ''),
            tile('Funds', money(fr.funds), `${money(fr.lastRevenue)} in`))
          : h('div', { class: 'small', text: 'A new franchise.' }),
        last?.mvp ? kv('Best of the season', last.mvp) : null),

      panel('Who has gone',
        ...(fr.lastDepartures.length
          ? fr.lastDepartures.map((d) => h('div', { class: 'small' },
            h('b', { text: `${d.pos} ${d.name}` }),
            ` — ${d.reason}, at ${d.age}.`))
          : [h('div', { class: 'small', text: 'Nobody retired.' })])),

      panel('A year older',
        h('div', { class: 'tiny', text: `${grew.length} improved, ${fell.length} slipped.` }),
        ...grew.slice(0, 6).map((d) => h('div', { class: 'small good' },
          `${d.pos} ${d.name}  ${d.before} → ${d.after}`)),
        ...fell.slice(0, 4).map((d) => h('div', { class: 'small warn' },
          `${d.pos} ${d.name}  ${d.before} → ${d.after}`))),

      this.next('On to the staff'),
      this.skipAll(),
    ];
  }

  /* -------------------------------------------------------------- 2. staff */

  private staffStep(): HTMLElement[] {
    const fr = this.fr;
    return [
      panel('Your three',
        ...(['HC', 'OC', 'DC'] as const).map((role) => kv(
          fr.staff[role].name,
          `${role} · ${fr.staff[role].overall} overall · ${money(fr.staff[role].salary)}`,
        )),
        h('div', { class: 'tiny', text: `${fr.staffMarket.length} coaches available. ${money(fr.funds)} in the budget.` }),
        h('button', {
          class: 'btn',
          text: 'Open the staff room',
          on: { click: () => this.app.push((a) => new StaffScreen(a, fr, () => this.save())) },
        })),
      this.next('On to your contracts'),
      this.skipAll(),
    ];
  }

  /* ---------------------------------------------------------- 3. contracts */

  private contracts(): HTMLElement[] {
    const fr = this.fr;
    const expiring = fr.roster.filter((p) => p.contractYears <= 0)
      .sort((a, b) => b.overall - a.overall);

    return [
      panel('Cap',
        tileGrid(
          tile('Committed', money(capUsed(fr.roster)), `of ${SALARY_CAP}M`),
          tile('Room', money(capRoom(fr)), ''),
          tile('Out of contract', String(expiring.length), ''),
          tile('Squad', String(fr.roster.length), ''))),

      panel('Out of contract',
        h('div', {
          class: 'tiny',
          text: 'Anybody you do not re-sign reaches the market, where somebody else '
            + 'may very well take him. What he asks for depends on what he is worth, '
            + 'what he is like, and how well your head coach negotiates.',
        }),
        ...(expiring.length
          ? expiring.map((p) => this.reSignRow(p))
          : [h('div', { class: 'small', text: 'Nobody is out of contract.' })])),

      this.next('On to free agency'),
      this.skipAll(),
    ];
  }

  private reSignRow(p: Player): HTMLElement {
    const fr = this.fr;
    const ask = reSignAsk(fr, p);
    const afford = ask.salary <= capRoom(fr) + p.salary;
    const status = h('div', { class: 'tiny' });
    return h('div', { class: 'job' },
      playerRow(p, { note: `${p.age} · was ${money(p.salary)} · market ${money(marketValue(p))}` }),
      h('div', { class: 'job__ask tiny', text: `Wants ${money(ask.salary)} for ${ask.years} years.` }),
      status,
      h('div', { class: 'row' },
        h('button', {
          class: 'btn btn--sm btn--primary',
          text: afford ? `Re-sign — ${money(ask.salary)}` : 'No cap room',
          disabled: !afford,
          on: {
            click: () => {
              if (!reSign(fr, p.id, ask.salary, ask.years)) {
                status.textContent = 'He would not take that.';
                return;
              }
              push(fr, 'signing', `${p.pos} ${p.first} ${p.last} re-signs for ${money(ask.salary)}.`);
              this.save();
              this.paint();
            },
          },
        })));
  }

  /* -------------------------------------------------------- 4. free agency */

  private freeAgency(): HTMLElement[] {
    const fr = this.fr;
    /* SORTED BY HOW GOOD HE IS FOR HIS POSITION, not by the raw number. A
     * kicker reading eighty-four is an ordinary kicker; a corner reading
     * eighty-four is a starter. A list sorted on the number puts the kicker
     * first and makes the market look like it is full of specialists. */
    const worth = (f: FreeAgent): number =>
      f.player.overall - starterBar(f.player.pos) + needFor(fr.roster, f.player.pos) * 10;
    const open = fr.freeAgents.filter((f) => !f.signedBy)
      .sort((a, b) => worth(b) - worth(a));
    let shown = open.filter((f) => (this.faFilter === 'ALL' ? true
      : this.faFilter === 'NEED' ? needFor(fr.roster, f.player.pos) > 0.3 || f.offer
        : f.player.pos === this.faFilter));
    /* A SQUAD WITH NO HOLES STILL SHOPS. "Needs" on a roster that has none is
     * an empty list with a button above it, so it falls back to everybody. */
    const noNeeds = this.faFilter === 'NEED' && !shown.length && open.length > 0;
    if (noNeeds) shown = open;
    const gone = fr.freeAgents.filter((f) => f.signedBy);
    const committed = open.filter((f) => f.offer).reduce((s, f) => s + (f.offer?.salary ?? 0), 0);

    return [
      panel(`Wave ${Math.min(fr.faWave, FA_WAVES)} of ${FA_WAVES}`,
        h('div', {
          class: 'tiny',
          text: 'Make your offers, then close the wave. The best men go first — if '
            + 'you are still deciding in wave three you are shopping in what is left.',
        }),
        tileGrid(
          tile('Room', money(capRoom(fr)), ''),
          tile('Offered', money(committed), `${open.filter((f) => f.offer).length} bids`),
          tile('Squad', String(fr.roster.length), ''),
          tile('Available', String(open.length), '')),
        h('button', {
          class: 'btn btn--primary',
          text: fr.faWave >= FA_WAVES ? 'Close the market' : 'Close this wave',
          on: {
            click: () => {
              const { signed, lost } = resolveWave(fr);
              for (const p of signed) {
                push(fr, 'signing', `${p.pos} ${p.first} ${p.last} (${p.overall}) signs `
                  + `for ${money(p.salary)} over ${p.contractYears}.`);
              }
              void lost;
              this.save();
              this.paint();
            },
          },
        })),

      panel('On the market',
        segmented<Position | 'ALL' | 'NEED'>([
          { value: 'NEED', label: 'Needs' },
          { value: 'ALL', label: 'All' },
          ...POSITIONS.map((p) => ({ value: p, label: p })),
        ], this.faFilter, (v) => { this.faFilter = v; this.paint(); }, true),
        noNeeds ? h('div', { class: 'tiny', text: 'No obvious holes — showing everybody.' }) : null,
        ...(shown.length
          ? shown.slice(0, 30).map((fa) => this.faRow(fa))
          : [h('div', {
            class: 'small',
            text: open.length
              ? 'Nobody here fits that. Try All.'
              : 'The market is empty.',
          })])),

      gone.length
        ? panel('Signed elsewhere',
          ...gone.slice(0, 10).map((fa) => h('div', { class: 'small' },
            h('b', { text: `${fa.player.pos} ${fa.player.first} ${fa.player.last}` }),
            ` — ${fa.outcome ?? 'gone'}`)))
        : null,

      this.next('On to the draft'),
      this.skipAll(),
    ].filter((x): x is HTMLElement => x !== null);
  }

  private faRow(fa: FreeAgent): HTMLElement {
    const fr = this.fr;
    const suggested = suggestedOffer(fa, fr);
    const need = needFor(fr.roster, fa.player.pos);
    const chance = Math.round(chanceOf(fr, fa) * 100);
    const status = h('div', { class: 'tiny' });

    const bid = (amount: number): void => {
      const res = offerTo(fr, fa.id, amount, fa.askYears);
      status.textContent = res.why;
      status.className = res.ok ? 'tiny good' : 'tiny warn';
      if (res.ok) { this.save(); this.paint(); }
    };

    return h('div', { class: 'job' },
      playerRow(fa.player, {
        note: `${fa.player.age} · ${fa.suitors} other ${fa.suitors === 1 ? 'club' : 'clubs'} in`
          + `${need > 0.45 ? ' · YOU NEED ONE' : ''}`,
      }),
      h('div', {
        class: 'job__ask tiny',
        text: `Asking ${money(fa.askSalary)} for ${fa.askYears}. `
          + `Going rate here looks like ${money(suggested)}.`,
      }),
      fa.offer
        ? h('div', { class: 'tiny good', text: `Your offer: ${money(fa.offer.salary)} × ${fa.offer.years} — he takes it about ${chance} times in a hundred.` })
        : null,
      status,
      h('div', { class: 'row' },
        h('button', {
          class: 'btn btn--sm',
          text: `Offer ${money(suggested)}`,
          on: { click: () => bid(suggested) },
        }),
        h('button', {
          class: 'btn btn--sm',
          text: `Push to ${money(Math.round(suggested * 1.25 * 10) / 10)}`,
          on: { click: () => bid(Math.round(suggested * 1.25 * 10) / 10) },
        }),
        fa.offer
          ? h('button', {
            class: 'btn btn--sm btn--muted',
            text: 'Withdraw',
            on: {
              click: () => { withdrawOffer(fr, fa.id); this.save(); this.paint(); },
            },
          })
          : null));
  }

  /* -------------------------------------------------------------- 5. draft */

  private draftStep(): HTMLElement[] {
    const fr = this.fr;
    const taken = fr.draftClass.filter((p) => p.takenBy).length;
    return [
      panel('The draft',
        tileGrid(
          tile('Class', String(fr.draftClass.length), `${taken} off the board`),
          tile('Scouting', String(fr.scoutPoints), 'trips left'),
          tile('Your picks', String(fr.picks.filter((p) => p.year === fr.year && p.ownerId === fr.teamId).length), ''),
          tile('Squad', String(fr.roster.length), '')),
        h('div', {
          class: 'tiny',
          text: 'Scout first: a report you have not paid for is a guess. It never '
            + 'becomes certainty, however much work goes in.',
        }),
        h('button', {
          class: 'btn btn--primary',
          text: taken ? 'Back to the draft room' : 'Into the draft room',
          on: {
            click: () => this.app.push((a) => new DraftScreen(a, fr, () => this.save())),
          },
        })),
      this.next('On to the buildings'),
      this.skipAll(),
    ];
  }

  /* --------------------------------------------------------- 6. facilities */

  private facilities(): HTMLElement[] {
    const fr = this.fr;
    return [
      panel('The buildings',
        kv('Funds', money(fr.funds)),
        h('div', {
          class: 'tiny',
          text: 'Training, medical, the stadium, scouting and the practice facility. '
            + 'Five things, all of which you will feel inside a season.',
        }),
        h('button', {
          class: 'btn',
          text: 'Open facilities',
          on: { click: () => this.app.push((a) => new FacilitiesScreen(a, fr, () => this.save())) },
        })),
      this.next('Ready for camp'),
      this.skipAll(),
    ];
  }

  /* --------------------------------------------------------------- 7. camp */

  private ready(): HTMLElement[] {
    const fr = this.fr;
    const team = teamOr(fr.teamId);
    return [
      panel('Camp',
        h('div', { class: 'small', text: `The ${team.name} are ready for year ${fr.year}.` }),
        tileGrid(
          tile('Squad', String(fr.roster.length), ''),
          tile('Cap room', money(capRoom(fr)), ''),
          tile('Funds', money(fr.funds), ''),
          tile('Head coach', String(fr.staff.HC.overall), fr.staff.HC.name)),
        fr.lastDraft.length
          ? h('div', { class: 'stack', style: 'gap:2px' },
            h('div', { class: 'eyebrow', text: 'This year’s draft' }),
            ...fr.lastDraft.map((d) => h('div', {
              class: 'small',
              text: `R${d.round} #${d.pick} — ${d.pos} ${d.name} (graded ${d.grade})`,
            })))
          : null,
        h('button', {
          class: 'btn btn--primary btn--block',
          text: 'Start the season',
          on: {
            click: () => {
              startNextSeason(fr);
              this.save();
              this.app.pop();
            },
          },
        })),
    ];
  }
}
