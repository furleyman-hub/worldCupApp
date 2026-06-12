export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';

export interface ScheduleMatch {
  num: number;
  stage: Stage;
  group?: string;
  dateUtc: string;
  etDisplay: string;
  city: string;
  team1?: string;
  team2?: string;
  slot1?: string;
  slot2?: string;
}

/** openfootball score object: {ht,ft,et,p} as [home,away] pairs */
export interface Score {
  ht?: [number, number];
  ft?: [number, number];
  et?: [number, number];
  p?: [number, number];
}

export type Outcome = 'team1' | 'draw' | 'team2';

export interface MergedMatch extends ScheduleMatch {
  kickoff: number;
  /** knockout slots resolved to real team names (from feed or computed) */
  resolved1?: string;
  resolved2?: string;
  score?: Score;
  /** final outcome; knockout matches never end 'draw' (ET + penalties decide) */
  outcome?: Outcome;
  /** winner team name, when known */
  winnerTeam?: string;
  /** in-progress (or just-finished) score from the live feed */
  live?: { score: [number, number]; clock: string; finished: boolean };
}

export interface Picks {
  /** group letter -> the group's 4 teams in predicted finishing order */
  groupOrder: Record<string, string[]>;
  /** the 8 third-place teams predicted to advance to the Round of 32 */
  thirds: string[];
  /** match num (73..102, 104) -> predicted winner team name */
  knockout: Record<string, string>;
  updatedAt?: number;
}

export function emptyPicks(): Picks {
  return { groupOrder: {}, thirds: [], knockout: {} };
}

export function isEmptyPicks(p: Picks): boolean {
  return (
    Object.keys(p.groupOrder).length === 0 &&
    p.thirds.length === 0 &&
    Object.keys(p.knockout).length === 0
  );
}

export interface UserInfo {
  uid: string;
  displayName: string;
  joinedAt: number;
}

export interface TableRow {
  team: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}
