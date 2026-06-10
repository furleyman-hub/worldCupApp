import type { MergedMatch, Outcome, TableRow } from './types';

/**
 * Group tables. Two modes:
 *  - actual results: outcomes + goals from merged feed scores (FT incl. any
 *    stoppage; group matches have no extra time)
 *  - predicted: outcomes from a user's picks (no goals — W/D/L and points only)
 *
 * Sort: points, goal difference, goals for, then team name. (FIFA also applies
 * head-to-head and fair-play criteria; this is a documented simplification —
 * the real bracket always comes from the live feed, never from this table.)
 */
export function groupTables(
  matches: MergedMatch[],
  pickOutcome?: (num: number) => Outcome | undefined
): Record<string, TableRow[]> {
  const rows = new Map<string, TableRow>();
  const groupsOf = new Map<string, Set<string>>();

  for (const m of matches) {
    if (m.stage !== 'group') continue;
    for (const t of [m.team1!, m.team2!]) {
      if (!rows.has(t)) rows.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
      if (!groupsOf.has(m.group!)) groupsOf.set(m.group!, new Set());
      groupsOf.get(m.group!)!.add(t);
    }
    const outcome = pickOutcome ? pickOutcome(m.num) : m.outcome;
    if (!outcome) continue;
    const r1 = rows.get(m.team1!)!;
    const r2 = rows.get(m.team2!)!;
    r1.p++;
    r2.p++;
    if (!pickOutcome && m.score?.ft) {
      const [g1, g2] = m.score.ft;
      r1.gf += g1; r1.ga += g2;
      r2.gf += g2; r2.ga += g1;
    }
    if (outcome === 'team1') {
      r1.w++; r1.pts += 3; r2.l++;
    } else if (outcome === 'team2') {
      r2.w++; r2.pts += 3; r1.l++;
    } else {
      r1.d++; r2.d++; r1.pts++; r2.pts++;
    }
  }

  const tables: Record<string, TableRow[]> = {};
  for (const [g, teams] of groupsOf) {
    tables[g] = [...teams]
      .map((t) => {
        const r = rows.get(t)!;
        r.gd = r.gf - r.ga;
        return r;
      })
      .sort(
        (a, b) =>
          b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
      );
  }
  return tables;
}

/** All 6 matches of the group have a decided outcome. */
export function groupComplete(
  matches: MergedMatch[],
  group: string,
  pickOutcome?: (num: number) => Outcome | undefined
): boolean {
  return matches
    .filter((m) => m.stage === 'group' && m.group === group)
    .every((m) => (pickOutcome ? pickOutcome(m.num) : m.outcome) !== undefined);
}
