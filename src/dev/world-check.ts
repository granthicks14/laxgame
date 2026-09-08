import { WORLD_TEAMS, teamsAtLevel, conferencesAtLevel, teamsInConference, validateWorld, levelSpan, poolFor } from '../data/world';
import { LEVEL_ORDER, LEVELS } from '../data/levels';

const problems = validateWorld();
console.log('World validation:', problems.length ? problems : 'clean');
console.log(`\nTotal teams: ${WORLD_TEAMS.length}\n`);
for (const level of LEVEL_ORDER) {
  const teams = teamsAtLevel(level).sort((a, b) => a.overall - b.overall);
  const confs = conferencesAtLevel(level);
  const lo = teams[0];
  const hi = teams[teams.length - 1];
  const span = levelSpan(level);
  console.log(`${LEVELS[level].short.padEnd(6)} ${String(teams.length).padStart(3)} teams  ${confs.length} conf  team ovr ${span.min}-${span.max}  player pool ${Math.round(poolFor(lo, lo.overall))}-${Math.round(poolFor(hi, hi.overall))}`);
  console.log(`   weakest: ${lo.name} (${lo.overall})   strongest: ${hi.name} (${hi.overall})`);
  console.log('   ' + confs.map((c) => `${c.short}:${teamsInConference(c.id).length}`).join('  '));
}
