import type { MergedMatch, Picks } from './types';
import { resolveBracket, resolvePickedBracket } from './bracket';
import { groupComplete, groupTables } from './standings';

/**
 * Leaderboard scoring — 192 points max, "round-reach" membership for the
 * knockout phase (slot-independent, so FIFA's third-place slot-assignment
 * annex can't cause unfair mismatches between predicted and actual brackets):
 *
 *   team in its exact group finishing position .. 1 pt x 48
 *   correct third-place qualifier ............... 2 pt x 8
 *   team reaching the Round of 16 ............... 2 pt x 16
 *   team reaching the Quarter-finals ............ 4 pt x 8
 *   team reaching the Semi-finals ............... 6 pt x 4
 *   team reaching the Final ..................... 10 pt x 2
 *   champion .................................... 20 pt
 */
export const POINTS = { position: 1, third: 2, r16: 2, qf: 4, sf: 6, final: 10, champion: 20 } as const;

export interface ScoreBreakdown {
  total: number;
  /** group position points */
  position: number;
  positionCorrect: number;
  /** positions scored so far = 4 x completed groups */
  positionDecided: number;
  /** correctly predicted third-place qualifiers */
  thirds: string[];
  r16: string[];
  qf: string[];
  sf: string[];
  final: string[];
  champion: string | null;
}

/** Winners of every match in a numeric range, from the actual results. */
function actualWinners(matches: MergedMatch[], lo: number, hi: number): Set<string> {
  const s = new Set<string>();
  for (const m of matches) {
    if (m.num >= lo && m.num <= hi && m.winnerTeam) s.add(m.winnerTeam);
  }
  return s;
}

/** Valid (chain-consistent) predicted winners in a numeric range. */
function predictedWinners(
  participants: Record<number, [string | null, string | null]>,
  picks: Picks,
  lo: number,
  hi: number
): Set<string> {
  const s = new Set<string>();
  for (let n = lo; n <= hi; n++) {
    const w = picks.knockout[String(n)];
    const p = participants[n];
    if (w && p && (p[0] === w || p[1] === w)) s.add(w);
  }
  return s;
}

export function computeScore(picks: Picks, matches: MergedMatch[]): ScoreBreakdown {
  // group stage: exact finishing position, scored once a group completes
  const tables = groupTables(matches);
  let positionCorrect = 0;
  let positionDecided = 0;
  for (const [g, rows] of Object.entries(tables)) {
    if (!groupComplete(matches, g)) continue;
    positionDecided += rows.length;
    const order = picks.groupOrder[g] || [];
    rows.forEach((r, i) => {
      if (order[i] === r.team) positionCorrect++;
    });
  }

  // third-place qualifiers: scored once all groups are decided
  const actual = resolveBracket(matches);
  const actualThirds = new Set(actual.thirdQualifiers);
  const thirds = picks.thirds.filter((t) => actualThirds.has(t)).sort();

  // knockout: set-membership per round reached
  const predicted = resolvePickedBracket(matches, picks);
  const pp = predicted.participants;

  // matches 73-88 = R32 (winners reach R16), 89-96 = R16, 97-100 = QF,
  // 101-102 = SF, 104 = final (103 third-place match is not scored)
  const rounds = [
    { key: 'r16' as const, lo: 73, hi: 88, pts: POINTS.r16 },
    { key: 'qf' as const, lo: 89, hi: 96, pts: POINTS.qf },
    { key: 'sf' as const, lo: 97, hi: 100, pts: POINTS.sf },
    { key: 'final' as const, lo: 101, hi: 102, pts: POINTS.final }
  ];

  const breakdown: ScoreBreakdown = {
    total: 0,
    position: positionCorrect * POINTS.position,
    positionCorrect,
    positionDecided,
    thirds,
    r16: [],
    qf: [],
    sf: [],
    final: [],
    champion: null
  };
  breakdown.total = breakdown.position + thirds.length * POINTS.third;

  for (const r of rounds) {
    const won = actualWinners(matches, r.lo, r.hi);
    const mine = predictedWinners(pp, picks, r.lo, r.hi);
    for (const team of mine) {
      if (won.has(team)) {
        breakdown[r.key].push(team);
        breakdown.total += r.pts;
      }
    }
    breakdown[r.key].sort();
  }

  const actualChampion = [...actualWinners(matches, 104, 104)][0];
  const myChampion = [...predictedWinners(pp, picks, 104, 104)][0];
  if (actualChampion && myChampion && actualChampion === myChampion) {
    breakdown.champion = actualChampion;
    breakdown.total += POINTS.champion;
  }
  return breakdown;
}
