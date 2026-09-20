import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { STAFF_LABELS, STAFF_ROLES, type Staff, type StaffRole } from './types';

/* ---------------------------------------------------------------------------
 * THE THREE MEN WHO COACH IT
 * ---------------------------------------------------------------------------
 * A head coach and two coordinators, and every number on all three of them does
 * something the franchise actually reads. There is no charisma rating here that
 * nothing consults and no "scheme fit" that resolves to a shrug.
 *
 * WHAT THEY ARE WORTH IS DELIBERATELY SMALL. A great offensive coordinator adds
 * five or six points across a unit — enough that you notice, never enough that
 * he plays quarterback for you. The players are the team. The staff is the
 * difference between a good roster and a good team, which is a real difference
 * and a modest one.
 *
 * Every coach in this game is invented, like every player.
 * ------------------------------------------------------------------------- */

const FIRST = [
  'Roy', 'Dan', 'Hal', 'Sam', 'Wes', 'Marv', 'Curt', 'Del', 'Ike', 'Ray',
  'Vince', 'Gus', 'Lem', 'Orrin', 'Bud', 'Clay', 'Tate', 'Ned', 'Ellis', 'Grady',
  'Milt', 'Chip', 'Rafe', 'Carl', 'Hutch', 'Ozzie', 'Barry', 'Dwight',
];
const LAST = [
  'Kessler', 'Trammell', 'Boone', 'Ferraro', 'Mackey', 'Quintero', 'Danforth',
  'Ojeda', 'Whitfield', 'Rasmussen', 'Bellamy', 'Cardoza', 'Stroud', 'Ivanov',
  'Pruitt', 'Larkin', 'Abiodun', 'Vachon', 'Spellman', 'Neuhaus', 'Cortese',
  'Danvers', 'Okonkwo', 'Radcliffe', 'Salinas', 'Thibault', 'Vogel', 'Wexler',
];

/** How the three numbers turn into one, per role. Evenly, because they matter evenly. */
export const staffOverall = (r: [number, number, number]): number =>
  Math.round((r[0] + r[1] + r[2]) / 3);

/** What a man of this quality costs, a season, out of the club's own money. */
export const staffSalary = (overall: number, role: StaffRole): number => {
  const base = role === 'HC' ? 1.6 : 0.9;
  return Math.round((base + ((clamp(overall, 40, 99) - 40) / 59) ** 1.9 * (role === 'HC' ? 9 : 5)) * 10) / 10;
};

export function makeStaff(seed: string, role: StaffRole, par: number): Staff {
  const rng = new Rng(`staff:${seed}`);
  const roll = (): number => Math.round(clamp(par + rng.gauss(0, 9), 32, 99));
  const ratings: [number, number, number] = [roll(), roll(), roll()];
  const overall = staffOverall(ratings);
  const age = rng.int(34, 66);
  return {
    id: `st:${seed}`,
    name: `${FIRST[rng.int(0, FIRST.length - 1)]} ${LAST[rng.int(0, LAST.length - 1)]}`,
    role,
    age,
    ratings,
    overall,
    salary: staffSalary(overall, role),
    yearsLeft: rng.int(2, 4),
    tenure: 0,
  };
}

/** The three a new franchise inherits, drawn around the club's own standing. */
export function startingStaff(seed: number, teamId: string, par: number): Record<StaffRole, Staff> {
  const out = {} as Record<StaffRole, Staff>;
  for (const role of STAFF_ROLES) out[role] = makeStaff(`${seed}:${teamId}:${role}:0`, role, par);
  return out;
}

/**
 * WHO IS AVAILABLE THIS SPRING.
 *
 * Two candidates per job, deterministic from the year, and they are not free:
 * a better coordinator than the one you have costs money that could have been a
 * medical wing instead. That trade-off is the whole feature.
 */
