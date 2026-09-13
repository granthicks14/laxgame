import { h } from '../../ui/dom';
import {
  DIFFICULTY_WORDS, coachingDifficulty,
  type GameTeam, type TeamData, type TeamRatings,
} from '../../data/teams';

/* ---------------------------------------------------------------------------
 * LACROSSE UI PIECES
 * ---------------------------------------------------------------------------
 * The parts of the interface that need to understand a lacrosse team: its
 * colours and abbreviation, the six ratings a lacrosse programme is measured on,
 * and how hard a job it is to coach. They read the league table, so they belong
 * in lacrosse's bundle rather than the hub's.
 * ------------------------------------------------------------------------- */

export function teamBadge(team: GameTeam, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
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

export function difficultyPill(team: TeamData): HTMLElement {
  const d = coachingDifficulty(team);
  const cls = d <= 2 ? 'pill pill--green' : d >= 4 ? 'pill pill--red' : 'pill';
  return h('span', { class: cls, text: `${DIFFICULTY_WORDS[d]} job` });
}
