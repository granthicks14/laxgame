import { h } from '../../dom';
import type { FootballGame } from '../../../sports/football/Game';
import type { StatLine } from '../../../sports/football/types';
import type { Side } from '../../../sports/football/field';

/* ---------------------------------------------------------------------------
 * THE BOX SCORE
 * ---------------------------------------------------------------------------
 * A football box score is read in three separate pieces — passing, rushing,
 * receiving — because a football player does exactly one of those things and a
 * single table with twenty columns is unreadable on a phone. Each section only
 * lists the men who actually did the thing, which on a normal afternoon is one
 * quarterback, three backs and four receivers rather than a roster of thirty.
 * ------------------------------------------------------------------------- */

interface Row {
  name: string;
  line: StatLine;
}

function rowsFor(game: FootballGame, side: Side): Row[] {
  const roster = side === 'home' ? game.cfg.home.roster : game.cfg.away.roster;
  const out: Row[] = [];
  for (const p of roster) {
    const line = game.stats.get(p.id);
    if (!line) continue;
    out.push({ name: `${p.first[0]}. ${p.last}`, line });
  }
  return out;
}

function table(title: string, head: string[], body: (string | number)[][]): HTMLElement | null {
  if (!body.length) return null;
  /* `.box` is the FRAME and `.box__table` is the table, which is how the other
   * two sports' box scores are built. The first version put the frame's class
   * on the table itself — so it shrank to its content, the headers were
   * unstyled and the columns drifted out from under them on a phone. */
  return h('div', { class: 'box-sec' },
    h('div', { class: 'box-sec__title', text: title }),
    h('div', { class: 'box' },
      h('table', { class: 'box__table' },
        h('thead', {}, h('tr', {}, ...head.map((c) => h('th', { text: c })))),
        h('tbody', {}, ...body.map((r) => h('tr', {}, ...r.map((c, i) =>
          h('td', { class: i === 0 ? 'box__who' : '', text: String(c) }))))))));
}

function sideBlock(game: FootballGame, side: Side, label: string): HTMLElement {
  const rows = rowsFor(game, side);
  const box = game.box[side];

  const passers = rows.filter((r) => r.line.passAttempts > 0)
    .map((r) => [r.name, `${r.line.completions}/${r.line.passAttempts}`,
      r.line.passYards, r.line.passTD, r.line.interceptions, r.line.sacked]);
  const rushers = rows.filter((r) => r.line.carries > 0)
    .sort((a, b) => b.line.rushYards - a.line.rushYards)
    .map((r) => [r.name, r.line.carries, r.line.rushYards,
      (r.line.rushYards / r.line.carries).toFixed(1), r.line.rushTD]);
  const catchers = rows.filter((r) => r.line.targets > 0)
    .sort((a, b) => b.line.recYards - a.line.recYards)
    .map((r) => [r.name, `${r.line.catches}/${r.line.targets}`, r.line.recYards, r.line.recTD]);
  const defenders = rows.filter((r) => r.line.tackles + r.line.sacks + r.line.picks > 0)
    .sort((a, b) => b.line.tackles - a.line.tackles)
    .map((r) => [r.name, r.line.tackles, r.line.sacks, r.line.picks, r.line.passesDefended]);
  const kickers = rows.filter((r) => r.line.fgAttempts + r.line.punts > 0)
    .map((r) => [r.name, `${r.line.fgMade}/${r.line.fgAttempts}`, r.line.punts,
      r.line.punts ? Math.round(r.line.puntYards / r.line.punts) : 0]);

  const totals = h('div', { class: 'box-totals' },
    h('span', { text: `${box.firstDowns} first downs` }),
    h('span', { text: `${box.totalYards} yards` }),
    h('span', { text: `${box.thirdDownConv}/${box.thirdDownAtt} on third` }),
    h('span', { text: `${box.turnovers} turnover${box.turnovers === 1 ? '' : 's'}` }),
    h('span', { text: `${box.sacksAllowed} sack${box.sacksAllowed === 1 ? '' : 's'} allowed` }));

  const sections = [
    table('Passing', ['', 'C/A', 'Yds', 'TD', 'Int', 'Sk'], passers),
    table('Rushing', ['', 'Car', 'Yds', 'Avg', 'TD'], rushers),
    table('Receiving', ['', 'Rec', 'Yds', 'TD'], catchers),
    table('Defence', ['', 'Tkl', 'Sk', 'Int', 'PD'], defenders),
    table('Kicking', ['', 'FG', 'Punts', 'Avg'], kickers),
  ].filter((s): s is HTMLElement => s !== null);

  return h('div', { class: 'box-side' },
    h('div', { class: 'box-side__title', text: label }),
    totals,
    ...sections);
}

export function footballBoxScore(game: FootballGame): HTMLElement {
  const line = (side: Side): HTMLElement => {
    const b = game.box[side];
    const team = side === 'home' ? game.cfg.home.team : game.cfg.away.team;
    return h('tr', {},
      h('td', { class: 'box__who', text: team.abbr }),
      ...b.byQuarter.map((q) => h('td', { text: String(q) })),
      h('td', { class: 'strong', text: String(game.score[side]) }));
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'box' },
      h('table', { class: 'box__table' },
        h('thead', {}, h('tr', {},
          h('th', { text: '' }),
          h('th', { text: '1' }), h('th', { text: '2' }),
          h('th', { text: '3' }), h('th', { text: '4' }),
          h('th', { text: 'T' }))),
        h('tbody', {}, line('away'), line('home')))),
    sideBlock(game, 'away', game.cfg.away.team.name),
    sideBlock(game, 'home', game.cfg.home.team.name));
}
