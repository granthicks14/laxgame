import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, topbar } from '../../../components';
import { teamOr } from '../../../../sports/football/nfl';
import type { Player } from '../../../../sports/football/data';
import {
  assetLabel, assetValue, clubLine as clubSummary, evaluateTrade, everyOtherClub,
  executeTrade, playerValue, theirPicks, tradeBlock,
} from '../../../../sports/football/franchise/trades';
import { myPicks } from '../../../../sports/football/franchise/draft';
import { canCut } from '../../../../sports/football/franchise/season';
import { push } from '../../../../sports/football/franchise/news';
import type { Franchise, TradeAsset } from '../../../../sports/football/franchise/types';
import { clubLine, money, playerRow, teamName } from './parts';

/* ---------------------------------------------------------------------------
 * THE TRADE DESK
 * ---------------------------------------------------------------------------
 * Call a club, put things on the table, and hear what they think — BEFORE you
 * propose it, not after. The verdict updates as you build, because a trade
 * screen that only tells you no once you have committed is a screen that
 * teaches nothing and wastes everybody's afternoon.
 *
 * They are not idiots. They will not give you a twenty-six-year-old eighty-four
 * for a fourth-round pick, they know the difference between a player they need
 * and a player they do not, and they want to win the deal a little. How much is
 * what difficulty moves — not one rating on either roster changes.
 * ------------------------------------------------------------------------- */

export class TradeScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, fr: Franchise, onChange: () => void) {
    const clubs = everyOtherClub(fr)
      .map((id) => ({ id, block: tradeBlock(fr, id) }))
      .sort((a, b) => teamOr(a.id).divisionId.localeCompare(teamOr(b.id).divisionId));

    this.el = screenEl(
      topbar(app, 'Trade desk', 'Who do you want to call?'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        panel('Your assets',
          h('div', {
            class: 'tiny',
            text: `${fr.roster.length} players and ${myPicks(fr).length + myPicks(fr, fr.year + 1).length} picks.`,
          })),
        panel('The league',
          ...clubs.map(({ id, block }) => clubLine(
            id,
            teamName(id),
            clubSummary(fr, id),
            String(block[0]?.overall ?? ''),
            () => app.push((a) => new TradeDeskScreen(a, fr, id, onChange)),
          ))),
      )),
    );
  }
}

/* ------------------------------------------------------------------ the desk */

export class TradeDeskScreen implements Screen {
  el: HTMLElement;
  private app: App;
  private fr: Franchise;
  private withId: string;
  private onChange: () => void;
  private give: TradeAsset[] = [];
  private get: TradeAsset[] = [];
  private body = h('div', { class: 'wrapper stack' });
  private done = false;

  constructor(app: App, fr: Franchise, withId: string, onChange: () => void) {
    this.app = app;
    this.fr = fr;
    this.withId = withId;
    this.onChange = onChange;
    this.el = screenEl(
      topbar(app, teamOr(withId).name, teamName(withId)),
      h('div', { class: 'scroll' }, this.body),
    );
    this.paint();
  }

  private has(list: TradeAsset[], a: TradeAsset): boolean {
    return list.some((x) => (x.kind === 'player' && a.kind === 'player' && x.id === a.id)
      || (x.kind === 'pick' && a.kind === 'pick'
        && x.year === a.year && x.round === a.round && x.fromId === a.fromId));
  }

  private toggle(list: 'give' | 'get', a: TradeAsset): void {
    const arr = list === 'give' ? this.give : this.get;
    const i = arr.findIndex((x) => (x.kind === 'player' && a.kind === 'player' && x.id === a.id)
      || (x.kind === 'pick' && a.kind === 'pick'
        && x.year === a.year && x.round === a.round && x.fromId === a.fromId));
    if (i >= 0) arr.splice(i, 1);
    else arr.push(a);
    this.paint();
  }

