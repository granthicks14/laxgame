import { h } from '../../dom';
import type { HoopsGame } from '../../../sports/basketball/Game';
import type { HoopsConfig, CourtPlayer } from '../../../sports/basketball/types';
import type { Side } from '../../../sports/basketball/court';
import { heightText } from '../../../sports/basketball/data';

/* ---------------------------------------------------------------------------
 * THE BOX SCORE
 * ---------------------------------------------------------------------------
 * What a basketball game leaves behind. Shared by the pause menu and the
 * post-game screen so the two can never disagree about what happened, and
 * derived entirely from the game — there is no second tally to drift.
 * ------------------------------------------------------------------------- */

const pct = (made: number, att: number): string =>
  (att > 0 ? `${Math.round((made / att) * 100)}%` : '—');

function playerRow(p: CourtPlayer): HTMLElement {
  const s = p.stat;
  return h('tr', { class: p.fouledOut ? 'is-out' : '' },
    h('td', { class: 'box__name' },
      h('span', { class: 'box__num num', text: String(p.data.number) }),
      `${p.data.first[0]}. ${p.data.last}`,
      h('span', { class: 'box__pos', text: p.pos })),
    h('td', { class: 'num', text: String(s.points) }),
    h('td', { class: 'num', text: `${s.fgm}-${s.fga}` }),
    h('td', { class: 'num', text: `${s.tpm}-${s.tpa}` }),
    h('td', { class: 'num', text: `${s.ftm}-${s.fta}` }),
    h('td', { class: 'num', text: String(s.offReb + s.defReb) }),
    h('td', { class: 'num', text: String(s.assists) }),
    h('td', { class: 'num', text: String(s.steals) }),
    h('td', { class: 'num', text: String(s.blocks) }),
    h('td', { class: 'num', text: String(s.turnovers) }),
    h('td', { class: `num${p.fouls >= 5 ? ' bad' : ''}`, text: String(p.fouls) }),
  );
}

function sideTable(game: HoopsGame, side: Side, config: HoopsConfig): HTMLElement {
  const team = side === 'home' ? config.home.team : config.away.team;
  const b = game.box[side];
  // Everybody who played, not the five still on the floor: a man who fouled out
  // scored his points too, and without him the rows do not add up to the total.
  const lineup = [...game.played(side)].sort((a, c) => c.stat.points - a.stat.points);
  return h('div', { class: 'box' },
    h('div', { class: 'box__head' },
      h('span', {
        class: 'box__badge',
        style: `background:${team.primary};border-color:${team.secondary}`,
        text: team.abbr,
      }),
      h('span', { class: 'box__team', text: `${team.city} ${team.name}` }),
      h('span', { class: 'box__total num', text: String(game.score[side]) })),
    h('div', { class: 'box__scroll' },
      h('table', { class: 'box__table' },
        h('thead', null,
          h('tr', null,
            h('th', { text: 'Player' }),
            h('th', { text: 'PTS' }),
            h('th', { text: 'FG' }),
            h('th', { text: '3PT' }),
            h('th', { text: 'FT' }),
            h('th', { text: 'REB' }),
            h('th', { text: 'AST' }),
            h('th', { text: 'STL' }),
            h('th', { text: 'BLK' }),
            h('th', { text: 'TO' }),
            h('th', { text: 'PF' }))),
        h('tbody', null, ...lineup.map(playerRow)),
        h('tfoot', null,
          h('tr', null,
            h('td', { text: 'Team' }),
            h('td', { class: 'num', text: String(b.points) }),
            h('td', { class: 'num', text: `${b.fgm}-${b.fga}` }),
            h('td', { class: 'num', text: `${b.tpm}-${b.tpa}` }),
            h('td', { class: 'num', text: `${b.ftm}-${b.fta}` }),
            h('td', { class: 'num', text: String(b.offReb + b.defReb) }),
            h('td', { class: 'num', text: String(b.assists) }),
            h('td', { class: 'num', text: String(b.steals) }),
            h('td', { class: 'num', text: String(b.blocks) }),
            h('td', { class: 'num', text: String(b.turnovers) }),
            h('td', { class: 'num', text: String(b.fouls) })))),
    ),
    h('div', { class: 'box__rates tiny' },
      `${pct(b.fgm, b.fga)} FG · ${pct(b.tpm, b.tpa)} 3PT · ${pct(b.ftm, b.fta)} FT`
      + ` · ${b.offReb} offensive rebounds · ${b.paintPoints} in the paint`
      + ` · ${b.fastBreak} on the break`),
  );
}

export function boxScoreTable(game: HoopsGame, config: HoopsConfig): HTMLElement {
  return h('div', { class: 'stack' },
    sideTable(game, 'away', config),
    sideTable(game, 'home', config));
}

/** The line-by-line quarter scoring, which is how a game is read afterwards. */
export function quarterLine(game: HoopsGame, config: HoopsConfig): HTMLElement {
  const quarters = Math.max(
    game.box.home.byQuarter.length, game.box.away.byQuarter.length, 4,
  );
  const row = (side: Side) => {
    const team = side === 'home' ? config.home.team : config.away.team;
    const by = game.box[side].byQuarter;
    return h('tr', null,
      h('td', { text: team.abbr }),
      ...Array.from({ length: quarters }, (_, i) =>
        h('td', { class: 'num', text: by[i] === undefined ? '—' : String(by[i]) })),
      h('td', { class: 'num box__total', text: String(game.score[side]) }));
  };
  return h('table', { class: 'qline' },
    h('thead', null,
      h('tr', null,
        h('th', { text: '' }),
        ...Array.from({ length: quarters }, (_, i) =>
          h('th', { text: i < 4 ? `Q${i + 1}` : `OT${i - 3}` })),
        h('th', { text: 'T' }))),
    h('tbody', null, row('away'), row('home')));
}

/** The single best line in the game, for the post-game headline. */
export function starOfTheGame(game: HoopsGame): CourtPlayer | null {
  let best: CourtPlayer | null = null;
  let bestScore = -1;
  for (const p of [...game.played('home'), ...game.played('away')]) {
    const s = p.stat;
    // A basketball "game score": points carry it, with real credit for the rest.
    const value = s.points + (s.offReb + s.defReb) * 0.9 + s.assists * 1.4
      + s.steals * 1.6 + s.blocks * 1.6 - s.turnovers * 1.1;
    if (value > bestScore) { bestScore = value; best = p; }
  }
  return best;
}

export const playerHeight = heightText;
