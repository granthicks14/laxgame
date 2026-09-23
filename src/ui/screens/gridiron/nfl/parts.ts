import { h } from '../../../dom';
import { ATTR_LABEL, PERSONALITY, POSITION_WEIGHTS, type AttrKey, type Player } from '../../../../sports/football/data';
import { badgeColours, teamOr } from '../../../../sports/football/nfl';
import { marketValue, starterBar } from '../../../../sports/football/franchise/club';
import { injuryText } from '../../../../sports/football/franchise/injuries';
import { moodOf } from '../../../../sports/football/franchise/develop';

/* ---------------------------------------------------------------------------
 * THE PIECES EVERY FRANCHISE SCREEN IS BUILT FROM
 * ---------------------------------------------------------------------------
 * A club badge, a player row, a player card. Three things, used on nine
 * screens, so a player reads the same way on the roster as he does in free
 * agency as he does on the trade desk — which is most of what makes a
 * management game learnable.
 *
 * The badge is original: two of the club's colours and its own three letters,
 * drawn by this game. No mark belonging to anybody else appears anywhere.
 * ------------------------------------------------------------------------- */

export function badge(teamId: string, size: 'sm' | 'md' = 'md'): HTMLElement {
  const team = teamOr(teamId);
  const c = badgeColours(team);
  return h('span', {
    class: `club-line__badge${size === 'sm' ? ' club-line__badge--sm' : ''}`,
    style: `background:${c.fill};border-color:${c.edge};color:${c.text}`,
    text: team.abbr,
  });
}

export const teamName = (id: string): string => {
  const t = teamOr(id);
  return `${t.city} ${t.name}`;
};

/** A club, its record and a number, in one tappable line. */
export function clubLine(
  teamId: string, name: string, note: string, value: string, onClick?: () => void,
): HTMLElement {
  const el = h('div', { class: 'club-line' },
    badge(teamId),
    h('div', { class: 'club-line__body' },
      h('div', { class: 'club-line__name', text: name }),
      h('div', { class: 'club-line__note tiny', text: note })),
    h('div', { class: 'club-line__ovr num', text: value }));
  if (onClick) {
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    });
  }
  return el;
}

/* ------------------------------------------------------------------ players */

export const money = (m: number): string => `${m.toFixed(1)}M`;

/**
 * THE ONE-LINE SUMMARY OF A FOOTBALLER: who, what, how good, how much.
 *
 * Two lines inside one row, the way basketball's rows are built — position, then
 * his name with the detail underneath it, then the number. The first version
 * put six things side by side and on a phone the NAME, the one thing anybody is
 * looking for, was the one that got squeezed off the right-hand edge.
 */
export function playerRow(p: Player, opts: {
  note?: string;
  right?: string;
  onClick?: () => void;
  starter?: boolean;
} = {}): HTMLElement {
  const bar = starterBar(p.pos);
  const tone = p.overall >= bar + 4 ? ' good' : p.overall <= bar - 9 ? ' bad' : '';
  const hurt = p.injury && p.injury.weeks >= 1;
  const detail = opts.note
    ?? (hurt ? injuryText(p) : `#${p.number} · ${p.age} · ${money(p.salary)} · ${p.contractYears}y`);
  const clickable = !!opts.onClick;
  return h(clickable ? 'button' : 'div', {
    class: `roster-row${opts.starter ? ' roster-row--on' : ''}`,
    ...(clickable ? { on: { click: () => opts.onClick!() } } : {}),
  },
  h('span', { class: 'roster-row__pos', text: p.pos }),
  h('div', { class: 'roster-row__body' },
    h('div', { class: 'roster-row__name', text: `${p.first} ${p.last}` }),
    h('div', { class: `roster-row__note tiny${hurt ? ' bad' : ''}`, text: detail })),
  h('span', { class: `roster-row__ovr num${tone}`, text: opts.right ?? String(p.overall) }));
}

/** The attributes the position is actually judged on, biggest weight first. */
export function attrGrid(p: Player): HTMLElement {
  const weights = POSITION_WEIGHTS[p.pos];
  const keys = (Object.keys(weights) as AttrKey[])
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  return h('div', { class: 'stack', style: 'gap:5px' },
    ...keys.map((k) => {
      const v = p.attrs[k];
      return h('div', { class: 'meter' },
        h('div', { class: 'meter__label', text: ATTR_LABEL[k] }),
        h('div', { class: 'meter__track' },
          h('div', {
            class: 'meter__fill',
            style: `width:${Math.max(3, Math.min(100, (v - 20) / 0.79))}%`,
          })),
        h('div', { class: 'meter__num num', text: String(v) }));
    }));
}

/** Everything else about him, in the language a coach uses. */
export function playerFacts(p: Player): HTMLElement {
  const bar = starterBar(p.pos);
  const standing = p.overall >= bar + 6 ? 'Star'
    : p.overall >= bar ? 'Starter'
      : p.overall >= bar - 8 ? 'Rotation' : 'Squad';
  const info = PERSONALITY[p.personality];
  const rows: [string, string][] = [
    ['Standing', `${standing} · league average at ${p.pos} is ${bar}`],
    ['Age', `${p.age}, ${p.years} ${p.years === 1 ? 'season' : 'seasons'} in`],
    ['College', p.college],
    ['Contract', `${money(p.salary)} a year, ${p.contractYears} left · market ${money(marketValue(p))}`],
    ['Morale', `${moodOf(p.morale)} (${p.morale})`],
    ['Character', `${info.label} — ${info.blurb}`],
  ];
  if (p.injury && p.injury.weeks >= 1) rows.push(['Injury', injuryText(p)]);
  return h('div', { class: 'stack', style: 'gap:2px' },
    ...rows.map(([k, v]) => h('div', { class: 'kv' },
      h('span', { class: 'kv__k', text: k }),
      h('span', { class: 'kv__v', text: v }))));
}

/** A labelled number, for the strips of them every management screen has. */
export function tile(label: string, value: string, note?: string): HTMLElement {
  return h('div', { class: 'tile' },
    h('div', { class: 'tile__label', text: label }),
    h('div', { class: 'tile__badge num', text: value }),
    note ? h('div', { class: 'tile__note tiny', text: note }) : null);
}

export const tileGrid = (...tiles: HTMLElement[]): HTMLElement =>
  h('div', { class: 'tile-grid' }, ...tiles);

export function kv(label: string, value: string): HTMLElement {
  return h('div', { class: 'kv' },
    h('span', { class: 'kv__k', text: label }),
    h('span', { class: 'kv__v', text: value }));
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
