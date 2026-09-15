import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panelFlush, panel, segmented } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { worldTeam } from '../../../../sports/basketball/world';
import { averages } from '../../../../sports/basketball/career/season';
import {
  LEADER_LABEL, LEADER_ORDER, bestAlumni, leaderValue, leaders, leagueStatLines,
  programmeRecords, type LeaderCategory, type LeagueLine,
} from '../../../../sports/basketball/career/records';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { badge, kvRow, pill } from './bits';

/* ---------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------
 * Season numbers, programme records that outlive a graduation, and the list of
 * seasons the coach has actually coached — which in Challenge Mode spans several
 * clubs, because the record belongs to the man and not the building.
 * ------------------------------------------------------------------------- */

type View = 'season' | 'records' | 'league' | 'wall' | 'seasons';

/** Percentage categories read as percentages; everything else is a rate. */
const fmt = (cat: LeaderCategory, v: number): string =>
  (cat.endsWith('Pct') ? `${(v * 100).toFixed(1)}%` : v.toFixed(1));

export class CareerStatsScreen implements Screen {
  el: HTMLElement;
  private view: View = 'season';
  private body!: HTMLElement;

  constructor(app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'Statistics',
        `${career.careerWins}-${career.careerLosses} as a coach`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        segmented<View>([
          { value: 'season', label: 'This season' },
          { value: 'records', label: 'Programme' },
          { value: 'league', label: 'The league' },
          { value: 'wall', label: 'The wall' },
          { value: 'seasons', label: 'Seasons' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private paint(): void {
    this.body.replaceChildren(
      this.view === 'season' ? this.lines(this.career.season, 'No games played yet.')
        : this.view === 'records' ? this.lines(this.career.careerStats, 'Nothing recorded yet.')
          : this.view === 'league' ? this.league()
            : this.view === 'wall' ? this.wall()
              : this.seasons(),
    );
  }

  /* -------------------------------------------------------- league leaders */

  /**
   * Every category, and where the coach's own men sit in it.
   *
   * The lines are recovered by RE-SIMULATING the level's fixtures rather than
   * stored, which is why a forty-club league costs nothing in the save — and why
   * this is computed once, here, and shared across eight boards rather than eight
   * times.
   */
  private league(): HTMLElement {
    const c = this.career;
    const lines = leagueStatLines(c);
    if (!lines.length) {
      return panel(null, h('div', { class: 'small',
        text: 'Nobody at this level has played a game yet.' }));
    }
    const mine = new Set(lines.filter((l) => l.mine).map((l) => l.playerId));
    return h('div', { class: 'stack' },
      panel(null,
        h('div', { class: 'small',
          text: `${LEVELS[c.level].name}, this season.` }),
        h('div', { class: 'tiny',
          text: `${lines.length} players who have played. Your own are highlighted. `
            + 'Percentage boards require a real rate of attempts.' })),
      ...LEADER_ORDER.map((cat) => this.board(cat, leaders(lines, cat, 5), mine)),
    );
  }

  private board(
    cat: LeaderCategory, rows: LeagueLine[], mine: Set<string>,
  ): HTMLElement {
    return panelFlush(LEADER_LABEL[cat],
      ...rows.map((l, i) => h('div', {
        class: `roster-row${mine.has(l.playerId) ? ' roster-row--on' : ''}`,
      },
      h('span', { class: 'roster-row__pos', text: String(i + 1) }),
      h('div', { class: 'roster-row__body' },
        h('div', { class: 'roster-row__name', text: l.name }),
        h('div', { class: 'roster-row__note tiny',
          text: `${l.teamAbbr} · ${l.pos} · ${l.line.games} games` })),
      h('span', { class: 'roster-row__ovr num', text: fmt(cat, leaderValue(l, cat)) }))));
  }

  /* ------------------------------------------------- the wall and the book */

  /** Who used to play here, and what this programme has never done better than. */
  private wall(): HTMLElement {
    const c = this.career;
    const book = programmeRecords(c);
    const best = bestAlumni(c, 'points', 20);

    return h('div', { class: 'stack' },
      book.length
        ? panelFlush('The record book', ...book.map((r) => h('div', { class: 'kv' },
          h('div', { class: 'kv__k tiny', text: r.label }),
          h('div', { class: 'kv__v',
            text: `${r.value}${r.who ? ` — ${r.who}` : ''}` }))))
        : panel(null, h('div', { class: 'small',
          text: 'Finish a season and the record book starts.' })),
      best.length
        ? panelFlush('Everybody who has played here',
          ...best.map((a) => {
            const g = Math.max(1, a.line.games);
            return h('div', { class: 'roster-row' },
              h('span', { class: 'roster-row__pos', text: a.pos }),
              h('div', { class: 'roster-row__body' },
                h('div', { class: 'roster-row__name', text: a.name }),
                h('div', { class: 'roster-row__note tiny',
                  text: `${a.seasons} season${a.seasons === 1 ? '' : 's'} to ${a.year} · `
                    + `${(a.line.points / g).toFixed(1)}p ${((a.line.offReb + a.line.defReb) / g).toFixed(1)}r `
                    + `${(a.line.assists / g).toFixed(1)}a · ${a.reason}` })),
              h('span', { class: 'roster-row__ovr num', text: String(a.line.points) }));
          }))
        : panel(null, h('div', { class: 'small',
          text: 'Nobody has left the programme yet. When they do, they stay on this wall.' })),
    );
  }

  private lines(
    store: HoopsCareer['season'], empty: string,
  ): HTMLElement {
    const c = this.career;
    const rows = Object.entries(store)
      .map(([id, line]) => ({ id, line, a: averages(line) }))
      .filter((r) => r.a.games > 0)
      .sort((a, b) => b.a.ppg - a.a.ppg);
    if (!rows.length) return panel(null, h('div', { class: 'small', text: empty }));

    // A career line can belong to a player who has long since graduated.
    const nameOf = (id: string): { name: string; pos: string } => {
      const p = c.roster.find((x) => x.id === id);
      return p ? { name: `${p.first} ${p.last}`, pos: p.pos } : { name: 'A former player', pos: '—' };
    };

    return panelFlush('Per game',
      ...rows.map((r) => {
        const who = nameOf(r.id);
        const a = r.a;
        return h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: who.pos }),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: who.name }),
            h('div', { class: 'roster-row__note tiny',
              text: `${a.games}g · ${a.rpg.toFixed(1)}r ${a.apg.toFixed(1)}a `
                + `${a.spg.toFixed(1)}s ${a.bpg.toFixed(1)}b · ${a.topg.toFixed(1)}to · `
                + `${(a.fgPct * 100).toFixed(0)}/${(a.tpPct * 100).toFixed(0)}/`
                + `${(a.ftPct * 100).toFixed(0)}` })),
          h('span', { class: 'roster-row__ovr num', text: a.ppg.toFixed(1) }));
      }));
  }

  private seasons(): HTMLElement {
    const c = this.career;
    if (!c.history.length) {
      return panel(null, h('div', { class: 'small', text: 'Your first season is not finished.' }));
    }
    return h('div', { class: 'stack' },
      panel(null, kvRow(
        ['Seasons', String(c.history.length)],
        ['Wins', String(c.careerWins)],
        ['Losses', String(c.careerLosses)],
        ['Titles', String(c.championships)],
      )),
      panelFlush('Every season',
        ...[...c.history].reverse().map((s) => {
          const team = worldTeam(s.teamId);
          return h('div', { class: 'roster-row' },
            h('span', { class: 'roster-row__pos', text: String(s.year) }),
            badge(team, 'sm'),
            h('div', { class: 'roster-row__body' },
              h('div', { class: 'roster-row__name', text: `${s.wins}-${s.losses} · ${s.finish}` }),
              h('div', { class: 'roster-row__note tiny',
                text: `${LEVELS[s.level].short}${s.star ? ` · ${s.star}` : ''}` })),
            s.champion ? pill('CHAMPIONS', 'good') : null);
        })),
    );
  }
}
