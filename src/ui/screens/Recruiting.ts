/* ---------------------------------------------------------------------------
 * THE RECRUITING HUB
 * ---------------------------------------------------------------------------
 * Everything about building a roster in one place: the class, what your scouts
 * have actually established about it, who you have offered, who else is
 * involved, and who has signed.
 *
 * The screen never shows a prospect's true rating. It shows YOUR estimate and
 * the error bar around it, so the coach is always looking at his own opinion
 * rather than the game's answer sheet.
 * ------------------------------------------------------------------------- */

import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, emptyPanel, segmented } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import { recruitContext } from '../../league/career';
import type { Career, CareerMode } from '../../league/types';
import {
  BOARD_LABEL, assignScout, board, classGrade, hireScout, interestFactors,
  makeOffer, maxScouts, offerWord, releaseScout, signUndrafted, trackProspect,
  undrafted, withdrawOffer, type BoardTab,
} from '../../scouting/recruiting';
import {
  ORIGIN_LABEL, estimateOf, gemKnown, bustKnown, levelPar, reportHighlights,
  scoutingReport, type Prospect,
} from '../../scouting/prospects';
import { TRAITS, qualityLabel, specialtyLabel, type Scout } from '../../scouting/scouts';
import { POSITION_LABEL } from '../../data/constants';
import { LEVELS } from '../../data/levels';

const TABS: BoardTab[] = ['targets', 'gems', 'scouting', 'offers', 'battles', 'committed'];

export class RecruitingScreen implements Screen {
  el: HTMLElement;
  private body = h('div', { class: 'stack' });
  private tab: BoardTab = 'targets';

