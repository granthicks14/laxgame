/** Prints the difficulty comparison as markdown, from the table the game reads. */
import { MODIFIER_SPECS, TIERS, TIER_ORDER } from '../challenge/difficulty';

const head = ['', ...TIER_ORDER.map((t) => TIERS[t].name)];
console.log(`| ${head.join(' | ')} |`);
console.log(`| ${head.map(() => '---').join(' | ')} |`);
for (const spec of MODIFIER_SPECS) {
  const cells = TIER_ORDER.map((t) => spec.format(TIERS[t].mods[spec.field]));
  console.log(`| ${spec.label} | ${cells.join(' | ')} |`);
}
