import { h } from './dom';
import type { App } from './App';
import type { TeamData, TeamRatings } from '../data/teams';
import { DIFFICULTY_WORDS, coachingDifficulty } from '../data/teams';

export function topbar(app: App, title: string, sub?: string, onBack?: () => void): HTMLElement {
  const back = h('button', {
    class: 'btn btn--icon btn--ghost',
    ariaLabel: 'Back',
    text: '←',
    on: { click: () => (onBack ? onBack() : app.pop()) },
  });
  return h('div', { class: 'topbar' },
    app.depth > 1 || onBack ? back : null,
    h('div', { class: 'topbar__title', text: title }),
    sub ? h('div', { class: 'topbar__sub', text: sub }) : null,
  );
}

export function screenEl(...children: (Node | null | false)[]): HTMLElement {
  return h('div', { class: 'screen' }, ...children);
}

export function scrollArea(...children: (Node | null | false)[]): HTMLElement {
  return h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, ...children));
}

export function teamBadge(team: TeamData, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const cls = size === 'sm' ? 'badge badge--sm' : size === 'lg' ? 'badge badge--lg' : 'badge';
  return h('div', {
    class: cls,
    style: `background:${team.primary};border-color:${team.secondary}`,
    text: team.abbr,
  });
}

export function ratingBar(label: string, value: number, color = 'var(--accent)'): HTMLElement {
  return h('div', { class: 'rate' },
    h('div', { class: 'rate__label', text: label }),
    h('div', { class: 'rate__track' },
      h('div', { class: 'rate__fill', style: `width:${Math.max(2, Math.min(100, value))}%;background:${color}` })),
    h('div', { class: 'rate__val num', text: String(Math.round(value)) }),
  );
}

export function ratingGrid(r: TeamRatings): HTMLElement {
  return h('div', { class: 'stack', style: 'gap:6px' },
    ratingBar('Overall', r.overall),
    ratingBar('Offense', r.offense, '#ff9d4d'),
    ratingBar('Defense', r.defense, '#4a9be8'),
    ratingBar('Goalie', r.goalie, '#3fbd77'),
    ratingBar('Faceoff', r.faceoff, '#c58cff'),
    ratingBar('Speed', r.speed, '#ffd84d'),
  );
}

export function panel(title: string | null, ...body: (Node | null | false)[]): HTMLElement {
  return h('div', { class: 'panel' },
    title ? h('div', { class: 'panel__head', text: title }) : null,
    h('div', { class: 'panel__body stack' }, ...body),
  );
}

export function panelFlush(title: string | null, ...body: (Node | null | false)[]): HTMLElement {
  return h('div', { class: 'panel' },
    title ? h('div', { class: 'panel__head', text: title }) : null,
    h('div', { class: 'panel__body panel__body--flush' }, ...body),
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function segmented<T extends string>(
  options: SegOption<T>[], current: T, onChange: (v: T) => void, block = false,
): HTMLElement {
  const el = h('div', { class: block ? 'seg seg--block' : 'seg' });
  if (block) {
    // Block segments wrap as flex rows sized from the longest label, so short
    // tabs ("C East") stay on one line while wordy options ("Attack the Cage")
    // drop to two per row on a phone instead of overflowing. Items on the final
    // row grow to fill it, so a wrapped control never leaves a hollow cell.
    const longest = options.reduce((n, o) => Math.max(n, o.label.length), 0);
    el.style.setProperty('--seg-min', `${Math.min(170, Math.max(64, longest * 8 + 18))}px`);
  }
  for (const opt of options) {
    const b = h('button', {
      class: `seg__opt${opt.value === current ? ' is-on' : ''}`,
      text: opt.label,
      on: {
        click: () => {
          if (opt.value === current) return;
          for (const child of Array.from(el.children)) child.classList.remove('is-on');
          b.classList.add('is-on');
          onChange(opt.value);
        },
      },
    });
    el.appendChild(b);
  }
  return el;
}

export function fieldRow(label: string, hint: string | null, control: Node): HTMLElement {
  return h('div', { class: 'field-row' },
    h('div', null,
      h('div', { class: 'field-row__label', text: label }),
      hint ? h('div', { class: 'field-row__hint', text: hint }) : null),
    control as HTMLElement,
  );
}

export function difficultyPill(team: TeamData): HTMLElement {
  const d = coachingDifficulty(team);
  const cls = d <= 2 ? 'pill pill--green' : d >= 4 ? 'pill pill--red' : 'pill';
  return h('span', { class: cls, text: `${DIFFICULTY_WORDS[d]} job` });
}

export function statBar(
  label: string, left: number, right: number, leftColor: string, rightColor: string,
  format: (n: number) => string = (n) => String(n),
): HTMLElement {
  const total = Math.max(1, left + right);
  return h('div', { class: 'statbar' },
    h('div', { class: 'statbar__label', text: label }),
    h('div', { class: 'statbar__v', text: format(left) }),
    h('div', { class: 'statbar__track' },
      h('div', { class: 'statbar__l', style: `width:${(left / total) * 100}%;background:${leftColor}` }),
      h('div', { class: 'statbar__r', style: `width:${(right / total) * 100}%;background:${rightColor}` })),
    h('div', { class: 'statbar__v', style: 'text-align:right', text: format(right) }),
  );
}

export function emptyState(text: string): HTMLElement {
  return h('div', { class: 'empty', text });
}

export interface EmptyAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

/** A blank screen is a dead end. Every empty state says what is missing, why,
 *  and gives the player the button that fixes it. */
export function emptyPanel(
  title: string, body: string, actions: EmptyAction[] = [],
): HTMLElement {
  return h('div', { class: 'panel empty-panel' },
    h('div', { class: 'panel__body stack center' },
      h('div', { class: 'empty-panel__mark' }),
      h('div', { class: 'display', style: 'font-size:20px', text: title }),
      h('div', { class: 'small', style: 'max-width:44ch;margin:0 auto', text: body }),
      actions.length
        ? h('div', { class: 'stack', style: 'margin-top:6px;width:min(300px,100%);align-self:center' },
          ...actions.map((a) => h('button', {
            class: `btn btn--block${a.primary ? ' btn--primary' : ''}`,
            text: a.label,
            on: { click: a.onClick },
          })))
        : null),
  );
}
