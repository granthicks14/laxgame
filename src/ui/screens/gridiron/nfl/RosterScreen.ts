import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, segmented, topbar } from '../../../components';
import { POSITIONS, POSITION_LABEL, depthAt, type Player, type Position } from '../../../../sports/football/data';
import { teamOr } from '../../../../sports/football/nfl';
import {
  MINIMUM_SHAPE, ROSTER_LIMIT, SALARY_CAP, capUsed, cutCost, marketValue, starterBar,
} from '../../../../sports/football/franchise/club';
import { needsOf } from '../../../../sports/football/franchise/autogm';
import { injuredList } from '../../../../sports/football/franchise/world';
import { canCut } from '../../../../sports/football/franchise/season';
import { release } from '../../../../sports/football/franchise/freeAgency';
import { push } from '../../../../sports/football/franchise/news';
import type { Franchise } from '../../../../sports/football/franchise/types';
import { attrGrid, kv, money, playerFacts, playerRow, tile, tileGrid } from './parts';

/* ---------------------------------------------------------------------------
 * THE ROSTER
 * ---------------------------------------------------------------------------
 * Every man in the building, in the order a coach thinks about them: by
 * position, best first, because that IS the depth chart — the engine starts
 * whoever is top of the group and a roster screen that sorted any other way
 * would be describing a different team from the one that takes the field.
 *
 * WHAT IT HAS TO ANSWER, above everything: where am I thin? So the holes are
 * named at the top, in words, before a single row of the list.
 * ------------------------------------------------------------------------- */

type View = 'depth' | 'needs' | 'money' | 'injuries';

export class RosterScreen implements Screen {
  el: HTMLElement;
  private app: App;
  private fr: Franchise;
  private onChange: () => void;
  private view: View = 'depth';
  private body = h('div', { class: 'stack' });

