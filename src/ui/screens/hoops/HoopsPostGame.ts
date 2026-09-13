import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, panel } from '../../components';
import type { HoopsGame } from '../../../sports/basketball/Game';
import { boxScoreTable, quarterLine, starOfTheGame } from './boxScore';

/* ---------------------------------------------------------------------------
 * AFTER THE FINAL BUZZER
 * ---------------------------------------------------------------------------
 * The score, the quarter line, the best performance in the game, and the full
 * box score. What happened, in the order somebody actually wants it.
 * ------------------------------------------------------------------------- */

export interface PostGameActions {
  onAgain?: () => void;
  onDone: () => void;
  /** Season games have a different next step from an exhibition. */
  againLabel?: string;
  doneLabel?: string;
}

export class HoopsPostGameScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, game: HoopsGame, actions: PostGameActions) {
    const cfg = game.cfg;
    const homeWon = game.score.home > game.score.away;
    const winner = homeWon ? cfg.home.team : cfg.away.team;
    const star = starOfTheGame(game);
    const overtime = game.overtime > 0;

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('div', { class: 'topbar__title display', text: 'Final' }),
        h('div', { class: 'topbar__sub', text: cfg.label ?? 'Game' })),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'hoop-final' },
            side(cfg.away.team, game.score.away, !homeWon),
            h('div', { class: 'hoop-final__mid' },
              h('div', { class: 'hoop-final__dash', text: '—' }),
              overtime
                ? h('div', { class: 'hoop-final__ot', text: game.overtime > 1 ? `${game.overtime}OT` : 'OT' })
                : null),
            side(cfg.home.team, game.score.home, homeWon)),

          h('div', {
            class: 'center display',
            style: 'letter-spacing:.14em;text-transform:uppercase;font-size:14px;color:var(--accent)',
            text: `${winner.city} ${winner.name} win`,
          }),

          panel('By quarter', quarterLine(game, cfg)),

          star
            ? panel('Star of the game',
              h('div', { class: 'star-line' },
                h('div', { class: 'star-line__name' },
                  `${star.data.first} ${star.data.last}`,
                  h('span', { class: 'star-line__team', text: (star.side === 'home' ? cfg.home : cfg.away).team.abbr })),
                h('div', { class: 'star-line__stats num' },
                  `${star.stat.points} pts · ${star.stat.offReb + star.stat.defReb} reb`
                  + ` · ${star.stat.assists} ast`
                  + `${star.stat.steals ? ` · ${star.stat.steals} stl` : ''}`
                  + `${star.stat.blocks ? ` · ${star.stat.blocks} blk` : ''}`),
                h('div', { class: 'tiny' },
                  `${star.stat.fgm}-${star.stat.fga} from the field`
                  + `${star.stat.tpa ? `, ${star.stat.tpm}-${star.stat.tpa} from three` : ''}`)))
            : null,

          panel('Box score', boxScoreTable(game, cfg)),

          actions.onAgain
            ? h('button', {
              class: 'btn btn--primary btn--block',
              text: actions.againLabel ?? 'Play again',
              on: { click: actions.onAgain },
            })
            : null,
          h('button', {
            class: `btn btn--block${actions.onAgain ? '' : ' btn--primary'}`,
            text: actions.doneLabel ?? 'Back to the menu',
            on: { click: actions.onDone },
          }),
        ),
      ),
    );
    void app;
  }
}

function side(
  team: { abbr: string; city: string; name: string; primary: string; secondary: string },
  score: number, won: boolean,
): HTMLElement {
  return h('div', { class: `hoop-final__side${won ? ' is-win' : ''}` },
    h('div', {
      class: 'hoop-final__badge',
      style: `background:${team.primary};border-color:${team.secondary}`,
      text: team.abbr,
    }),
    h('div', { class: 'hoop-final__score num', text: String(score) }),
    h('div', { class: 'hoop-final__club tiny', text: `${team.city} ${team.name}` }));
}
