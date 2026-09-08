/** Prints what a squad actually looks like at each rung of the ladder. */
import { teamsAtLevel } from '../data/world';
import { LEVEL_ORDER, LEVELS } from '../data/levels';
import { generateRoster, starters } from '../data/players';

for (const level of LEVEL_ORDER) {
  const teams = teamsAtLevel(level).sort((a, b) => a.overall - b.overall);
  const pick = [teams[0], teams[Math.floor(teams.length / 2)], teams[teams.length - 1]];
  console.log(`\n== ${LEVELS[level].name}`);
  for (const t of pick) {
    const roster = generateRoster(t, 'ladder', level);
    const ten = starters(roster);
    const avg = ten.reduce((s, p) => s + p.overall, 0) / ten.length;
    const best = Math.max(...roster.map((p) => p.overall));
    const worst = Math.min(...ten.map((p) => p.overall));
    const gk = roster.find((p) => p.pos === 'G');
    console.log(`  ${t.name.padEnd(24)} ovr ${String(t.overall).padStart(2)}  starters avg ${avg.toFixed(1)} (${worst}-${best})  keeper ${gk?.overall}  squad ${roster.length}`);
  }
}
