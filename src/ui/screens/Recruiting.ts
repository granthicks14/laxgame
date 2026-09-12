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
import { recruitContext, spendCoachPoints, userTeam } from '../../league/career';
import { playerPortrait } from '../portrait';
import type { Career, CareerMode } from '../../league/types';

const userTeamShort = (career: Career): string => userTeam(career).short;
import {
  BOARD_LABEL, BOARD_TAB, assignScout, board, boardTabs, classGrade, hireScout, interestFactors,
  makeOffer, maxScouts, offerWord, releaseScout, signUndrafted, trackProspect,
  undrafted, withdrawOffer, type BoardTab,
} from '../../scouting/recruiting';
import {
  ORIGIN_LABEL, estimateOf, gemKnown, bustKnown, levelPar, reportHighlights,
  scoutingReport, type Prospect,
} from '../../scouting/prospects';
import { TRAITS, qualityLabel, specialtyLabel, type Scout } from '../../scouting/scouts';
import { POSITION_LABEL, type Position } from '../../data/constants';
import { LEVELS } from '../../data/levels';

/**
 * Recruiting has depth, and depth is worthless if the coach cannot see what to
 * do next. This is the six-step answer, shown the first time and available for
 * ever after from the button on the board.
 */
const STEPS: { icon: string; title: string; body: string }[] = [
  {
    icon: '1',
    title: 'Hire a scout, then send him somewhere',
    body: 'You cannot judge a player nobody has watched. A scout works one prospect at a '
      + 'time and closes the error bar on him — and now and then he rings you about somebody '
      + 'the rankings missed entirely.',
  },
  {
    icon: '2',
    title: 'Read your own estimate, not the ranking',
    body: 'Every prospect shows YOUR number with a ± around it. The public ranking beside it '
      + 'is what everyone else believes, and it is often wrong. The gap between the two is '
      + 'the entire game.',
  },
  {
    icon: '3',
    title: 'Put the ones you want on your board',
    body: 'Tracking a prospect keeps him in front of you and lets you assign a scout. '
      + 'The Hidden Gems tab fills up as your people establish who is undervalued.',
  },
  {
    icon: '4',
    title: 'Offer — and offers are scarce',
    body: 'An offer is the strongest thing you can do, and you only get a handful a year. '
      + 'It jumps his interest, and it is worth more if your scouts have been around him.',
  },
  {
    icon: '5',
    title: 'Watch the interest bar and the rivals',
    body: 'Every prospect page shows exactly what he is weighing about you — your record, '
      + 'his likely role, who else is chasing him. Fix what you can and the bar moves.',
  },
  {
    icon: '6',
    title: 'Win the race',
    body: 'The class closes from the top down and rival programmes find your gems eventually. '
      + 'Whoever he likes most when he decides gets him, and he arrives on your roster at '
      + 'the offseason.',
  },
];

