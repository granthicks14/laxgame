/**
 * Scouting and recruiting harness. Answers the questions the design depends on:
 *
 *   - how often is a hidden gem actually hidden, and how often is a ranking a lie?
 *   - does scouting genuinely close the gap between what you think and what is true?
 *   - do AI programmes find gems on their own, or only the ones you leave alone?
 *   - can a coach farm gems every year, or is the budget a real constraint?
 *
 *   npm run scouting
 */
import { Rng } from '../core/rng';
import { buildClass, estimateOf, levelPar } from '../scouting/prospects';
import {
  advanceRecruitingWeek, assignScout, board, classGrade, hireScout, makeOffer,
  newRecruitingClass, signingDay, type RecruitContext,
} from '../scouting/recruiting';
import { getTeam } from '../data/teams';
import { worldTeam } from '../data/world';
import type { Level } from '../data/levels';
import type { Position } from '../data/constants';

const line = (s = '') => console.log(s);
const pct = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`;

/* 1. Class composition ---------------------------------------------------- */

line('CLASS COMPOSITION — 40 classes, D-I');
{
  let total = 0; let gems = 0; let busts = 0;
  let hypeErr = 0;
  const shell = worldTeam('syracuse');
  for (let i = 0; i < 40; i++) {
    for (const p of buildClass(`t${i}`, { level: 'd1', size: 28, origin: 'hs', shell })) {
      total++;
      if (p.gem) gems++;
      if (p.overrated) busts++;
      hypeErr += Math.abs(p.hype - (p.player.potential * 0.55 + p.player.overall * 0.45));
    }
  }
  line(`  prospects            ${total}`);
  line(`  hidden gems          ${gems} (${pct(gems, total)})`);
  line(`  overrated            ${busts} (${pct(busts, total)})`);
  line(`  avg ranking error    ${(hypeErr / total).toFixed(1)} overall points`);
}

/* 2. Does scouting actually reveal? ---------------------------------------- */

line();
line('FOG OF WAR — error between your estimate and the truth');
{
  const shell = worldTeam('syracuse');
  const prospects = buildClass('fog', { level: 'd1', size: 28, origin: 'hs', shell });
  const par = levelPar('d1');
  for (const scouted of [0, 25, 50, 75, 100]) {
    let err = 0;
    for (const p of prospects) {
      p.scouted = scouted;
      err += Math.abs(estimateOf(p, par).potential - p.player.potential);
    }
    line(`  scouted ${String(scouted).padStart(3)}%   avg error ${(err / prospects.length).toFixed(1)} points`);
  }
}

/* 3. A full cycle, with and without scouts --------------------------------- */

function cycle(level: Level, teamId: string, scouts: number, seed: number): {
  signed: number; avgOvr: number; gems: number; busts: number; grade: string;
} {
  const shell = level === 'hs' ? getTeam(teamId) : worldTeam(teamId);
  const state = newRecruitingClass({ seed, cycle: 1, level, prestige: 70, shell });
  const depth = { A: 3, M: 5, D: 4, G: 1, FO: 1 } as Record<Position, number>;
  const ctx: RecruitContext = {
    teamId,
    teamName: shell.short,
    prestige: 70,
    appeal: 0.3,
    wins: 8,
    losses: 4,
    championships: 1,
    depth,
    rivals: [
      { id: 'r1', name: 'Rival A', recruiting: 82 },
      { id: 'r2', name: 'Rival B', recruiting: 74 },
      { id: 'r3', name: 'Rival C', recruiting: 66 },
      { id: 'r4', name: 'Rival D', recruiting: 58 },
      { id: 'r5', name: 'Rival E', recruiting: 50 },
    ],
  };

  for (let i = 0; i < scouts && state.market.length; i++) hireScout(state, state.market[0].id);

  const par = levelPar(level);
  for (let week = 0; week < 14; week++) {
    // Confirm the tips first, then work down the rankings — which is what a
    // coach with scouts he trusts actually does.
    const tipped = board(state, teamId, 'scouting').filter((p) => p.scouted < 55);
    const targets = [...tipped, ...board(state, teamId, 'targets')];
    for (const s of state.scouts) {
      if (s.assignedTo) {
        const cur = state.prospects.find((x) => x.id === s.assignedTo);
        if (cur && !cur.committedTo && cur.scouted < 70) continue;
      }
      const next = targets.find((p) => p.scouted < 55 && !state.scouts.some((o) => o.assignedTo === p.id));
      if (next) assignScout(state, s.id, next.id);
    }
    const ranked = [...state.prospects]
      .filter((p) => !p.committedTo && !p.offered && (scouts ? p.scouted >= 45 : true))
      .sort((a, b) => estimateOf(b, par).potential - estimateOf(a, par).potential);
    // Hold two back: the player you have not found yet is usually the best one.
    const floor = week < 8 ? 2 : 0;
    for (const p of ranked) {
      if (state.offersLeft <= floor) break;
      makeOffer(state, p.id);
    }
    advanceRecruitingWeek(state, ctx, `s${seed}`);
  }

  const mine = state.prospects.filter((p) => p.committedTo === teamId);
  signingDay(state, teamId);
  return {
    signed: mine.length,
    avgOvr: mine.length ? mine.reduce((n, p) => n + p.player.potential, 0) / mine.length : 0,
    gems: mine.filter((p) => p.gem).length,
    busts: mine.filter((p) => p.overrated).length,
    grade: classGrade(state, teamId).grade,
  };
}

line();
line('A FULL CYCLE — D-I, 20 classes each');
for (const scouts of [0, 1, 3, 5]) {
  const runs = Array.from({ length: 20 }, (_, i) => cycle('d1', 'syracuse', scouts, 900 + i * 31));
  const avg = (f: (r: ReturnType<typeof cycle>) => number) =>
    (runs.reduce((n, r) => n + f(r), 0) / runs.length).toFixed(2);
  line(`  ${scouts} scout(s):  signed ${avg((r) => r.signed)}  avg ceiling ${avg((r) => r.avgOvr)}  `
    + `gems/class ${avg((r) => r.gems)}  busts/class ${avg((r) => r.busts)}`);
}

line();
line('AI PROGRAMMES — do gems get taken if you leave them alone?');
{
  const shell = worldTeam('syracuse');
  let taken = 0; let total = 0;
  for (let i = 0; i < 20; i++) {
    const state = newRecruitingClass({ seed: 5000 + i, cycle: 1, level: 'd1', prestige: 40, shell });
    const ctx: RecruitContext = {
      teamId: 'me', teamName: 'Me', prestige: 40, appeal: 0, wins: 2, losses: 10, championships: 0,
      depth: { A: 6, M: 9, D: 8, G: 3, FO: 2 } as Record<Position, number>,
      rivals: [
        { id: 'r1', name: 'A', recruiting: 88 }, { id: 'r2', name: 'B', recruiting: 80 },
        { id: 'r3', name: 'C', recruiting: 72 }, { id: 'r4', name: 'D', recruiting: 64 },
      ],
    };
    for (let w = 0; w < 14; w++) advanceRecruitingWeek(state, ctx, `ai${i}`);
    for (const p of state.prospects) {
      if (!p.gem) continue;
      total++;
      if (p.committedTo && p.committedTo !== 'me') taken++;
    }
  }
  line(`  gems committed elsewhere while you did nothing: ${taken}/${total} (${pct(taken, total)})`);
}

line();
line('BUDGET — a scout costs the same points as your staff');
{
  const rng = new Rng('budget');
  void rng;
  for (const level of ['hs', 'd3', 'd1', 'pll'] as Level[]) {
    const shell = level === 'hs' ? getTeam('highland-park') : worldTeam(level === 'd3' ? 'cortland' : level === 'd1' ? 'syracuse' : 'pll-archers');
    const state = newRecruitingClass({ seed: 1, cycle: 1, level, prestige: 70, shell });
    const cheapest = [...state.market].sort((a, b) => a.salary - b.salary)[0];
    const best = [...state.market].sort((a, b) => b.quality - a.quality)[0];
    line(`  ${level.padEnd(8)} offers ${state.offersLeft}  class ${state.prospects.length}  `
      + `scouts ${cheapest.salary}-${best.salary} CP/yr, best available quality ${best.quality}`);
  }
}
