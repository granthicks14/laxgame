import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush, segmented } from '../../../components';
import { LEVELS, LEVEL_ORDER, type HoopsLevel } from '../../../../sports/basketball/levels';
import {
  IDENTITY_LABEL, conferencesAt, rankedAtLevel, programmeBlurb, worldTeam,
} from '../../../../sports/basketball/world';
import {
  MODIFIER_SPECS, TIERS, TIER_ORDER, modsFor, type HoopsTier,
} from '../../../../sports/basketball/career/difficulty';
import { SITUATIONS, generateOffers, newChallengeState, type JobOffer } from '../../../../sports/basketball/career/challenge';
import { RUNGS, rungAt } from '../../../../sports/basketball/career/ladder';
import { createCareer } from '../../../../sports/basketball/career/season';
import { deleteHoopsCareer, saveHoopsCareer } from '../../../../sports/basketball/career/save';
import { Rng } from '../../../../core/rng';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { badge, bigButton, kvRow, pill } from './bits';
import { HoopsCareerHub } from './CareerHub';

/* ---------------------------------------------------------------------------
 * STARTING A CAREER
 * ---------------------------------------------------------------------------
 * Two front doors onto the same engine.
 *
 * DYNASTY is a choice: any programme at any level in the sport, and you stay
 * there as long as you like. It is the mode for building one place up.
 *
 * CHALLENGE is not a choice, it is a starting position: the bottom rung, one of
 * three programmes nobody else wants, and nine levels above you. Before you pick
 * a difficulty you are shown exactly what each one changes — the table is
 * generated from the same numbers the systems read, so nothing on it can be a
 * promise the game does not keep.
 * ------------------------------------------------------------------------- */

const teamCount = (level: HoopsLevel): number => rankedAtLevel(level).length;

/* ------------------------------------------------------------- dynasty */

export class DynastyStartScreen implements Screen {
  el: HTMLElement;
  private level: HoopsLevel = 'd2';
  private teamId: string;
  private tier: HoopsTier = 'standard';
  private body!: HTMLElement;

  constructor(private app: App) {
    this.teamId = rankedAtLevel(this.level)[Math.floor(teamCount(this.level) / 2)].id;
    this.el = screenEl(
      topbar(app, 'New dynasty', 'One programme, as long as you want it'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private paint(): void {
    const info = LEVELS[this.level];
    const teams = rankedAtLevel(this.level);
    const team = worldTeam(this.teamId);

    this.body.replaceChildren(
      panel('The level',
        h('select', {
          class: 'select',
          on: { change: (e: Event) => {
            this.level = (e.target as HTMLSelectElement).value as HoopsLevel;
            this.teamId = rankedAtLevel(this.level)[Math.floor(teamCount(this.level) / 2)].id;
            this.paint();
          } },
        }, ...LEVEL_ORDER.map((l) => {
          const opt = h('option', { value: l,
            text: `${LEVELS[l].name} — ${teamCount(l)} programmes` });
          if (l === this.level) opt.selected = true;
          return opt;
        })),
        h('div', { class: 'small', text: info.blurb }),
        h('div', { class: 'tiny',
          text: `${info.games} games · ${conferencesAt(this.level).length} conferences · `
            + `${info.rosterSize}-man rosters · ${info.postseason} · `
            + `${info.eligibility ? `${info.eligibility} years of eligibility` : 'professionals'}` })),

      panelFlush('The programme',
        ...teams.map((t, i) => h('button', {
            class: `roster-row${t.id === this.teamId ? ' roster-row--on' : ''}`,
            on: { click: () => { this.teamId = t.id; this.paint(); } },
          },
          h('span', { class: 'roster-row__pos', text: String(i + 1) }),
          badge(t, 'sm'),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: `${t.city} ${t.name}` }),
            h('div', { class: 'roster-row__note tiny',
              text: `${t.arena} · ${IDENTITY_LABEL[t.identity].toLowerCase()}` })),
          h('span', { class: 'roster-row__ovr num', text: String(t.standing) })))),

      panel(`${team.city} ${team.name}`,
        h('div', { class: 'small', text: programmeBlurb(team) }),
        kvRow(
          ['Standing', String(team.standing)],
          ['Recruiting', String(team.recruiting)],
          ['Staff', String(team.coaching)],
        ),
        h('div', { class: 'tiny',
          text: 'A weaker programme is a harder dynasty and the table will say so. '
            + 'Everything about the rest of the world is generated from your save’s '
            + 'own seed, so the league you start is the league you finish.' })),

      panel('Difficulty',
        segmented<HoopsTier>(
          TIER_ORDER.map((t) => ({ value: t, label: TIERS[t].mark })),
          this.tier, (v) => { this.tier = v; this.paint(); }, true),
        h('div', { class: 'small', text: TIERS[this.tier].tagline }),
        h('div', { class: 'tiny', text: TIERS[this.tier].blurb }),
        h('div', { class: 'tiny',
          text: 'It changes what you can afford and who you can sign. It never gives a '
            + 'rival programme a rating it did not earn.' })),

      panel(null, bigButton('Take the job',
        `${team.city} · ${LEVELS[this.level].short} · ${TIERS[this.tier].name}`,
        () => this.begin())),
    );
  }

