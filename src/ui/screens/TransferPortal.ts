import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import type { CareerMode } from '../../league/types';
import { screenEl, topbar, panel, emptyPanel, teamBadge } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import { pitchTo, programSnapshot } from '../../league/career';
import {
  MAX_PITCHES, REASON_TEXT, interestIn, transferEstimate, type TransferCandidate,
} from '../../league/transfers';
import { GRADE_LABEL, starTier } from '../../data/players';
import { POSITION_LABEL } from '../../data/constants';
import { getTeam } from '../../data/teams';
import { tryWorldTeam } from '../../data/world';
import type { Career } from '../../league/types';

/**
 * The transfer window. Every player here left a real situation on a real depth
 * chart, and every one of them is weighing your programme against the rest of
 * the district. You get three pitches — that is what makes it a decision.
 */
export class TransferPortalScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: CareerMode) {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(topbar(app, 'Transfers'), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'No programme yet',
          `There is no ${mode} save on this device.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }

    const body = h('div', { class: 'wrapper stack' });
    const sub = h('div', { class: 'topbar__sub', text: `${career.pitchesLeft} left` });

    const render = () => {
      clear(body);
      sub.textContent = `${career.pitchesLeft} left`;

      if (!career.market.length) {
        body.appendChild(emptyPanel(
          'The window is shut',
          'Nobody is on the market right now. The portal opens in the offseason, once the season has been put to bed.',
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ));
        return;
      }

      body.appendChild(h('div', {
        class: 'small',
        text: `You can make ${MAX_PITCHES} pitches a window. A player weighs the role he would have here `
          + 'against everywhere else that wants him, so the honest question is whether he would actually play.',
      }));

      for (const c of career.market) body.appendChild(this.card(app, career, c, render));
    };

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('button', {
          class: 'btn btn--icon btn--ghost', ariaLabel: 'Back', text: '←',
          on: { click: () => app.pop() },
        }),
        h('div', { class: 'topbar__title', text: 'Transfers' }),
        sub),
      h('div', { class: 'scroll' }, body),
    );
    render();
  }

  private card(app: App, career: Career, c: TransferCandidate, render: () => void): HTMLElement {
    const from = tryWorldTeam(c.fromTeamId) ?? getTeam(c.fromTeamId);
    const { score, factors } = interestIn(c, programSnapshot(career));
    // The star mark is your OPINION of him, so it comes off the estimate too.
    const tier = starTier(transferEstimate(c).overall);
    const closed = c.status === 'committed' || c.status === 'declined' || c.status === 'lost';

    const statusLine = () => {
      switch (c.status) {
        case 'committed': return { text: 'Committed to you', cls: 'pill pill--green' };
        case 'considering': return { text: 'Thinking it over', cls: 'pill' };
        case 'declined': return { text: 'Staying put', cls: 'pill pill--red' };
        case 'lost': return {
          text: c.lostToTeamId
            ? `Chose ${(tryWorldTeam(c.lostToTeamId) ?? getTeam(c.lostToTeamId)).short}`
            : 'Gone elsewhere',
          cls: 'pill pill--red',
        };
        default: return null;
      }
    };
    const status = statusLine();

    const bar = h('div', { class: 'interest' },
      h('div', {
        class: 'interest__fill',
        style: `width:${score}%;background:${score > 66 ? 'var(--green)' : score > 38 ? 'var(--accent)' : 'var(--red)'}`,
      }));

    const est = transferEstimate(c);
    return panel(null,
      h('div', { class: 'row', style: 'gap:10px;align-items:flex-start' },
        teamBadge(from, 'md'),
        h('div', { class: 'stack', style: 'gap:4px;flex:1 1 auto;min-width:0' },
          h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
            h('div', { class: 'display', style: 'font-size:17px', text: `${c.player.first} ${c.player.last}` }),
            tier ? h('span', { class: 'pill pill--green', text: tier === 2 ? '★★ Elite' : '★ Star' }) : null),
          h('div', {
            class: 'small',
            text: `${POSITION_LABEL[c.player.pos]} · ${GRADE_LABEL[c.player.grade]} · OVR ${est.overall}${est.margin ? `±${est.margin}` : ''}`
              + ` · ceiling ${est.potential}${est.margin ? `±${est.margin}` : ''}`,
          }),
          h('div', { class: 'tiny', text: est.confidence }),
          h('div', { class: 'small', style: 'color:var(--muted)', text: `${from.short} · ${REASON_TEXT[c.reason]}` }),
          status ? h('span', { class: status.cls, text: status.text }) : null)),

      h('div', { class: 'divider' }),
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', { class: 'eyebrow', text: 'Interest in you' }),
        h('div', { class: 'num', text: `${score}` })),
      bar,
      h('div', { class: 'stack', style: 'gap:2px' },
        ...factors.slice(0, 5).map((f) => h('div', { class: 'row', style: 'justify-content:space-between;gap:10px' },
          h('span', { class: 'tiny', text: f.label }),
          h('span', {
            class: `tiny num ${f.delta >= 0 ? 'good' : 'bad'}`,
            text: `${f.delta >= 0 ? '+' : ''}${f.delta}`,
          })))),

      h('button', {
        class: `btn btn--block${closed || career.pitchesLeft <= 0 ? '' : ' btn--primary'}`,
        disabled: closed || career.pitchesLeft <= 0,
        text: closed
          ? 'Nothing more to say'
          : career.pitchesLeft <= 0
            ? 'No pitches left this window'
            : c.status === 'considering' ? 'Go back to him' : 'Make your pitch',
        on: {
          click: () => {
            const out = pitchTo(career, c.id);
            if (!out) return;
            saveCareer(career);
            app.toast(out.result.message);
            render();
          },
        },
      }),
    );
  }
}
