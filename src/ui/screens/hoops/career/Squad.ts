import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush, segmented } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { POSITIONS, starters, type HoopsPlayer } from '../../../../sports/basketball/data';
import { ATTR_LABEL, type AttrKey } from '../../../../sports/basketball/data';
import { averages, needsFor } from '../../../../sports/basketball/career/season';
import { needSummary } from '../../../../sports/basketball/career/needs';
import {
  TRAIN_COST, trainBlockedReason, trainPlayer,
} from '../../../../sports/basketball/career/practice';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { classOf, kvRow, pill, rosterRow } from './bits';

/* ---------------------------------------------------------------------------
 * THE SQUAD
 * ---------------------------------------------------------------------------
 * Who you have, what you are short of, and what happened to each of them last
 * offseason. Three views of one roster rather than three screens, because they
 * are three questions a coach asks about the same fourteen men.
 *
 * THE NEEDS VIEW SHOWS NEED AND PLACES SEPARATELY, which is the one thing a
 * roster screen must never blur: "we need a point guard" and "we have a seat
 * free" are different facts, and a coach who cannot tell them apart cannot
 * recruit.
 * ------------------------------------------------------------------------- */

type View = 'squad' | 'needs' | 'growth';

export class SquadScreen implements Screen {
  el: HTMLElement;
  private view: View = 'squad';