  private paint(): void {
    const fr = this.fr;
    if (this.done) {
      this.body.replaceChildren(panel('Done',
        h('div', { class: 'small', text: 'The trade has gone through.' }),
        h('button', { class: 'btn btn--primary', text: 'Back', on: { click: () => this.app.pop() } })));
      return;
    }

    const verdict = this.give.length && this.get.length
      ? evaluateTrade(fr, { withId: this.withId, give: this.give, get: this.get })
      : null;

    const theirRoster = tradeBlock(fr, this.withId);
    const mine = [...fr.roster].sort((a, b) => playerValue(b) - playerValue(a));

    this.body.replaceChildren(
      panel('On the table',
        h('div', { class: 'eyebrow', text: 'You give' }),
        ...(this.give.length
          ? this.give.map((a) => this.chip('give', a, fr.teamId))
          : [h('div', { class: 'tiny', text: 'Nothing yet.' })]),
        h('div', { class: 'eyebrow', style: 'margin-top:8px', text: 'You get' }),
        ...(this.get.length
          ? this.get.map((a) => this.chip('get', a, this.withId))
          : [h('div', { class: 'tiny', text: 'Nothing yet.' })]),
        h('div', {
          class: `small ${verdict ? (verdict.accepted ? 'good' : 'warn') : ''}`,
          style: 'margin-top:8px',
          text: verdict ? verdict.reason : 'Put something on both sides.',
        }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Propose it',
          disabled: !verdict?.accepted,
          on: { click: () => this.propose() },
        }),
        this.give.length || this.get.length
          ? h('button', {
            class: 'btn btn--muted btn--sm',
            text: 'Clear',
            on: { click: () => { this.give = []; this.get = []; this.paint(); } },
          })
          : null),

      panel(`${teamOr(this.withId).name} — who they would move`,
        ...theirRoster.slice(0, 16).map((p) => this.theirRow(p)),
        h('div', { class: 'eyebrow', style: 'margin-top:8px', text: 'Their picks' }),
        ...theirPicks(fr, this.withId).map((a) => h('button', {
          class: `btn btn--sm${this.has(this.get, a) ? ' btn--primary' : ''}`,
          text: `${assetLabel(fr, a, this.withId)} — worth ${assetValue(fr, a, this.withId)}`,
          on: { click: () => this.toggle('get', a) },
        }))),

      panel('Your side',
        ...mine.slice(0, 20).map((p) => this.myRow(p)),
        h('div', { class: 'eyebrow', style: 'margin-top:8px', text: 'Your picks' }),
        ...[...myPicks(fr), ...myPicks(fr, fr.year + 1)].map((pick) => {
          const a: TradeAsset = {
            kind: 'pick', year: pick.year, round: pick.round, fromId: pick.fromId,
          };
          return h('button', {
            class: `btn btn--sm${this.has(this.give, a) ? ' btn--primary' : ''}`,
            text: `${assetLabel(fr, a, fr.teamId)} — worth ${assetValue(fr, a, fr.teamId)}`,
            on: { click: () => this.toggle('give', a) },
          });
        })),
    );
  }

  private chip(side: 'give' | 'get', a: TradeAsset, owner: string): HTMLElement {
    return h('button', {
      class: 'btn btn--sm btn--primary',
      text: `${assetLabel(this.fr, a, owner)} ✕`,
      on: { click: () => this.toggle(side, a) },
    });
  }

  private theirRow(p: Player): HTMLElement {
    const a: TradeAsset = { kind: 'player', id: p.id };
    const on = this.has(this.get, a);
    return playerRow(p, {
      note: `${p.age} · ${money(p.salary)} · worth ${playerValue(p)}`,
      right: on ? '✓' : String(p.overall),
      onClick: () => this.toggle('get', a),
    });
  }

  private myRow(p: Player): HTMLElement {
    const a: TradeAsset = { kind: 'player', id: p.id };
    const on = this.has(this.give, a);
    const legal = canCut(this.fr, p);
    return playerRow(p, {
      note: legal
        ? `${p.age} · ${money(p.salary)} · worth ${playerValue(p)}`
        : `Cannot move — you would be short at ${p.pos}`,
      right: on ? '✓' : String(p.overall),
      onClick: legal ? () => this.toggle('give', a) : undefined,
    });
  }

  private propose(): void {
    const fr = this.fr;
    const prop = { withId: this.withId, give: this.give, get: this.get };
    if (!executeTrade(fr, prop)) { this.paint(); return; }
    const gave = this.give.map((a) => assetLabel(fr, a, fr.teamId)).join(', ');
    const got = this.get.map((a) => assetLabel(fr, a, this.withId)).join(', ');
    push(fr, 'trade', `Traded ${gave} to the ${teamOr(this.withId).name} for ${got}.`);
    this.done = true;
    this.onChange();
    this.paint();
  }
}