  constructor(app: App, mode: CareerMode) {
    const career = loadCareer(mode);
    if (!career || !career.recruiting) {
      this.el = screenEl(
        topbar(app, 'Recruiting'),
        h('div', { class: 'scroll' }, h('div', { class: 'wrapper' }, emptyPanel(
          'No class is open',
          'A recruiting class opens at the start of every season and closes when the season ends. '
          + 'Come back once your season is under way.',
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))),
      );
      return;
    }

    const state = career.recruiting;
    this.el = screenEl(
      topbar(app, 'Recruiting', `${LEVELS[state.level].short} · week ${state.week}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          this.summary(career),
          this.staffPanel(app, career),
          segmented(
            TABS.map((t) => ({ value: t, label: BOARD_LABEL[t] })),
            this.tab,
            (v) => { this.tab = v; this.render(app, career); },
            true,
          ),
          this.body,
        ),
      ),
    );
    this.render(app, career);
  }

  private summary(career: Career): HTMLElement {
    const state = career.recruiting!;
    const grade = classGrade(state, career.teamId);
    const signedCount = state.prospects.filter((p) => p.committedTo === career.teamId).length;
    return panel('Your class',
      h('div', { class: 'row row--wrap', style: 'gap:6px' },
        h('span', { class: 'pill pill--accent', text: `${state.offersLeft}/${state.maxOffers} ${offerWord(state.level).many} left` }),
        state.invites ? h('span', { class: 'pill pill--green', text: `${state.invites} camp invites` }) : null,
        h('span', { class: 'pill', text: `${signedCount} committed` }),
        h('span', { class: 'pill', text: `Class grade ${grade.grade}` }),
        h('span', { class: 'pill', text: `${state.scouts.length}/${maxScouts(state.level)} scouts` })),
      h('div', {
        class: 'tiny',
        text: 'Rankings are public and often wrong. What you see below is your own estimate, '
          + 'and the ± is how sure your people are.',
      }),
      state.news.length
        ? h('div', { class: 'stack', style: 'gap:4px;margin-top:4px' },
          ...state.news.slice(-4).reverse().map((n) => h('div', {
            class: n.kind === 'gem' ? 'small' : 'tiny',
            style: n.kind === 'gem' ? 'color:var(--accent)' : n.kind === 'lost' ? 'color:var(--red)' : '',
            text: `Wk ${n.week} · ${n.text}`,
          })))
        : h('div', { class: 'tiny', text: 'No reports yet. Hire a scout and put him on somebody.' }),
    );
  }

  /* -------------------------------------------------------------- scouts */

  private staffPanel(app: App, career: Career): HTMLElement {
    const state = career.recruiting!;
    const wrap = h('div', { class: 'stack' });
    const redraw = () => {
      clear(wrap);
      for (const s of state.scouts) wrap.appendChild(this.scoutRow(app, career, s, redraw));
      if (!state.scouts.length) {
        wrap.appendChild(h('div', {
          class: 'small',
          text: 'You have no scouts. Without one you are recruiting off the same rankings as everybody else.',
        }));
      }
      wrap.appendChild(h('button', {
        class: 'btn btn--block',
        text: `Scout market · ${career.coachingPoints} CP`,
        on: { click: () => app.push((a) => new ScoutMarketScreen(a, career)) },
      }));
    };
    redraw();
    return panel('Scouting staff', wrap);
  }

  private scoutRow(app: App, career: Career, s: Scout, redraw: () => void): HTMLElement {
    const state = career.recruiting!;
    const target = s.assignedTo ? state.prospects.find((p) => p.id === s.assignedTo) : null;
    return h('div', { class: 'row', style: 'gap:8px;align-items:center' },
      h('div', { class: 'stack', style: 'gap:2px;flex:1 1 auto;min-width:0' },
        h('div', { class: 'small', text: `${s.name} · ${qualityLabel(s.quality)} · ${specialtyLabel(s.specialty)}` }),
        h('div', { class: 'tiny', text: `${TRAITS[s.trait].label} — ${TRAITS[s.trait].blurb}` }),
        h('div', {
          class: 'tiny',
          style: target ? 'color:var(--accent)' : '',
          text: target
            ? `Watching ${target.player.first} ${target.player.last} (${Math.round(target.scouted)}%)`
            : 'Idle — assign him from a prospect page',
        })),
      h('button', {
        class: 'btn btn--sm',
        text: 'Release',
        on: {
          click: () => {
            releaseScout(state, s.id);
            saveCareer(career);
            redraw();
            void app;
          },
        },
      }),
    );
  }

  /* ---------------------------------------------------------------- board */

  private render(app: App, career: Career): void {
    const state = career.recruiting!;
    const par = levelPar(state.level);
    clear(this.body);
    const list = board(state, career.teamId, this.tab);

    if (!list.length) {
      this.body.appendChild(emptyPanel(
        BOARD_LABEL[this.tab],
        this.emptyText(),
        [{ label: 'Show the top of the class', primary: true, onClick: () => { this.tab = 'targets'; this.render(app, career); } }],
      ));
      return;
    }

    const rows = h('div', { class: 'list' });
    for (const p of list) rows.appendChild(this.row(app, career, p, par));
    this.body.appendChild(panelFlush(`${BOARD_LABEL[this.tab]} · ${list.length}`, rows));
  }

  private emptyText(): string {
    switch (this.tab) {
      case 'gems': return 'Nobody your scouts have watched is rated meaningfully above his ranking — yet. '
        + 'Gems only appear here once somebody has actually seen the player.';
      case 'scouting': return 'No prospect is being watched. Open a prospect and put a scout on him.';
      case 'offers': return 'You have not offered anybody. Offers are scarce; spend them on players you believe in.';
      case 'battles': return 'Nobody is competing with you for a player you have offered. That will change.';
      case 'committed': return 'No commitments yet. They arrive on your roster in the offseason.';
      default: return 'The class is empty.';
    }
  }

  private row(app: App, career: Career, p: Prospect, par: number): HTMLElement {
    const est = estimateOf(p, par);
    const gem = gemKnown(p);
    const bust = bustKnown(p);
    return h('button', {
      class: 'list__row',
      on: { click: () => app.push((a) => new ProspectScreen(a, career, p.id)) },
    },
      h('div', { class: 'list__rank num', text: `#${p.nationalRank}` }),
      h('div', { class: 'stack', style: 'gap:2px;flex:1 1 auto;min-width:0' },
        h('div', { class: 'row', style: 'gap:6px;align-items:baseline' },
          h('div', { class: 'list__name', text: `${p.player.first} ${p.player.last}` }),
          h('span', { class: 'tiny', text: POSITION_LABEL[p.player.pos] }),
          gem ? h('span', { class: 'pill pill--accent pill--xs', text: 'VALUE' }) : null,
          bust ? h('span', { class: 'pill pill--red pill--xs', text: 'OVERRATED' }) : null),
        h('div', {
          class: 'tiny',
          text: `${est.line} · ${p.hometown}`,
        }),
        h('div', { class: 'tiny', text: this.statusText(p) })),
      h('div', { class: 'stack', style: 'gap:2px;align-items:flex-end' },
        h('div', { class: 'num', text: est.margin ? `${est.potential}±${est.margin}` : `${est.potential}` }),
        h('div', { class: 'tiny', text: `rank ${p.hype}` }),
        confidencePips(est.confidence)),
    );
  }

  private statusText(p: Prospect): string {
    const bits: string[] = [];
    bits.push(`scouted ${Math.round(p.scouted)}%`);
    if (p.offered) bits.push(`interest ${Math.round(p.interest)}%`);
    if (p.suitors.length) bits.push(`${p.suitors.length} rival${p.suitors.length === 1 ? '' : 's'}`);
    if (p.committedTo) bits.push('committed');
    return bits.join(' · ');
  }
}

function confidencePips(n: number): HTMLElement {
  const row = h('div', { class: 'row', style: 'gap:2px' });
  for (let i = 0; i < 4; i++) {
    row.appendChild(h('span', { class: i < n ? 'pip is-on' : 'pip' }));
  }
  return row;
}

/* ------------------------------------------------------------- one player */

export class ProspectScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career, prospectId: string) {
    const state = career.recruiting!;
    const par = levelPar(state.level);
    const p = state.prospects.find((x) => x.id === prospectId)!;
    const body = h('div', { class: 'stack' });

