import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, panel, panelFlush, statBar, teamBadge } from '../components';
import type { Match } from '../../match/Match';
import type { Side } from '../../data/constants';
import { shortName, type PlayerData, type PlayerStats } from '../../data/players';

export interface PostGameAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface PostGameOptions {
  match: Match;
  title?: string;
  actions: PostGameAction[];
}

interface Line { side: Side; data: PlayerData; stat: PlayerStats }

export class PostGameScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, opts: PostGameOptions) {
    const m = opts.match;
    const home = m.setups.home.team;
    const away = m.setups.away.team;
    const box = m.boxScore();
    const winner = m.winner();
    const potg = playerOfTheGame(box, winner);
    void app;

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('div', { class: 'topbar__title', text: opts.title ?? 'Final' }),
        h('div', { class: 'topbar__sub', text: m.overtimePeriod > 0 ? 'OVERTIME' : 'Full time' })),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },

          h('div', { class: 'final' },
            h('div', { class: 'final__team' },
              teamBadge(away),
              h('div', { class: 'final__name', text: away.short }),
              winner === 'away' ? h('div', { class: 'win-tag', text: 'WINNER' }) : null),
            h('div', { class: 'row', style: 'gap:14px' },
              h('div', { class: 'final__score num', text: String(m.score.away) }),
              h('div', { class: 'display', style: 'color:var(--muted)', text: '–' }),
              h('div', { class: 'final__score num', text: String(m.score.home) })),
            h('div', { class: 'final__team' },
              teamBadge(home),
              h('div', { class: 'final__name', text: home.short }),
              winner === 'home' ? h('div', { class: 'win-tag', text: 'WINNER' }) : null),
          ),

          potg ? panel('Player of the game',
            h('div', { class: 'row', style: 'gap:12px' },
              teamBadge(potg.side === 'home' ? home : away),
              h('div', { class: 'stack', style: 'gap:2px' },
                h('div', { class: 'display', style: 'font-size:19px', text: `${potg.data.first} ${potg.data.last}` }),
                h('div', { class: 'small', text: `#${potg.data.number} · ${potg.data.pos} · ${potgLine(potg.stat)}` })))) : null,

          panel('Team stats',
            statBar('GOALS', m.stats.away.goals, m.stats.home.goals, away.primary, home.primary),
            statBar('SHOTS', m.stats.away.shots, m.stats.home.shots, away.primary, home.primary),
            statBar('SHOTS ON GOAL', m.stats.away.shotsOnGoal, m.stats.home.shotsOnGoal, away.primary, home.primary),
            statBar('SAVES', m.stats.away.saves, m.stats.home.saves, away.primary, home.primary),
            statBar('GROUND BALLS', m.stats.away.groundBalls, m.stats.home.groundBalls, away.primary, home.primary),
            statBar('TURNOVERS', m.stats.away.turnovers, m.stats.home.turnovers, away.primary, home.primary),
            statBar('FACEOFFS WON', m.stats.away.faceoffWins, m.stats.home.faceoffWins, away.primary, home.primary),
            statBar('POSSESSION', Math.round(m.stats.away.possessionTime), Math.round(m.stats.home.possessionTime),
              away.primary, home.primary, (n) => `${Math.round(possessionPct(m, n))}%`),
          ),

          m.scoring.length
            ? panelFlush('Scoring summary', scoringTable(m))
            : panel('Scoring summary', h('div', { class: 'empty', text: 'No goals in this one.' })),

          panelFlush('Box score', leadersTable(box, home.abbr, away.abbr)),

          h('div', { class: 'stack' },
            ...opts.actions.map((a) => h('button', {
              class: `btn btn--block${a.primary ? ' btn--primary' : ''}`,
              text: a.label,
              on: { click: a.onClick },
            }))),
        ),
      ),
    );
  }
}

function possessionPct(m: Match, seconds: number): number {
  const total = m.stats.home.possessionTime + m.stats.away.possessionTime;
  return total <= 0 ? 50 : (seconds / total) * 100;
}

function potgLine(s: PlayerStats): string {
  const bits: string[] = [];
  if (s.goals) bits.push(`${s.goals}G`);
  if (s.assists) bits.push(`${s.assists}A`);
  if (s.saves) bits.push(`${s.saves} saves`);
  if (s.groundBalls) bits.push(`${s.groundBalls} GB`);
  if (s.causedTurnovers) bits.push(`${s.causedTurnovers} CT`);
  return bits.length ? bits.join(' · ') : 'Steady shift';
}

function score(s: PlayerStats): number {
  return s.goals * 3 + s.assists * 2 + s.saves * 0.55 + s.groundBalls * 0.5
    + s.causedTurnovers * 1.5 - s.turnovers * 0.4;
}

function playerOfTheGame(box: Line[], winner: Side | null): Line | null {
  let best: Line | null = null;
  let bestScore = -Infinity;
  for (const l of box) {
    const bonus = winner && l.side === winner ? 1.2 : 0;
    const v = score(l.stat) + bonus;
    if (v > bestScore) { bestScore = v; best = l; }
  }
  return best && score(best.stat) > 0 ? best : null;
}

function scoringTable(m: Match): HTMLElement {
  const rows = m.scoring.map((e) => {
    const team = m.setups[e.side].team;
    const t = Math.max(0, Math.ceil(e.clock));
    const clock = `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
    return h('tr', null,
      h('td', { class: 'name' },
        h('span', { class: 'pill', style: `border-color:${team.primary};color:${team.primary}`, text: team.abbr })),
      h('td', { class: 'name', style: 'text-align:left', text: e.scorerName }),
      h('td', { class: 'name', style: 'text-align:left', text: e.assistName ? `(${e.assistName})` : '—' }),
      h('td', { text: `${Math.round(e.distance)}y` }),
      h('td', { text: `Q${e.quarter} ${clock}` }),
    );
  });
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table table--compact' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Team' }), h('th', { style: 'text-align:left', text: 'Goal' }),
        h('th', { style: 'text-align:left', text: 'Assist' }), h('th', { text: 'Dist' }), h('th', { text: 'Time' }))),
      h('tbody', null, ...rows)));
}

function leadersTable(box: Line[], homeAbbr: string, awayAbbr: string): HTMLElement {
  const rows = box
    .filter((l) => score(l.stat) > 0 || l.stat.saves > 0 || l.data.pos === 'G')
    .sort((a, b) => score(b.stat) - score(a.stat))
    .slice(0, 16)
    .map((l) => h('tr', null,
      h('td', { class: 'name', text: shortName(l.data) }),
      h('td', { text: l.side === 'home' ? homeAbbr : awayAbbr }),
      h('td', { text: l.data.pos }),
      h('td', { text: String(l.stat.goals) }),
      h('td', { text: String(l.stat.assists) }),
      h('td', { text: String(l.stat.shots) }),
      h('td', { text: String(l.stat.groundBalls) }),
      h('td', { text: String(l.stat.saves) }),
    ));
  if (!rows.length) return h('div', { class: 'empty', text: 'No individual stats recorded.' });
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table table--compact' },
      h('thead', null, h('tr', null,
        h('th', { text: 'Player' }), h('th', { text: 'Tm' }), h('th', { text: 'Pos' }),
        h('th', { text: 'G' }), h('th', { text: 'A' }), h('th', { text: 'SH' }),
        h('th', { text: 'GB' }), h('th', { text: 'SV' }))),
      h('tbody', null, ...rows)));
}
