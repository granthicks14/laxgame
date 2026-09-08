import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import type { CareerMode } from '../../league/types';
import { screenEl, topbar, panel, emptyPanel, teamBadge } from '../components';
import { loadCareer, saveCareer } from '../../state/saves';
import { pitchTo, programSnapshot } from '../../league/career';
import {
  PITCH_ANGLES, PITCH_ORDER, REASON_TEXT, angleFit, interestIn, marketFor,
  suggestedAngle, transferEstimate, type TransferCandidate,
} from '../../league/transfers';
import { MODE_LABEL } from '../../league/modes';
import { GRADE_LABEL, starTier } from '../../data/players';
import { POSITION_LABEL } from '../../data/constants';
import { getTeam } from '../../data/teams';
import { tryWorldTeam } from '../../data/world';
import type { Career } from '../../league/types';

/**
 * The transfer window, whatever the level calls it: player movement at a high
 * school, the portal at a college, free agency in the professional game. Every
 * player here left a real situation on a real depth chart, and every one of
 * them is weighing your programme against everywhere else that wants him.
 *
 * It works in every career save. The mode is only ever used to load the right
 * one — see league/modes.ts.
 */
export class TransferPortalScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: CareerMode) {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(topbar(app, 'Transfers'), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'No programme yet',
          `There is no ${MODE_LABEL[mode]} save on this device.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }

    const info = marketFor(career.level);
    const body = h('div', { class: 'wrapper stack' });
    const sub = h('div', { class: 'topbar__sub', text: `${career.pitchesLeft} left` });

    const render = () => {
      clear(body);
      sub.textContent = `${career.pitchesLeft} left`;

      // Players you LOST are shown whether or not the window has anyone in it:
      // that half of the portal is the half a coach needs to see.
      const losses = career.portalOut ?? [];
      if (losses.length) {
        body.appendChild(panel('Left your programme',
          ...losses.map((d) => h('div', { class: 'row', style: 'gap:8px' },
            h('span', { class: 'pill pill--red', text: d.pos }),
            h('span', { style: 'flex:1 1 auto;min-width:0', text: d.name }),
            h('span', { class: 'tiny', text: REASON_TEXT[d.reason] }),
            h('span', { class: 'num', text: String(d.overall) }))),
          h('div', {
            class: 'tiny',
            text: 'Team culture in the coach\'s office is what keeps these players. '
              + 'A programme nobody wants to leave does not lose them.',
          })));
      }

      if (!career.market.length) {
        body.appendChild(emptyPanel(
          'The window is shut',
          `Nobody is available right now. ${info.title} opens in the offseason, once the season has been put to bed.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ));
        return;
      }

      body.appendChild(h('div', { class: 'small', text: info.blurb }));
      body.appendChild(h('div', {
        class: 'tiny',
        text: `${info.pitches} ${info.pitchesWord} a window. A player weighs the role he would have here `
          + 'against everywhere else that wants him, so the honest question is whether he would actually play. '
          + 'Ratings are your own estimate — scouts narrow them.',
      }));

      for (const c of career.market) body.appendChild(this.card(app, career, c, render));
    };

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('button', {
          class: 'btn btn--icon btn--ghost', ariaLabel: 'Back', text: '←',
          on: { click: () => app.pop() },
        }),
        h('div', { class: 'topbar__title', text: info.title }),
        sub),
      h('div', { class: 'scroll' }, body),
    );
    render();
  }

  private card(app: App, career: Career, c: TransferCandidate, render: () => void): HTMLElement {
    const info = marketFor(career.level);
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

      // WHAT you say to him. Each angle is worth something to some players and
      // nothing to others, and the fit is worked out from his own situation.
      closed || career.pitchesLeft <= 0
        ? null
        : this.pitchPicker(app, career, c, render),
      closed || career.pitchesLeft <= 0
        ? h('button', {
          class: 'btn btn--block',
          disabled: true,
          text: closed ? 'Nothing more to say' : `No ${info.pitchesWord} left this window`,
        })
        : null,
    );
  }

  /** The angles, best fit first, each saying what it offers and how it lands. */
  private pitchPicker(
    app: App, career: Career, c: TransferCandidate, render: () => void,
  ): HTMLElement {
    const snap = programSnapshot(career);
    // The angle he has already heard is never the one suggested next.
    const fresh = PITCH_ORDER.filter((k) => k !== c.lastAngle);
    const best = c.lastAngle === suggestedAngle(c, snap)
      ? [...fresh].sort((a, b) => angleFit(b, c, snap) - angleFit(a, c, snap))[0]
      : suggestedAngle(c, snap);
    const angles = [...fresh, ...(c.lastAngle ? [c.lastAngle] : [])]
      .sort((a, b) => (angleFit(b, c, snap) - (b === c.lastAngle ? 100 : 0))
        - (angleFit(a, c, snap) - (a === c.lastAngle ? 100 : 0)))
      .slice(0, 4);
    return h('div', { class: 'stack', style: 'gap:6px' },
      h('div', { class: 'eyebrow', text: c.status === 'considering' ? 'Go back to him with' : 'What do you tell him?' }),
      ...angles.map((key) => {
        const info = PITCH_ANGLES[key];
        const fit = angleFit(key, c, snap);
        return h('button', {
          class: `btn btn--block${key === best ? ' btn--primary' : ''}`,
          style: 'justify-content:flex-start;text-align:left;min-height:auto;padding:8px 12px',
          on: {
            click: () => {
              const out = pitchTo(career, c.id, key);
              if (!out) return;
              saveCareer(career);
              app.toast(out.result.message);
              render();
            },
          },
        },
          h('span', { class: 'stack', style: 'gap:1px;min-width:0' },
            h('span', { style: 'font-size:14px', text: info.label }),
            h('span', {
              class: 'tiny',
              style: `text-transform:none;letter-spacing:0;${fit >= 8 ? 'color:var(--green)' : fit <= -4 ? 'color:var(--red)' : ''}`,
              text: c.lastAngle === key ? `You have already told him this. ${info.blurb}`
                : fit >= 8 ? `Exactly what he wants to hear. ${info.blurb}`
                  : fit <= -4 ? `He does not care about this. ${info.blurb}`
                    : info.blurb,
            })));
      }),
      h('div', {
        class: 'tiny',
        text: `${career.pitchesLeft} ${career.pitchesLeft === 1 ? 'approach' : 'approaches'} left. `
          + 'Reading him right is worth more than saying it twice.',
      }));
  }
}
