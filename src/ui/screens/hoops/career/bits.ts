import { h } from '../../../dom';
import type { HoopsPlayer } from '../../../../sports/basketball/data';
import type { HoopsWorldTeam } from '../../../../sports/basketball/world';

/* ---------------------------------------------------------------------------
 * THE SMALL PIECES A BASKETBALL CAREER IS DRAWN OUT OF
 * ---------------------------------------------------------------------------
 * A club badge, a player row, a labelled number. They live here rather than in
 * the shared UI kit because they understand basketball data — a world team, a
 * roster player — and the shared kit deliberately understands no sport at all.
 * ------------------------------------------------------------------------- */

/** The coloured square every club is recognised by. */
export function badge(team: HoopsWorldTeam, size: 'sm' | 'md' = 'md'): HTMLElement {
  return h('span', {
    class: `club-line__badge${size === 'sm' ? ' club-line__badge--sm' : ''}`,
    style: `background:${team.primary};border-color:${team.secondary}`,
    text: team.abbr,
  });
}

/** Club badge, name, a note, and a number on the right. */
export function clubLine(
  team: HoopsWorldTeam, note: string, value?: string | number,
): HTMLElement {
  return h('div', { class: 'club-line' },
    badge(team),
    h('div', { class: 'club-line__body' },
      h('div', { class: 'club-line__name', text: `${team.city} ${team.name}` }),
      h('div', { class: 'club-line__note tiny', text: note })),
    value === undefined ? null
      : h('div', { class: 'club-line__ovr num', text: String(value) }),
  );
}

/** A year label a coach reads without thinking: "Fr", "So", "Jr", "Sr", "6th yr". */
export function classOf(p: HoopsPlayer, ageSystem: 'class' | 'pro'): string {
  if (ageSystem === 'pro') return `${p.age}`;
  return ['Fr', 'So', 'Jr', 'Sr'][p.years - 1] ?? `${p.years}th`;
}

export interface RosterRowOptions {
  /** Right-hand text, usually a statistic. */
  detail?: string;
  /** Marked as one of the five who start. */
  starter?: boolean;
  /** A green or red movement, for a development report. */
  delta?: number;
  ageSystem?: 'class' | 'pro';
  onClick?: () => void;
}

/** One player, as he appears on every list in the mode. */
export function rosterRow(p: HoopsPlayer, opts: RosterRowOptions = {}): HTMLElement {
  const cls = classOf(p, opts.ageSystem ?? 'class');
  const room = p.potential - p.overall;
  const row = h(opts.onClick ? 'button' : 'div', {
    class: `roster-row${opts.starter ? ' roster-row--on' : ''}`,
    ...(opts.onClick ? { on: { click: opts.onClick } } : {}),
  },
  h('span', { class: 'roster-row__pos', text: p.pos }),
  h('div', { class: 'roster-row__body' },
    h('div', { class: 'roster-row__name', text: `${p.first} ${p.last}` }),
    h('div', { class: 'roster-row__note tiny',
      text: opts.detail ?? `${cls} · #${p.number} · ceiling ${p.potential}`
        + `${room > 0 ? ` (+${room})` : ' — there'}` })),
  opts.delta !== undefined && opts.delta !== 0
    ? h('span', {
      class: `roster-row__delta num ${opts.delta > 0 ? 'is-up' : 'is-down'}`,
      text: `${opts.delta > 0 ? '+' : ''}${opts.delta}`,
    })
    : null,
  h('span', { class: 'roster-row__ovr num', text: String(p.overall) }));
  return row;
}

/** A row of small labelled numbers. */
export function kvRow(...pairs: [string, string][]): HTMLElement {
  return h('div', { class: 'kv-row' },
    ...pairs.map(([k, v]) => h('div', { class: 'kv' },
      h('div', { class: 'kv__k tiny', text: k }),
      h('div', { class: 'kv__v num', text: v }))));
}

/** A headline number with a caption, for the top of a hub. */
export function bigStat(value: string, caption: string, tone?: 'good' | 'bad'): HTMLElement {
  return h('div', { class: `bigstat${tone ? ` bigstat--${tone}` : ''}` },
    h('div', { class: 'bigstat__v num', text: value }),
    h('div', { class: 'bigstat__c tiny', text: caption }));
}

/**
 * A coloured pill: a need level, an odds verdict, a scheme fit. The tones map
 * onto the shared kit's existing pill modifiers rather than inventing a second
 * set of colours that would drift away from them.
 */
export function pill(text: string, tone: 'good' | 'warn' | 'bad' | 'flat' = 'flat'): HTMLElement {
  const mod = tone === 'good' ? ' pill--green'
    : tone === 'warn' ? ' pill--accent'
      : tone === 'bad' ? ' pill--red' : '';
  return h('span', { class: `pill${mod}`, text });
}

/** A full-width primary action. */
export function bigButton(
  label: string, sub: string | null, onClick: () => void, kind = 'btn--primary',
): HTMLElement {
  return h('button', { class: `btn btn--wide ${kind}`, on: { click: onClick } },
    h('span', { class: 'btn__label', text: label }),
    sub ? h('span', { class: 'btn__sub', text: sub }) : null);
}

/** A grid of secondary destinations. */
export function tileGrid(
  items: { label: string; note: string; go: () => void; badge?: string }[],
): HTMLElement {
  return h('div', { class: 'tile-grid' },
    ...items.map((it) => h('button', { class: 'tile', on: { click: it.go } },
      h('div', { class: 'tile__label', text: it.label }),
      h('div', { class: 'tile__note tiny', text: it.note }),
      it.badge ? h('span', { class: 'tile__badge', text: it.badge }) : null)));
}