    const redraw = () => {
      clear(body);
      const est = estimateOf(p, par);
      body.appendChild(panel(`${p.player.first} ${p.player.last}`,
        h('div', { class: 'row row--wrap', style: 'gap:6px' },
          h('span', { class: 'pill pill--accent', text: POSITION_LABEL[p.player.pos] }),
          h('span', { class: 'pill', text: `Ranked #${p.nationalRank}` }),
          h('span', { class: 'pill', text: ORIGIN_LABEL[p.origin] }),
          gemKnown(p) ? h('span', { class: 'pill pill--accent', text: 'Ranked below his ceiling' }) : null,
          bustKnown(p) ? h('span', { class: 'pill pill--red', text: 'Overrated' }) : null),
        h('div', { class: 'row', style: 'gap:16px;margin-top:4px' },
          bigStat('Now', est.margin ? `${est.overall}±${est.margin}` : `${est.overall}`),
          bigStat('Ceiling', est.margin ? `${est.potential}±${est.margin}` : `${est.potential}`),
          bigStat('Scouted', `${Math.round(p.scouted)}%`),
          bigStat('Interest', `${Math.round(p.interest)}%`)),
      ));

      body.appendChild(panel('Report',
        ...scoutingReport(p, par).map((l) => h('div', { class: 'small', text: l })),
        h('div', { class: 'row row--wrap', style: 'gap:8px;margin-top:4px' },
          ...reportHighlights(p).map((a) => h('span', {
            class: 'pill',
            text: `${a.label} ${a.value}${a.margin ? `±${a.margin}` : ''}`,
          }))),
      ));

      // Who else is on him, and what he is weighing.
      body.appendChild(panel('Where you stand',
        ...interestFactors(p, recruitContext(career), state.level).map((f) => h('div', {
          class: 'row', style: 'justify-content:space-between',
        },
          h('span', { class: 'small', text: f.label }),
          h('span', {
            class: 'num',
            style: f.delta >= 0 ? 'color:var(--green)' : 'color:var(--red)',
            text: `${f.delta >= 0 ? '+' : ''}${f.delta}`,
          }))),
        p.suitors.length
          ? h('div', { class: 'tiny', style: 'margin-top:4px', text: `${p.suitors.length} other programme${p.suitors.length === 1 ? '' : 's'} involved.` })
          : h('div', { class: 'tiny', style: 'margin-top:4px', text: 'Nobody else is on him yet.' }),
      ));

      body.appendChild(this.actions(app, career, p, redraw));
    };
    redraw();