export function staffMarket(seed: number, year: number, par: number): Staff[] {
  const out: Staff[] = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 2; i++) {
      out.push(makeStaff(`${seed}:mkt:${year}:${role}:${i}`, role, par + (i === 0 ? 7 : -2)));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ effects */

/**
 * EVERYTHING THE STAFF CHANGES, in one object, so no other file has to know
 * which of a coordinator's three numbers means what.
 */
export interface Coaching {
  /** Attribute points added to the quarterback's accuracy and decisions. */
  passing: number;
  /** ...to receivers getting open. */
  routes: number;
  /** ...to the line holding up. */
  protection: number;
  /** ...to backs keeping hold of it. */
  carry: number;
  /** ...to the secondary's coverage. */
  coverage: number;
  /** ...to the front seven's tackling. */
  front: number;
  /** ...to everybody's awareness on defence, which is where takeaways come from. */
  takeaway: number;

  /* --- off the field ----------------------------------------------------- */
  /** Multiplier on how fast the squad develops. */
  development: number;
  /** And specifically on a quarterback, who is a different problem. */
  qbDevelopment: number;
  /** Points of morale a week, from a staff that holds a room together. */
  morale: number;
  /** 0-1. Discount on re-signing your own, and leverage in a trade. */
  management: number;
}

const pts = (rating: number, per: number): number =>
  Math.round(((clamp(rating, 30, 99) - 60) / per) * 10) / 10;

export function coachingOf(staff: Record<StaffRole, Staff>): Coaching {
  const hc = staff.HC.ratings;
  const oc = staff.OC.ratings;
  const dc = staff.DC.ratings;
  return {
    passing: pts(oc[0], 6),
    routes: pts(oc[0], 9),
    protection: pts(oc[1], 6),
    carry: pts(oc[1], 9),
    coverage: pts(dc[0], 6),
    front: pts(dc[1], 6),
    takeaway: pts(dc[2], 7),
    development: clamp(1 + (hc[1] - 56) / 150 + (oc[2] - 60) / 700, 0.82, 1.34),
    qbDevelopment: clamp(1 + (oc[2] - 56) / 110, 0.8, 1.5),
    morale: pts(hc[0], 14),
    management: clamp((hc[2] - 40) / 70, 0, 0.9),
  };
}

/** The line a screen shows under a coach's name. */
export function staffLine(s: Staff): string {
  const labels = STAFF_LABELS[s.role];
  return labels.map((l, i) => `${l} ${s.ratings[i]}`).join(' · ');
}

/** Older men do not get better; younger ones can. Called once a year. */
export function ageStaff(staff: Record<StaffRole, Staff>, rng: Rng): string[] {
  const notes: string[] = [];
  for (const role of STAFF_ROLES) {
    const s = staff[role];
    s.age += 1;
    s.tenure += 1;
    s.yearsLeft = Math.max(0, s.yearsLeft - 1);
    /* A COORDINATOR LEARNS HIS TRADE AND THEN STOPS. Under fifty he can add a
     * point or two a year; past sixty he starts losing them, which is what
     * eventually forces a change nobody wanted to make. */
    const drift = s.age < 50 ? rng.range(-0.4, 1.6)
      : s.age < 60 ? rng.range(-0.6, 0.8)
        : rng.range(-1.4, 0.4);
    const before = s.overall;
    /* A FLOOR. A coordinator who has drifted to thirty is not a coordinator any
     * more, and a franchise that lets one sit there for a decade is a franchise
     * losing games to a number nobody looked at. He gets old and worse; he does
     * not evaporate. The club replaces him, which is what the market is for. */
    s.ratings = s.ratings.map((r) => Math.round(clamp(r + drift, 40, 99))) as [number, number, number];
    s.overall = staffOverall(s.ratings);
    s.salary = staffSalary(s.overall, role);
    if (s.overall - before >= 3) notes.push(`${s.name} is coaching better than he was.`);
    if (before - s.overall >= 3) notes.push(`${s.name} is starting to slip.`);
  }
  return notes;
}