  constructor(private app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'The squad', `${career.roster.length} of ${LEVELS[career.level].rosterSize}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        segmented<View>([
          { value: 'squad', label: 'Squad' },
          { value: 'needs', label: 'Needs' },
          { value: 'growth', label: 'Development' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private body!: HTMLElement;

  private paint(): void {
    this.body.replaceChildren(
      this.view === 'squad' ? this.squad()
        : this.view === 'needs' ? this.needs() : this.growth(),
    );
  }

  /* -------------------------------------------------------------- the squad */

  private squad(): HTMLElement {
    const c = this.career;
    const info = LEVELS[c.level];
    const five = new Set(starters(c.roster).map((p) => p.id));
    const order = [...c.roster].sort((a, b) =>
      POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.overall - a.overall);

    return h('div', { class: 'stack' },
      panelFlush('The five that start and the rest',
        ...order.map((p) => {
          const line = averages(c.season[p.id]);
          const detail = line.games
            ? `${classOf(p, info.ageSystem)} · ${line.ppg.toFixed(1)}p ${line.rpg.toFixed(1)}r `
              + `${line.apg.toFixed(1)}a · ${line.mpg.toFixed(0)} min`
            : `${classOf(p, info.ageSystem)} · ceiling ${p.potential}`
              + `${p.potential > p.overall ? ` (+${p.potential - p.overall})` : ' — there'}`;
          return rosterRow(p, {
            detail,
            starter: five.has(p.id),
            ageSystem: info.ageSystem,
            onClick: () => this.app.push((a) => new PlayerScreen(a, c, p)),
          });
        })),
      h('div', { class: 'tiny',
        text: 'The five who start are the five best for the system you are running. '
          + 'Change the system and the five can change with it.' }),
    );
  }

  /* -------------------------------------------------------------- the needs */

  private needs(): HTMLElement {
    const c = this.career;
    const n = needsFor(c);
    return h('div', { class: 'stack' },
      panel(`${n.openSpots} place${n.openSpots === 1 ? '' : 's'} on a ${n.cap}-man roster`,
        h('div', { class: 'tiny',
          text: 'A NEED and a PLACE are not the same thing. The need is what the team '
            + 'is short of on the floor; the place is whether there is a seat free at '
            + 'all. You can recruit a player you do not need — you just have to have '
            + 'somewhere to put him.' })),
      panelFlush('By position',
        ...n.list.map((pos) => h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: pos.pos }),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: needSummary(pos) }),
            h('div', { class: 'roster-row__note tiny',
              text: `${pos.have} here · ${pos.leaving} leaving · ${pos.incoming} arriving`
                + ` · ${pos.open} spot${pos.open === 1 ? '' : 's'} available`
                + (pos.avgOverall ? ` · best ${pos.starterLine}` : '') })),
          pill(pos.needLabel,
            pos.need >= 3 ? 'bad' : pos.need === 2 ? 'warn' : 'good'))),
      ),
    );
  }

  /* -------------------------------------------------------- what they became */

  private growth(): HTMLElement {
    const c = this.career;
    if (!c.lastDevelopment.length) {
      return panel('Development',
        h('div', { class: 'small',
          text: 'Nothing yet. Players develop over an offseason, and how much '
            + 'depends most on whether they played.' }));
    }
    const info = LEVELS[c.level];
    return h('div', { class: 'stack' },
      panelFlush('Last offseason',
        ...c.lastDevelopment.map((d) => {
          const p = c.roster.find((x) => x.id === d.id);
          return h('div', { class: 'roster-row' },
            h('span', { class: 'roster-row__pos', text: d.pos }),
            h('div', { class: 'roster-row__body' },
              h('div', { class: 'roster-row__name', text: d.name }),
              h('div', { class: 'roster-row__note tiny',
                text: `${d.label}${p ? ` · ${classOf(p, info.ageSystem)}` : ''}` })),
            h('span', {
              class: `roster-row__delta num ${d.to >= d.from ? 'is-up' : 'is-down'}`,
              text: `${d.to > d.from ? '+' : ''}${d.to - d.from}`,
            }),
            h('span', { class: 'roster-row__ovr num', text: String(d.to) }));
        })),
      h('div', { class: 'tiny',
        text: 'Minutes are the lever you hold. A young player who plays comes back '
          + 'a different player; one who sat comes back about the same one.' }),
    );
  }
}

/* -------------------------------------------------------------- one player */

const ATTR_GROUPS: [string, AttrKey[]][] = [
  ['Scoring', ['shooting', 'three', 'freeThrow', 'finishing']],
  ['With the ball', ['handle', 'passing', 'iq']],
  ['Defence', ['perimeterD', 'interiorD', 'steal', 'block', 'rebounding']],
  ['Athlete', ['speed', 'vertical', 'strength', 'stamina']],
];

/**
 * ONE PLAYER, AND THE ONE THING A COACH CAN DO ABOUT HIM.
 *
 * The attributes are not a read-only table: each one is a button, and pressing it
 * spends coach points to work on it. That is deliberately the ONLY place training
 * lives — a coach thinking about a specific player's specific weakness is already
 * looking at this screen, and a separate training screen would mean picking the
 * same man twice.
 *
 * REFUSALS ARE SHOWN BEFORE THEY HAPPEN. A button that cannot be pressed says why
 * on its own face rather than doing nothing when tapped.
 */
export class PlayerScreen implements Screen {
  el: HTMLElement;
  private body!: HTMLElement;

  constructor(app: App, private career: HoopsCareer, private p: HoopsPlayer) {
    const info = LEVELS[career.level];
    const feet = `${Math.floor(p.heightIn / 12)}'${p.heightIn % 12}"`;
    this.el = screenEl(
      topbar(app, `${p.first} ${p.last}`,
        `${p.pos} · ${classOf(p, info.ageSystem)} · ${feet}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  /** Spend on one attribute, then redraw: the numbers, the room and the budget
   *  all move together and a stale panel would lie about all three. */
  private train(attr: AttrKey): void {
    const r = trainPlayer(this.career, this.p.id, attr);
    if (r.ok) saveHoopsCareer(this.career);
    this.paint(r.ok ? `${ATTR_LABEL[attr]} ${r.from} to ${r.to}.` : r.reason);
  }

  private paint(note?: string): void {
    const { career, p } = this;
    const season = averages(career.season[p.id]);
    const total = averages(career.careerStats[p.id]);
    const room = p.potential - p.overall;

    const parts: (HTMLElement | null)[] = [
      panel(null,
        kvRow(
          ['Overall', String(p.overall)],
          ['Ceiling', String(p.potential)],
          ['Room', room > 0 ? `+${room}` : 'none'],
          ['Work', String(p.work)],
        ),
        h('div', { class: 'tiny',
          text: room >= 8
            ? 'There is a lot more here than he has shown. He needs minutes.'
            : room >= 3
              ? 'Some room left in him yet.'
              : 'He is about what he is going to be.' })),

      season.games ? panel('This season',
        kvRow(
          ['Games', String(season.games)],
          ['Starts', String(career.season[p.id]?.starts ?? 0)],
          ['Points', season.ppg.toFixed(1)],
          ['Rebounds', season.rpg.toFixed(1)],
          ['Assists', season.apg.toFixed(1)],
          ['Minutes', season.mpg.toFixed(0)],
          ['FG%', `${(season.fgPct * 100).toFixed(0)}`],
          ['3P%', `${(season.tpPct * 100).toFixed(0)}`],
          ['FT%', `${(season.ftPct * 100).toFixed(0)}`],
        )) : null,

      total.games > season.games ? panel('In this programme',
        kvRow(
          ['Games', String(total.games)],
          ['Starts', String(career.careerStats[p.id]?.starts ?? 0)],
          ['Points', total.ppg.toFixed(1)],
          ['Rebounds', total.rpg.toFixed(1)],
          ['Assists', total.apg.toFixed(1)],
        )) : null,

      panel('Work on him',
        h('div', { class: 'small',
          text: `${TRAIN_COST} coach points buys two points of one attribute. `
            + `You have ${career.coach.points}.` }),
        note ? h('div', { class: 'tiny', text: note }) : null),

      ...ATTR_GROUPS.map(([label, keys]) => panelFlush(label,
        ...keys.map((k) => this.attrRow(k)))),
    ];
    this.body.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
  }

  private attrRow(k: AttrKey): HTMLElement {
    const { career, p } = this;
    const blocked = trainBlockedReason(career, p, k);
    return h('button', {
      class: 'roster-row',
      ...(blocked ? { disabled: true } : {}),
      on: { click: () => { if (!blocked) this.train(k); } },
    },
    h('div', { class: 'roster-row__body' },
      h('div', { class: 'roster-row__name', text: ATTR_LABEL[k] }),
      h('div', { class: 'roster-row__note tiny',
        text: blocked ?? `Train for ${TRAIN_COST} points` })),
    h('span', { class: 'roster-row__ovr num', text: String(p.attrs[k]) }));
  }
}
