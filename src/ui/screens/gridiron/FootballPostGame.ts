import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, panel } from '../../components';
import type { FootballGame } from '../../../sports/football/Game';
import { footballBoxScore } from './boxScore';
import type { Side } from '../../../sports/football/field';
import type { Team } from '../../../sports/football/data';

/* ---------------------------------------------------------------------------
 * AFTER THE GUN
 * ---------------------------------------------------------------------------
 * The score, who won it, the man who decided it, and the full box score. What
 * happened, in the order somebody actually wants it.
 * ------------------------------------------------------------------------- */

export interface FootballPostActions {
  onAgain?: () => void;
  onDone: () => void;
  againLabel?: string;
  doneLabel?: string;
}

function side(team: Team, score: number, won: boolean): HTMLElement {
  return h('div', { class: `fb-final__side${won ? ' is-won' : ''}` },
    h('div', {
      class: 'fb-final__badge',
      style: `background:${team.primary};border-color:${team.secondary}`,
      text: team.abbr,
    }),
    h('div', { class: 'fb-final__pts num', text: String(score) }),
    h('div', { class: 'fb-final__name', text: team.name }));
}

/**
 * THE MAN OF THE MATCH, read off the box score rather than written for it.
 *
 * Football has no single number to rank a performance by — a quarterback's day
 * and a linebacker's are not measured in the same units — so each kind of
 * contribution is converted into the yards it was roughly worth, which is the
 * only currency the whole sport shares.
 */
function starOf(game: FootballGame): { name: string; line: string } | null {
  let best: { name: string; line: string; worth: number } | null = null;
  for (const which of ['home', 'away'] as const) {
    const roster = which === 'home' ? game.cfg.home.roster : game.cfg.away.roster;
    for (const p of roster) {
      const s = game.stats.get(p.id);
      if (!s) continue;
      const worth = s.passYards * 0.5 + s.passTD * 40 - s.interceptions * 45
        + s.rushYards + s.rushTD * 40
        + s.recYards + s.recTD * 40
        + s.tackles * 6 + s.sacks * 30 + s.picks * 55 + s.passesDefended * 10
        + s.fgMade * 22;
      if (worth < 40) continue;
      if (best && worth <= best.worth) continue;
      const bits: string[] = [];
      if (s.passAttempts) {
        bits.push(`${s.completions}/${s.passAttempts}, ${s.passYards} yards`
          + `${s.passTD ? `, ${s.passTD} TD` : ''}${s.interceptions ? `, ${s.interceptions} int` : ''}`);
      }
      if (s.carries) bits.push(`${s.carries} for ${s.rushYards}${s.rushTD ? `, ${s.rushTD} TD` : ''}`);
      if (s.catches) bits.push(`${s.catches} catches, ${s.recYards}${s.recTD ? `, ${s.recTD} TD` : ''}`);
      if (s.tackles + s.sacks + s.picks > 3) {
        bits.push(`${s.tackles} tackles${s.sacks ? `, ${s.sacks} sacks` : ''}`
          + `${s.picks ? `, ${s.picks} int` : ''}`);
      }
      if (s.fgAttempts) bits.push(`${s.fgMade}/${s.fgAttempts} on field goals`);
      best = { name: `${p.first} ${p.last}`, line: bits.join(' · '), worth };
    }
  }
  return best ? { name: best.name, line: best.line } : null;
}

export class FootballPostGameScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, game: FootballGame, actions?: FootballPostActions) {
    const cfg = game.cfg;
    const homeWon = game.score.home > game.score.away;
    const drawn = game.score.home === game.score.away;
    const winner = homeWon ? cfg.home.team : cfg.away.team;
    const star = starOf(game);
    const done = actions?.onDone ?? (() => app.pop());

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('div', { class: 'topbar__title display', text: 'Final' }),
        h('div', { class: 'topbar__sub', text: cfg.label ?? 'Game' })),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'fb-final' },
            side(cfg.away.team, game.score.away, !homeWon && !drawn),
            h('div', { class: 'fb-final__mid' },
              h('div', { class: 'fb-final__dash', text: '—' }),
              game.overtime > 0
                ? h('div', { class: 'fb-final__ot', text: game.overtime > 1 ? `${game.overtime}OT` : 'OT' })
                : null),
            side(cfg.home.team, game.score.home, homeWon)),

          h('div', {
            class: 'center display',
            style: 'letter-spacing:.14em;text-transform:uppercase;font-size:14px;color:var(--accent)',
            text: drawn ? 'Tied' : `${winner.city} ${winner.name} win`,
          }),

          star
            ? panel('Player of the game',
              h('div', { class: 'display', style: 'font-size:15px', text: star.name }),
              h('div', { class: 'small', text: star.line }))
            : null,

          panel('Box score', footballBoxScore(game)),

          h('div', { class: 'stack' },
            actions?.onAgain
              ? h('button', {
                class: 'btn btn--primary',
                text: actions.againLabel ?? 'Play again',
                on: { click: () => actions.onAgain?.() },
              })
              : null,
            h('button', {
              class: actions?.onAgain ? 'btn' : 'btn btn--primary',
              text: actions?.doneLabel ?? 'Back',
              on: { click: done },
            })),
        )),
    );
    void (null as unknown as Side);
  }
}
