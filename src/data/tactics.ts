/** Coaching tactics the player sets from the team management screen. These feed
 *  straight into the match AI — they are not cosmetic. */

export type OffenseStyle = 'balanced' | 'fast' | 'possession' | 'aggressive';
export type DefenseStyle = 'balanced' | 'aggressive' | 'conservative';

export interface OffenseProfile {
  key: OffenseStyle;
  label: string;
  blurb: string;
  /** How far up the field off-ball attackers push. */
  spacing: number;
  /** Chance per opportunity that a teammate makes a hard cut to the crease. */
  cutRate: number;
  /** Multiplier on how quickly AI teammates look to shoot. */
  shotGreed: number;
  /** Multiplier on transition (fast-break) push after a turnover. */
  transition: number;
  /** Bonus/penalty to pass accuracy. */
  passBonus: number;
}

export interface DefenseProfile {
  key: DefenseStyle;
  label: string;
  blurb: string;
  /** Yards off the mark. Lower = tighter, more check attempts, more beaten defenders. */
  markDistance: number;
  /** Multiplier on check attempt frequency. */
  checkRate: number;
  /** Yards from the ball at which help defenders slide. */
  slideTrigger: number;
  /** How hard defenders protect the crease vs pressure the ball. */
  creaseBias: number;
}

export const OFFENSE_STYLES: Record<OffenseStyle, OffenseProfile> = {
  balanced: {
    key: 'balanced', label: 'Balanced',
    blurb: 'Even spacing, sensible shots. Works against anybody.',
    spacing: 1.0, cutRate: 0.5, shotGreed: 1.0, transition: 1.0, passBonus: 0,
  },
  fast: {
    key: 'fast', label: 'Fast Break',
    blurb: 'Push in transition, cut early, shoot early. High variance.',
    spacing: 1.12, cutRate: 0.78, shotGreed: 1.3, transition: 1.45, passBonus: -3,
  },
  possession: {
    key: 'possession', label: 'Possession',
    blurb: 'Hold the ball, work the perimeter, wait for a real look.',
    spacing: 1.15, cutRate: 0.34, shotGreed: 0.62, transition: 0.7, passBonus: +5,
  },
  aggressive: {
    key: 'aggressive', label: 'Attack the Cage',
    blurb: 'Dodge relentlessly and crash the crease. Draws slides, creates chaos.',
    spacing: 0.85, cutRate: 0.68, shotGreed: 1.18, transition: 1.12, passBonus: -1,
  },
};

export const DEFENSE_STYLES: Record<DefenseStyle, DefenseProfile> = {
  balanced: {
    key: 'balanced', label: 'Balanced',
    blurb: 'Solid marks, help on time, protect the middle.',
    markDistance: 2.4, checkRate: 1.0, slideTrigger: 6.5, creaseBias: 1.0,
  },
  aggressive: {
    key: 'aggressive', label: 'Pressure',
    blurb: 'Tight marks and constant checks. Forces turnovers — and gets beaten.',
    markDistance: 1.5, checkRate: 1.7, slideTrigger: 7.8, creaseBias: 0.78,
  },
  conservative: {
    key: 'conservative', label: 'Pack It In',
    blurb: 'Sag off, clog the crease, make them shoot from outside.',
    markDistance: 3.4, checkRate: 0.55, slideTrigger: 5.0, creaseBias: 1.35,
  },
};

export interface Tactics {
  offense: OffenseStyle;
  defense: DefenseStyle;
}

export const DEFAULT_TACTICS: Tactics = { offense: 'balanced', defense: 'balanced' };
