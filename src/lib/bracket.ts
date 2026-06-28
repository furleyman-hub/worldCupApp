import type { MergedMatch, Picks, TableRow } from './types';
import { groupComplete, groupTables } from './standings';

/**
 * Resolve knockout slot placeholders to team names.
 *
 * Slot grammar (from the schedule): "1A" group winner, "2B" runner-up,
 * "3A/B/C/D/F" one of the listed groups' third-place qualifiers,
 * "W89"/"L101" winner/loser of a match.
 *
 * Two sources:
 *  - ACTUAL bracket: live feed names (resolved1/2) win; computation covers the
 *    gap between a group finishing and the feed maintainer updating slots.
 *  - PREDICTED bracket: a user's picks — group finishing orders, their 8
 *    third-place qualifiers, and their picked knockout winners.
 */
export interface BracketResolution {
  /** match num -> [team1 name | null, team2 name | null] */
  participants: Record<number, [string | null, string | null]>;
  /** the 8 third-place qualifiers (for UI) */
  thirdQualifiers: string[];
  /** true when the third-place slots are a provisional best-guess (fewer than
   *  all 12 groups finished) rather than mathematically final */
  thirdsProvisional: boolean;
}

interface ThirdQualifier {
  team: string;
  group: string;
}

/**
 * Actual bracket from completed groups + live feed results.
 *
 * The best-8 third-place qualifiers can only be RANKED once all 12 groups
 * finish. With `provisionalThirds`, the bracket fills the third-place slots
 * as soon as 8 groups are done (using a provisional best-8 of the finished
 * groups, refining as more finish) so the display updates through the last
 * days of the group stage. Scoring leaves this off, so points never count a
 * third-place qualifier until the standings are mathematically final.
 */
export function resolveBracket(
  matches: MergedMatch[],
  opts: { provisionalThirds?: boolean } = {}
): BracketResolution {
  const tables = groupTables(matches);

  // Rank of finished groups only — an in-progress table must not feed the bracket.
  const placed = new Map<string, string>(); // "1A" -> team
  const thirds: { team: string; group: string; row: TableRow }[] = [];
  for (const g of Object.keys(tables)) {
    if (!groupComplete(matches, g)) continue;
    const t = tables[g];
    placed.set(`1${g}`, t[0].team);
    placed.set(`2${g}`, t[1].team);
    thirds.push({ team: t[2].team, group: g, row: t[2] });
  }

  // Best 8 third-place teams qualify (ranked like a table). Final at 12 groups;
  // provisional once 8+ are in when the caller opts in.
  let thirdQualifiers: ThirdQualifier[] = [];
  let thirdsProvisional = false;
  if (thirds.length === 12 || (opts.provisionalThirds && thirds.length >= 8)) {
    thirds.sort(
      (a, b) =>
        b.row.pts - a.row.pts ||
        b.row.gd - a.row.gd ||
        b.row.gf - a.row.gf ||
        a.team.localeCompare(b.team)
    );
    thirdQualifiers = thirds.slice(0, 8);
    thirdsProvisional = thirds.length < 12;
  }

  const byNum = new Map(matches.map((m) => [m.num, m]));
  return buildBracket(matches, placed, thirdQualifiers, thirdsProvisional, {
    useFeed: true,
    winnerOf: (num, participants) => {
      void participants;
      return byNum.get(num)?.winnerTeam ?? null;
    }
  });
}

/** Predicted bracket from a user's group orders, thirds and knockout picks. */
export function resolvePickedBracket(matches: MergedMatch[], picks: Picks): BracketResolution {
  const placed = new Map<string, string>();
  for (const [g, order] of Object.entries(picks.groupOrder)) {
    if (!order || order.length < 4) continue; // incomplete order places nobody
    placed.set(`1${g}`, order[0]);
    placed.set(`2${g}`, order[1]);
  }

  // A picked third only counts while it is still the 3rd of its group's order.
  const valid = pickableThirds(picks);
  const thirdQualifiers = picks.thirds
    .map((team) => ({ team, group: valid.get(team)! }))
    .filter((t) => t.group);

  return buildBracket(matches, placed, thirdQualifiers.length === 8 ? thirdQualifiers : [], false, {
    useFeed: false,
    winnerOf: (num, participants) => {
      // A pick only counts while it is still one of the match's resolved
      // participants — stale picks (after upstream edits) must not propagate.
      const w = picks.knockout[String(num)];
      const p = participants[num];
      if (!w || !p) return null;
      return p[0] === w || p[1] === w ? w : null;
    }
  });
}

/** team -> group for every team currently 3rd in a complete group order. */
export function pickableThirds(picks: Picks): Map<string, string> {
  const m = new Map<string, string>();
  for (const [g, order] of Object.entries(picks.groupOrder)) {
    if (order && order.length === 4) m.set(order[2], g);
  }
  return m;
}

/** The user's champion pick, if it is still consistent with their bracket. */
export function predictedChampion(matches: MergedMatch[], picks: Picks): string | null {
  const c = picks.knockout['104'];
  if (!c) return null;
  const p = resolvePickedBracket(matches, picks).participants[104];
  return p && (p[0] === c || p[1] === c) ? c : null;
}

// Knockout rounds by match-number range; the winner of a match in each range
// is a team the user picked to ADVANCE out of that round.
const KO_ROUNDS: [number, number][] = [
  [73, 88], // R32 winners -> reach R16
  [89, 96], // R16 -> QF
  [97, 100], // QF -> SF
  [101, 102], // SF -> Final
  [104, 104] // Final -> champion
];