    this.el = screenEl(
      topbar(app, `${p.player.first} ${p.player.last}`, `#${p.nationalRank} in the class`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, body)),
    );
  }

  private actions(app: App, career: Career, p: Prospect, redraw: () => void): HTMLElement {
    const state = career.recruiting!;
    if (p.committedTo) {
      return panel('Status', h('div', {
        class: 'small',
        text: p.committedTo === career.teamId
          ? 'He has committed to you. He joins the roster in the offseason.'
          : 'He has committed elsewhere. That one is gone.',
      }));
    }

    const free = state.scouts.filter((s) => !s.assignedTo || s.assignedTo === p.id);
    const rows: HTMLElement[] = [];

    for (const s of state.scouts) {
      const on = s.assignedTo === p.id;
      rows.push(h('button', {
        class: `btn btn--block${on ? ' btn--primary' : ''}`,
        text: on ? `${s.name} is watching him — recall` : `Send ${s.name} (${qualityLabel(s.quality)}, ${specialtyLabel(s.specialty)})`,
        on: {
          click: () => {
            assignScout(state, s.id, on ? null : p.id);
            saveCareer(career);
            redraw();
          },
        },
      }));
    }
    if (!state.scouts.length) {
      rows.push(h('div', { class: 'small', text: 'You have no scouts to send. Hire one from the recruiting hub.' }));
    }

    const offerBtn = p.offered
      ? h('button', {
        class: 'btn btn--block',
        text: 'Withdraw the offer',
        on: {
          click: () => {
            withdrawOffer(state, p.id);
            saveCareer(career);
            redraw();
          },
        },
      })
      : h('button', {
        class: `btn btn--block${state.offersLeft > 0 ? ' btn--primary' : ''}`,
        text: state.offersLeft > 0
          ? `${state.invites ? 'Draft him' : 'Offer him a place'} · ${state.offersLeft} ${offerWord(state.level).many} left`
          : `No ${offerWord(state.level).many} left`,
        on: {
          click: () => {
            const r = makeOffer(state, p.id);
            if (!r.ok && r.reason) app.toast(r.reason);
            saveCareer(career);
            redraw();
          },
        },
      });

    const isUndrafted = undrafted(state).some((x) => x.id === p.id);
    return panel('What you can do',
      offerBtn,
      isUndrafted
        ? h('button', {
          class: 'btn btn--block btn--primary',
          text: `Sign as an undrafted free agent · ${state.invites} invite${state.invites === 1 ? '' : 's'}`,
          on: {
            click: () => {
              const r = signUndrafted(state, p.id, career.teamId);
              if (!r.ok && r.reason) app.toast(r.reason);
              saveCareer(career);
              redraw();
            },
          },
        })
        : null,
      h('button', {
        class: 'btn btn--block',
        text: p.tracked ? 'Remove from the board' : 'Add to the board',
        on: {
          click: () => {
            trackProspect(state, p.id, !p.tracked);
            saveCareer(career);
            redraw();
          },
        },
      }),
      ...rows,
      h('div', {
        class: 'tiny',
        text: free.length
          ? 'A scout keeps working until you move him. The longer he watches, the tighter the numbers.'
          : 'Every scout is busy somewhere else.',
      }),
    );
  }
}

function bigStat(label: string, value: string): HTMLElement {
  return h('div', { class: 'stack', style: 'gap:0' },
    h('div', { class: 'display', style: 'font-size:22px', text: value }),
    h('div', { class: 'tiny', text: label }));
}

/* ------------------------------------------------------------ scout market */

export class ScoutMarketScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, career: Career) {
    const state = career.recruiting!;
    const body = h('div', { class: 'stack' });

    const redraw = () => {
      clear(body);
      const full = state.scouts.length >= maxScouts(state.level);
      body.appendChild(panel('Budget',
        h('div', { class: 'row row--wrap', style: 'gap:6px' },
          h('span', { class: 'pill pill--green', text: `${career.coachingPoints} CP` }),
          h('span', { class: 'pill', text: `${state.scouts.length}/${maxScouts(state.level)} on staff` })),
        h('div', {
          class: 'tiny',
          text: 'Scouts are paid from the same Coach Points that buy your staff and your development '
            + 'projects. A programme that scouts brilliantly coaches worse — unless it is winning enough to afford both.',
        })));

      if (!state.market.length) {
        body.appendChild(emptyPanel('Nobody available',
          'Every scout willing to work at this level is already on your staff. A new market opens with next season\'s class.',
          [{ label: 'Back', primary: true, onClick: () => app.pop() }]));
        return;
      }

      for (const s of state.market) {
        const afford = career.coachingPoints >= s.salary && !full;
        body.appendChild(panel(null,
          h('div', { class: 'row', style: 'gap:10px;align-items:center' },
            h('div', { class: 'stack', style: 'gap:2px;flex:1 1 auto;min-width:0' },
              h('div', { class: 'small', text: `${s.name} · ${qualityLabel(s.quality)}` }),
              h('div', { class: 'tiny', text: `${specialtyLabel(s.specialty)} · ${TRAITS[s.trait].label}` }),
              h('div', { class: 'tiny', text: TRAITS[s.trait].blurb })),
            h('button', {
              class: `btn btn--sm${afford ? ' btn--primary' : ''}`,
              text: `${s.salary} CP`,
              on: {
                click: () => {
                  if (!afford) {
                    app.toast(full ? 'Your scouting staff is full.' : 'Not enough Coach Points.');
                    return;
                  }
                  if (hireScout(state, s.id)) {
                    career.coachingPoints -= s.salary;
                    saveCareer(career);
                    redraw();
                  }
                },
              },
            }))));
      }
    };
    redraw();

    this.el = screenEl(
      topbar(app, 'Scout market'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' }, body)),
    );
  }
}