function walkthrough(onClose: () => void): HTMLElement {
  return h('div', { class: 'panel', style: 'border-color:var(--accent)' },
    h('div', { class: 'panel__head' },
      h('span', { text: 'How recruiting works' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--sm btn--ghost', text: 'Close', on: { click: onClose } })),
    h('div', { class: 'panel__body stack' },
      ...STEPS.map((s) => h('div', { class: 'row', style: 'gap:10px;align-items:flex-start' },
        h('span', { class: 'step__n display', text: s.icon }),
        h('div', { class: 'stack', style: 'gap:1px;min-width:0' },
          h('div', { class: 'small', style: 'color:var(--text)', text: s.title }),
          h('div', { class: 'tiny', text: s.body })))),
      h('button', { class: 'btn btn--primary btn--block', text: 'Got it', on: { click: onClose } })));
}

const POS_FILTER: { value: Position | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'A', label: 'A' },
  { value: 'M', label: 'M' },
  { value: 'D', label: 'D' },
  { value: 'G', label: 'G' },
  { value: 'FO', label: 'FO' },
];

export class RecruitingScreen implements Screen {
  el: HTMLElement;
  private body = h('div', { class: 'stack' });
  private tab: BoardTab = 'targets';
  private pos: Position | 'all' = 'all';
  private help = false;
  private app: App | null = null;

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

    this.app = app;
    const state = career.recruiting;
    // First time in, the walkthrough is open. After that it is a button.
    this.help = !app.settings.seenRecruiting;
    if (this.help) app.updateSettings({ seenRecruiting: true });
    const helpSlot = h('div');
    const renderHelp = () => {
      clear(helpSlot);
      if (this.help) helpSlot.appendChild(walkthrough(() => { this.help = false; renderHelp(); }));
    };
    renderHelp();

    this.el = screenEl(
      topbar(app, 'Recruiting', `${LEVELS[state.level].short} · week ${state.week}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('button', {
            class: 'btn btn--block btn--sm',
            text: 'How does recruiting work?',
            on: { click: () => { this.help = !this.help; renderHelp(); } },
          }),
          helpSlot,
          this.nextStep(career),
          this.summary(career),
          this.staffPanel(app, career),
          segmented(
            boardTabs(state).map((t) => ({ value: t, label: BOARD_TAB[t] })),
            this.tab,
            (v) => { this.tab = v; this.render(app, career); },
            true,
          ),
          segmented(
            POS_FILTER,
            this.pos,
            (v) => { this.pos = v; this.render(app, career); },
            true,
          ),
          this.body,
        ),
      ),
    );
    this.render(app, career);
  }

  /**
   * The single most useful thing on the screen: what to do next, right now,
   * worked out from the state the class is actually in.
   */
  private nextStep(career: Career): HTMLElement {
    const state = career.recruiting!;
    const par = levelPar(state.level);
    const open = state.prospects.filter((p) => !p.committedTo);
    const idle = state.scouts.filter((s) => !s.assignedTo);
    const gems = open.filter((p) => p.scouted >= 50 && estimateOf(p, par).potential - p.hype >= 6);
    const readyToOffer = open.filter((p) => !p.offered && p.scouted >= 45);
    const battles = open.filter((p) => p.offered && p.suitors.length >= 2);

    let text: string;
    let where: BoardTab | null = null;
    if (!state.scouts.length) {
      text = 'Start by hiring a scout. Without one you are recruiting off the same rankings '
        + 'as everybody else, and the rankings are wrong.';
    } else if (idle.length) {
      text = `${idle.length} scout${idle.length === 1 ? ' is' : 's are'} idle. Open a prospect and send `
        + `${idle.length === 1 ? 'him' : 'them'} to watch somebody.`;
      where = 'targets';
    } else if (gems.length && state.offersLeft > 0) {
      text = `Your people rate ${gems.length} player${gems.length === 1 ? '' : 's'} well above the ranking. `
        + 'Offer before somebody else works it out.';
      where = 'gems';
    } else if (readyToOffer.length && state.offersLeft > 0) {
      text = `${state.offersLeft} offer${state.offersLeft === 1 ? '' : 's'} left, and `
        + `${readyToOffer.length} player${readyToOffer.length === 1 ? '' : 's'} you have seen enough of.`;
      where = 'targets';
    } else if (battles.length) {
      text = `${battles.length} recruiting battle${battles.length === 1 ? '' : 's'} to hold on to. `
        + 'Keep a scout on them and win the close ones.';
      where = 'battles';
    } else if (!state.offersLeft) {
      text = 'Every offer is out. Your scouts keep working — the rest is whether they say yes.';
      where = 'offers';
    } else {
      text = 'Keep scouting. The class closes from the top down, so the longer you wait the '
        + 'fewer names are left.';
      where = 'targets';
    }

    return h('div', { class: 'panel', style: 'border-color:var(--accent)' },
      h('div', { class: 'panel__body stack', style: 'gap:6px' },
        h('div', { class: 'eyebrow', style: 'color:var(--accent)', text: 'What to do next' }),
        h('div', { class: 'small', style: 'color:var(--text)', text }),
        where
          ? h('button', {
            class: 'btn btn--sm btn--block',
            text: `Go to ${BOARD_LABEL[where].toLowerCase()}`,
            on: { click: () => { this.tab = where!; this.pos = 'all'; this.render(this.app!, career); } },
          })
          : null));
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
    const list = board(state, career.teamId, this.tab, this.pos);

    if (!list.length) {
      this.body.appendChild(emptyPanel(
        BOARD_LABEL[this.tab],
        this.pos === 'all' ? this.emptyText() : `Nothing here at ${POSITION_LABEL[this.pos]}. Try another position, or clear the filter.`,
        [{
          label: 'Show the top of the class',
          primary: true,
          onClick: () => { this.tab = 'targets'; this.pos = 'all'; this.render(app, career); },
        }],
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
      case 'undrafted': return 'The draft is still running. Once it finishes, everybody nobody took shows up here.';
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
      playerPortrait(p.player, userTeam(career), 30, false),
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
      // Both numbers, labelled: what he is now and what your scouts think he
      // becomes. Showing only the ceiling made every prospect look the same.
      h('div', { class: 'stack', style: 'gap:1px;align-items:flex-end' },
        h('div', { class: 'num', style: 'font-size:15px', text: est.margin ? `${est.potential}±${est.margin}` : `${est.potential}` }),
        h('div', { class: 'tiny', text: 'ceiling' }),
        h('div', { class: 'tiny', text: `now ${est.overall}` }),
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
        h('div', { class: 'row', style: 'gap:12px;align-items:center;margin-bottom:2px' },
          playerPortrait(p.player, userTeam(career), 64, false),
          h('div', { class: 'stack', style: 'gap:2px;min-width:0' },
            h('div', { class: 'display', style: 'font-size:18px', text: `${p.player.first} ${p.player.last}` }),
            h('div', { class: 'tiny', text: `${p.hometown} · ${ORIGIN_LABEL[p.origin]}` }))),
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

      // The interest bar and who else is on him — the two things a coach needs
      // at a glance and had to work out for himself before.
      const rivalNames = p.suitors
        .map((su) => recruitContext(career).rivals.find((r) => r.id === su.teamId)?.name ?? 'A rival')
        .slice(0, 4);
      body.appendChild(panel('Where he is leaning',
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('span', { class: 'small', style: 'color:var(--text)', text: 'Interest in your programme' }),
          h('span', { class: 'num', text: `${Math.round(p.interest)}%` })),
        h('div', { class: 'interest' },
          h('div', {
            class: 'interest__fill',
            style: `width:${Math.round(p.interest)}%;background:${
              p.interest > 66 ? 'var(--green)' : p.interest > 38 ? 'var(--accent)' : 'var(--red)'}`,
          })),
        h('div', {
          class: 'tiny',
          text: p.interest > 70 ? 'He is close. Do not let anybody else in.'
            : p.interest > 45 ? 'He is listening. An offer would move this a long way.'
              : 'He is not sold. Get somebody in front of him.',
        }),
        h('div', { class: 'eyebrow', style: 'margin-top:6px', text: 'Who is in for him' }),
        h('div', { class: 'stack', style: 'gap:1px' },
          h('div', {
            class: 'tiny',
            style: 'color:var(--accent)',
            text: `1. ${userTeamShort(career)} — ${Math.round(p.interest)}%`
              + (p.offered ? ' (offered)' : ''),
          }),
          ...(rivalNames.length
            ? rivalNames.map((n, i) => h('div', { class: 'tiny', text: `${i + 2}. ${n}` }))
            : [h('div', { class: 'tiny', text: 'Nobody else is on him yet.' })]))));

      body.appendChild(panel('Report',
        ...scoutingReport(p, par).map((l) => h('div', { class: 'small', text: l })),
        h('div', { class: 'row row--wrap', style: 'gap:8px;margin-top:4px' },
          ...reportHighlights(p).map((a) => h('span', {
            class: 'pill',
            text: `${a.label} ${a.value}${a.margin ? `±${a.margin}` : ''}`,
          }))),
      ));

      // Exactly what he is weighing about you, line by line.
      body.appendChild(panel('What he is weighing',
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
      h('div', {
        class: 'tiny',
        text: 'An offer is the strongest thing you have and you only get a few. A scout on him '
          + 'narrows the numbers and warms him to you at the same time.',
      }),
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
                    spendCoachPoints(career, s.salary);
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