  private begin(): void {
    deleteHoopsCareer('dynasty');
    const career = createCareer({
      mode: 'dynasty', teamId: this.teamId, tier: this.tier,
    });
    saveHoopsCareer(career);
    this.app.replace((a) => new HoopsCareerHub(a, career));
  }
}

/* ----------------------------------------------------------- challenge */

export class ChallengeStartScreen implements Screen {
  el: HTMLElement;
  private tier: HoopsTier = 'standard';
  private offers: JobOffer[] | null = null;
  private body!: HTMLElement;

  constructor(private app: App) {
    this.el = screenEl(
      topbar(app, 'The climb', `${RUNGS.length} rungs, one coach`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private paint(): void {
    if (this.offers) { this.paintJobs(); return; }
    const info = TIERS[this.tier];
    const mods = modsFor(this.tier);
    const base = modsFor('standard');

    this.body.replaceChildren(
      panel('What this is',
        h('div', { class: 'small',
          text: `You start at ${rungAt(0).name} with the worst job in it, and there are `
            + `${RUNGS.length - 1} levels above you. You move up by WINNING THE `
            + 'CHAMPIONSHIP where you are — nothing else promotes you — and even then '
            + 'you only get interviews.' }),
        h('div', { class: 'tiny',
          text: RUNGS.map((r) => r.short).join(' → ') })),

      panel('Difficulty',
        segmented<HoopsTier>(
          TIER_ORDER.map((t) => ({ value: t, label: TIERS[t].mark })),
          this.tier, (v) => { this.tier = v; this.paint(); }, true),
        h('div', { class: 'small', text: info.tagline }),
        h('div', { class: 'tiny', text: info.blurb }),
        h('div', { class: 'tiny warn', text: info.expectation })),

      panelFlush('What changes, exactly',
        h('div', { class: 'prospect__open tiny',
          text: 'Difficulty never gives a rival programme a rating it did not earn. '
            + 'Every one of these is a resource or a decision, and every number here '
            + 'is the number the systems actually read.' }),
        ...MODIFIER_SPECS.map((spec) => {
          const mine = spec.pick(mods);
          const std = spec.pick(base);
          const harder = spec.higherIsHarder ? mine > std : mine < std;
          const same = mine === std;
          return h('div', { class: 'roster-row' },
            h('div', { class: 'roster-row__body' },
              h('div', { class: 'roster-row__name', text: spec.label }),
              h('div', { class: 'roster-row__note tiny', text: spec.blurb })),
            same ? pill('—', 'flat') : pill(harder ? 'HARDER' : 'EASIER', harder ? 'bad' : 'good'),
            h('span', { class: 'roster-row__ovr num', text: spec.show(mine) }));
        })),

      panel(null, bigButton('See who will have you', TIERS[this.tier].name,
        () => this.draw())),
    );
  }

  private draw(): void {
    const state = newChallengeState(0, 'rebuild',
      { winPct: 0.35, title: false, text: '' }, this.tier);
    const pool = rankedAtLevel(rungAt(0).level).map((t) => ({
      id: t.id, name: `${t.city} ${t.name}`, short: t.abbr, standing: t.standing,
    }));
    this.offers = generateOffers(
      state, 'rehire', pool, new Rng(`hoops:first:${Date.now()}`), 3, 0,
    );
    this.paint();
  }

  private paintJobs(): void {
    const offers = this.offers!;
    this.body.replaceChildren(
      panel('Nobody good is calling',
        h('div', { class: 'small',
          text: 'These are the three programmes willing to hand a first job to a coach '
            + 'with no record at all. The best of them is the one in the most trouble.' })),
      ...offers.map((o) => {
        const team = worldTeam(o.teamId);
        const sit = SITUATIONS[o.situation];
        return h('button', { class: 'job', on: { click: () => this.begin(o) } },
          h('div', { class: 'job__head' },
            badge(team),
            h('div', { class: 'job__name', text: `${team.city} ${team.name}` }),
            pill(String(o.standing), o.standing >= 55 ? 'good' : 'flat')),
          h('div', { class: 'job__note', text: `${sit.label}. ${sit.blurb}` }),
          h('div', { class: 'job__ask tiny', text: `The board: ${o.expectation.text}` }));
      }),
      h('button', { class: 'btn btn--ghost', text: 'Different difficulty',
        on: { click: () => { this.offers = null; this.paint(); } } }),
    );
  }

  private begin(o: JobOffer): void {
    deleteHoopsCareer('challenge');
    const career: HoopsCareer = createCareer({
      mode: 'challenge',
      teamId: o.teamId,
      tier: this.tier,
      situation: o.situation,
    });
    saveHoopsCareer(career);
    this.app.replace((a) => new HoopsCareerHub(a, career));
  }
}
