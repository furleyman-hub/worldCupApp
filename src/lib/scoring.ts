import type { MergedMatch, Picks } from './types';
import { resolveBracket } from './bracket';

/**
 * Leaderboard scoring — 200 points max, "round-reach" membership for the
 * knockout phase (slot-independent, so FIFA's third-place slot-assignment
 * annex can't cause unfair mismatches between predicted and actual brackets):
 *
 *   correct group match result (W/D/W) ... 1 pt x 72
 *   team reaching the Round of 16 ........ 2 pt x 16
 *   team reaching the Quarter-finals ..... 4 pt x 8
 *   team reaching the Semi-finals ........ 6 pt x 4
 *   team reaching the Final .............. 10 pt x 2
 *   champion ............................. 20 pt
 */
export const POINTS = { group: 1, r16: 2, qf: 4, sf: 6, final: 10, champion: 20 } as const;

export interface ScoreBreakdown {
  total: number;
  group: number;
  groupCorrect: number;
  groupDecided: number;
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
  // group stage: compare picked result to actual result
  let groupCorrect = 0;
  let groupDecided = 0;
  for (const m of matches) {
    if (m.stage !== 'group' || !m.outcome) continue;
    groupDecided++;
    if (picks.group[String(m.num)] === m.outcome) groupCorrect++;
  }

  // knockout: set-membership per round reached
  const predicted = resolveBracket(matches, {
    pickOutcome: (num) => picks.group[String(num)],
    pickWinner: (num) => picks.knockout[String(num)]
  });
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
    group: groupCorrect * POINTS.group,
    groupCorrect,
    groupDecided,
    r16: [],
    qf: [],
    sf: [],
    final: [],
    champion: null
  };
  breakdown.total = breakdown.group;

  for (const r of rounds) {
    const actual = actualWinners(matches, r.lo, r.hi);
    const mine = predictedWinners(pp, picks, r.lo, r.hi);
    for (const team of mine) {
      if (actual.has(team)) {
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