  constructor(app: App, fr: Franchise, onChange: () => void) {
    this.app = app;
    this.fr = fr;
    this.onChange = onChange;
    this.el = screenEl(
      topbar(app, 'Roster', `${teamOr(fr.teamId).name} · ${fr.roster.length} of ${ROSTER_LIMIT}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.summary(),
        segmented<View>([
          { value: 'depth', label: 'Depth' },
          { value: 'needs', label: 'Needs' },
          { value: 'money', label: 'Money' },
          { value: 'injuries', label: 'Injuries' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body)),
    );
    this.paint();
  }

  onUncovered(): void {
    this.paint();
  }

  private summary(): HTMLElement {
    const fr = this.fr;
    const used = capUsed(fr.roster);
    const age = fr.roster.reduce((s, p) => s + p.age, 0) / Math.max(1, fr.roster.length);
    const out = injuredList(fr).filter((p) => (p.injury?.weeks ?? 0) >= 1).length;
    return tileGrid(
      tile('Cap room', money(Math.max(0, SALARY_CAP - used)), `${money(used)} committed`),
      tile('Squad', String(fr.roster.length), `limit ${ROSTER_LIMIT}`),
      tile('Average age', age.toFixed(1), ''),
      tile('Unavailable', String(out), out ? 'out this week' : 'everybody fit'));
  }

  private paint(): void {
    const fr = this.fr;
    if (this.view === 'needs') { this.body.replaceChildren(this.needsPanel()); return; }
    if (this.view === 'injuries') { this.body.replaceChildren(this.injuryPanel()); return; }
    if (this.view === 'money') { this.body.replaceChildren(this.moneyPanel()); return; }

    const groups = POSITIONS.map((pos) => {
      const at = depthAt(fr.roster, pos);
      const bar = starterBar(pos);
      const short = at.filter((p) => (p.injury?.weeks ?? 0) < 1).length < MINIMUM_SHAPE[pos];
      return panel(`${POSITION_LABEL[pos]}${short ? ' — SHORT' : ''}`,
        h('div', { class: 'tiny', text: `League average starter: ${bar}` }),
        ...at.map((p, i) => playerRow(p, {
          note: i === 0 ? 'Starter' : undefined,
          onClick: () => this.openPlayer(p),
        })));
    });
    this.body.replaceChildren(...groups);
  }

  private needsPanel(): HTMLElement {
    const fr = this.fr;
    const needs = needsOf(fr.roster);
    return panel('Where you are thin',
      h('div', {
        class: 'tiny',
        text: 'Measured against what an average starter at the position actually '
          + 'reads in this league, and against how many bodies you carry.',
      }),
      ...needs.map(({ pos, need }) => {
        const at = depthAt(fr.roster, pos);
        const level = need > 0.75 ? 'Urgent' : need > 0.45 ? 'Needed'
          : need > 0.2 ? 'Could improve' : 'Fine';
        return h('div', { class: 'kv' },
          h('span', { class: 'kv__k', text: `${POSITION_LABEL[pos]}` }),
          h('span', {
            class: `kv__v${need > 0.75 ? ' bad' : need < 0.2 ? ' good' : ''}`,
            text: `${level} — ${at.length} carried, best ${at[0]?.overall ?? '—'} vs ${starterBar(pos)}`,
          }));
      }));
  }

  private injuryPanel(): HTMLElement {
    const hurt = injuredList(this.fr);
    if (!hurt.length) {
      return panel('The treatment room', h('div', { class: 'small', text: 'Nobody is hurt.' }));
    }
    return panel('The treatment room',
      ...hurt.map((p) => playerRow(p, { onClick: () => this.openPlayer(p) })),
      h('div', {
        class: 'tiny',
        text: 'A man who cannot play does not play. If a position falls below what '
          + 'the rules need, somebody goes out there hurt — and plays hurt.',
      }));
  }

  private moneyPanel(): HTMLElement {
    const fr = this.fr;
    const byPay = [...fr.roster].sort((a, b) => b.salary - a.salary);
    return panel('The books',
      kv('Committed', `${money(capUsed(fr.roster))} of ${SALARY_CAP}M`),
      kv('Expiring', `${fr.roster.filter((p) => p.contractYears <= 1).length} players`),
      ...byPay.map((p) => playerRow(p, {
        note: `${money(p.salary)} · ${p.contractYears}y · market ${money(marketValue(p))}`,
        onClick: () => this.openPlayer(p),
      })));
  }

  /* ------------------------------------------------------------- one player */

  private openPlayer(p: Player): void {
    this.app.push((a) => new PlayerScreen(a, this.fr, p, () => {
      this.onChange();
      this.paint();
    }));
  }
}

/* ---------------------------------------------------------------------------
 * ONE PLAYER
 * ---------------------------------------------------------------------------
 * The attributes his position is actually judged on, the facts about him, and
 * the one decision a coach can make about him from here. Nothing on this page
 * is a number that nothing reads.
 * ------------------------------------------------------------------------- */

export class PlayerScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, fr: Franchise, p: Player, onChange: () => void) {
    const cuttable = canCut(fr, p);
    const cost = cutCost(p);
    const status = h('div', { class: 'tiny' });

    this.el = screenEl(
      topbar(app, `${p.first} ${p.last}`, `${POSITION_LABEL[p.pos]} · #${p.number} · overall ${p.overall}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel('What he does', attrGrid(p)),
        panel('The man', playerFacts(p)),
        statLinePanel(fr, p),
        panel('Release him',
          h('div', {
            class: 'tiny',
            text: cuttable
              ? `Cutting him leaves ${money(cost)} on the books this season. `
                + 'He goes onto the market, where somebody else may well take him.'
              : `You cannot go below ${MINIMUM_SHAPE[p.pos]} at ${p.pos} and field a team.`,
          }),
          status,
          h('button', {
            class: 'btn btn--danger',
            text: `Release — ${money(cost)} dead money`,
            disabled: !cuttable,
            on: {
              click: () => {
                if (!canCut(fr, p)) return;
                release(fr, p.id);
                push(fr, 'signing', `${p.pos} ${p.first} ${p.last} released.`);
                status.textContent = 'Released.';
                onChange();
                app.pop();
              },
            },
          })),
      )),
    );
  }
}

/** His numbers, this year and altogether, when he has any. */
function statLinePanel(fr: Franchise, p: Player): HTMLElement | null {
  const season = fr.seasonStats[p.id];
  const career = fr.careerStats[p.id];
  if (!career) return null;
  const line = (l: typeof career): string => {
    const bits: string[] = [];
    if (l.passAttempts) {
      bits.push(`${l.completions}/${l.passAttempts} for ${l.passYards}, `
        + `${l.passTD} TD, ${l.interceptions} int`);
    }
    if (l.carries) bits.push(`${l.carries} carries, ${l.rushYards} yds, ${l.rushTD} TD`);
    if (l.catches) bits.push(`${l.catches} catches, ${l.recYards} yds, ${l.recTD} TD`);
    if (l.tackles) bits.push(`${l.tackles} tackles`);
    if (l.sacks) bits.push(`${l.sacks} sacks`);
    if (l.picks) bits.push(`${l.picks} interceptions`);
    if (l.fgAttempts) bits.push(`${l.fgMade}/${l.fgAttempts} field goals`);
    if (l.punts) bits.push(`${l.punts} punts, ${Math.round(l.puntYards / l.punts)} average`);
    return bits.length ? bits.join(' · ') : 'Nothing yet.';
  };
  return panel('His numbers',
    season ? kv('This season', line(season)) : null,
    kv('For this club', line(career)),
    kv('Snaps', `${career.snaps} played`));
}

export const positionOrder: Position[] = POSITIONS;