/**
 * For each knockout match, the set of teams the user picked to advance out of
 * that match's round — keyed by round, NOT by slot. Because a team lands in
 * different slots in the predicted vs actual bracket, the comparison must be
 * by team-and-round (the same slot-independent basis the pool scores on): your
 * champion is flagged in whatever actual match they really turn up in.
 */
export function pickedRoundAdvancers(
  matches: MergedMatch[],
  picks: Picks
): (num: number) => Set<string> {
  const pred = resolvePickedBracket(matches, picks);
  const empty = new Set<string>();
  const sets = KO_ROUNDS.map(([lo, hi]) => {
    const s = new Set<string>();
    for (let n = lo; n <= hi; n++) {
      const w = picks.knockout[String(n)];
      const p = pred.participants[n];
      // count a pick only while it's still one of that match's predicted teams
      if (w && p && (p[0] === w || p[1] === w)) s.add(w);
    }
    return { lo, hi, s };
  });
  return (num) => sets.find((r) => num >= r.lo && num <= r.hi)?.s ?? empty;
}

function buildBracket(
  matches: MergedMatch[],
  placed: Map<string, string>,
  thirdQualifiers: ThirdQualifier[],
  thirdsProvisional: boolean,
  opts: {
    useFeed: boolean;
    winnerOf: (
      num: number,
      participants: Record<number, [string | null, string | null]>
    ) => string | null;
  }
): BracketResolution {
  // Assign third-place qualifiers to constrained slots like "3A/B/C/D/F":
  // backtracking over 8 slots x 8 teams, honoring each slot's allowed groups.
  const thirdSlots = matches
    .filter((m) => m.stage === 'r32' && m.slot2 && m.slot2.startsWith('3'))
    .map((m) => ({ num: m.num, allowed: parseThirdSlot(m.slot2!) }));
  const thirdAssign = new Map<number, string>(); // match num -> team
  if (thirdQualifiers.length === 8 && thirdSlots.length === 8) {
    const used = new Array(8).fill(false);
    const pick: number[] = new Array(8).fill(-1);
    const solve = (i: number): boolean => {
      if (i === 8) return true;
      for (let j = 0; j < 8; j++) {
        if (used[j] || !thirdSlots[i].allowed.has(thirdQualifiers[j].group)) continue;
        used[j] = true;
        pick[i] = j;
        if (solve(i + 1)) return true;
        used[j] = false;
      }
      return false;
    };
    if (solve(0)) {
      thirdSlots.forEach((s, i) => thirdAssign.set(s.num, thirdQualifiers[pick[i]].team));
    }
  }

  const participants: Record<number, [string | null, string | null]> = {};

  const loserOf = (num: number): string | null => {
    const p = participants[num];
    const w = opts.winnerOf(num, participants);
    if (!p || !w) return null;
    if (p[0] === w) return p[1];
    if (p[1] === w) return p[0];
    return null;
  };

  const resolveSlot = (m: MergedMatch, slot: string, side: 0 | 1, num: number): string | null => {
    // Live feed names take precedence for the actual bracket.
    if (opts.useFeed) {
      const fromFeed = side === 0 ? m.resolved1 : m.resolved2;
      if (fromFeed) return fromFeed;
    }
    if (/^[12][A-L]$/.test(slot)) return placed.get(slot) ?? null;
    if (slot.startsWith('3')) return thirdAssign.get(num) ?? null;
    const wl = /^([WL])(\d+)$/.exec(slot);
    if (wl)
      return wl[1] === 'W' ? opts.winnerOf(Number(wl[2]), participants) : loserOf(Number(wl[2]));
    return null;
  };

  // Knockout matches are numbered in stage order, so one pass suffices.
  for (const m of matches) {
    if (m.stage === 'group') continue;
    participants[m.num] = [
      resolveSlot(m, m.slot1!, 0, m.num),
      resolveSlot(m, m.slot2!, 1, m.num)
    ];
  }

  return { participants, thirdQualifiers: thirdQualifiers.map((t) => t.team), thirdsProvisional };
}

function parseThirdSlot(slot: string): Set<string> {
  // "3A/B/C/D/F" -> {A,B,C,D,F}
  return new Set(slot.slice(1).split('/'));
}

/**
 * Display order for the graphical bracket: columns r32..final, where each
 * column is ordered so winners feed the adjacent match in the next column.
 * Derived from the W-codes, starting from the final and expanding backwards.
 */
export function bracketColumns(matches: MergedMatch[]): MergedMatch[][] {
  const byNum = new Map(matches.map((m) => [m.num, m]));
  const stages: ('r32' | 'r16' | 'qf' | 'sf' | 'final')[] = ['r32', 'r16', 'qf', 'sf', 'final'];
  const cols: MergedMatch[][] = stages.map(() => []);
  const expand = (num: number, col: number) => {
    const m = byNum.get(num);
    if (!m) return;
    cols[col].push(m);
    if (col === 0) return;
    for (const slot of [m.slot1!, m.slot2!]) {
      const w = /^W(\d+)$/.exec(slot);
      if (w) expand(Number(w[1]), col - 1);
    }
  };
  expand(104, 4);
  return cols;
}

/** Human label for an unresolved slot, e.g. "Winner 89", "Group A runner-up". */
export function slotLabel(slot: string): string {
  const wl = /^([WL])(\d+)$/.exec(slot);
  if (wl) return `${wl[1] === 'W' ? 'Winner' : 'Loser'} M${wl[2]}`;
  const gr = /^([12])([A-L])$/.exec(slot);
  if (gr) return gr[1] === '1' ? `Group ${gr[2]} winner` : `Group ${gr[2]} runner-up`;
  if (slot.startsWith('3')) return `3rd: ${slot.slice(1)}`;
  return slot;
}
