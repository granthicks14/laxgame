/** Difficulty tunes AI DECISION QUALITY, not raw attributes. Higher levels react
 *  sooner, aim better, slide smarter and pick better shots — they never get free
 *  speed or magic accuracy the player cannot match. */
export type DifficultyKey = 'rookie' | 'varsity' | 'allstate' | 'elite';

export interface DifficultyProfile {
  key: DifficultyKey;
  label: string;
  blurb: string;
  /** Seconds of delay before the AI reacts to a new situation. */
  reaction: number;
  /** Radians of aim error added to AI passes and shots. */
  aimNoise: number;
  /** 0..1 — chance an AI takes the genuinely best option instead of a decent one. */
  decisionQuality: number;
  /** Yards the defender tries to stay off their mark. Lower = tighter. */
  markDistance: number;
  /** Yards from the ball at which an off-ball defender commits to a slide. */
  slideTrigger: number;
  /** Multiplier on AI goalie reaction speed. */
  goalieReaction: number;
  /** Multiplier on how much of the cage an AI goalie covers. */
  goalieReach: number;
  /** Multiplier on AI check timing precision. */
  checkTiming: number;
  /** Shot-quality threshold the AI needs before it pulls the trigger. Lower means
   *  greedier and worse shot selection; higher means it waits for a real look. */
  shotGreed: number;
  /** Multiplier applied to the AI's faceoff clamp window. */
  faceoffSkill: number;
  /** Score multiplier for dynasty prestige earned. */
  rewardMultiplier: number;
}

export const DIFFICULTIES: Record<DifficultyKey, DifficultyProfile> = {
  rookie: {
    key: 'rookie', label: 'Rookie',
    blurb: 'Forgiving. Defenders give you room and the goalie bites on fakes.',
    reaction: 0.42, aimNoise: 0.15, decisionQuality: 0.42, markDistance: 3.4, slideTrigger: 5.5,
    goalieReaction: 0.72, goalieReach: 0.86, checkTiming: 0.55, shotGreed: 0.115, faceoffSkill: 0.78, rewardMultiplier: 0.6,
  },
  varsity: {
    key: 'varsity', label: 'Varsity',
    blurb: 'The intended experience. Good defense, punishes lazy passes.',
    reaction: 0.26, aimNoise: 0.095, decisionQuality: 0.62, markDistance: 2.6, slideTrigger: 6.5,
    goalieReaction: 0.88, goalieReach: 1.0, checkTiming: 0.75, shotGreed: 0.185, faceoffSkill: 0.94, rewardMultiplier: 1.0,
  },
  allstate: {
    key: 'allstate', label: 'All-State',
    blurb: 'Sharp slides, tight marks, and goalies who read your hands.',
    reaction: 0.16, aimNoise: 0.06, decisionQuality: 0.8, markDistance: 2.0, slideTrigger: 7.5,
    goalieReaction: 1.0, goalieReach: 1.08, checkTiming: 0.9, shotGreed: 0.225, faceoffSkill: 1.06, rewardMultiplier: 1.35,
  },
  elite: {
    key: 'elite', label: 'Elite',
    blurb: 'Everything is contested. You will have to earn every single goal.',
    reaction: 0.09, aimNoise: 0.035, decisionQuality: 0.93, markDistance: 1.6, slideTrigger: 8.5,
    goalieReaction: 1.1, goalieReach: 1.16, checkTiming: 1.0, shotGreed: 0.25, faceoffSkill: 1.16, rewardMultiplier: 1.8,
  },
};

export const DIFFICULTY_ORDER: DifficultyKey[] = ['rookie', 'varsity', 'allstate', 'elite'];
