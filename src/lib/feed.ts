import type { MergedMatch, Outcome, ScheduleMatch, Score } from './types';
import type { LiveCache, LiveMatch } from './livefeed';

export const FEED_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const CACHE_KEY = 'wc26:feed';

interface FeedMatch {
  round: string;
  num?: number;
  date: string;
  time?: string;
  team1: string | { name: string };
  team2: string | { name: string };
  group?: string;
  score?: Score;
  ground?: string;
}

export interface FeedCache {
  fetchedAt: number;
  matches: FeedMatch[];
}

// Team names occasionally drift in the hand-maintained feed.
const ALIASES: Record<string, string> = {
  'cote divoire': 'ivory coast',
  "cote d'ivoire": 'ivory coast',
  'korea republic': 'south korea',
  'korea rep': 'south korea',
  'ir iran': 'iran',
  'united states': 'usa',
  'turkiye': 'turkey',
  'czechia': 'czech republic',
  'bosnia-herzegovina': 'bosnia & herzegovina',
  'bosnia and herzegovina': 'bosnia & herzegovina',
  'cabo verde': 'cape verde',
  'congo dr': 'dr congo'
};

export function normTeam(name: string): string {
  let n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[n] || n;
}

function teamName(t: FeedMatch['team1']): string {
  return typeof t === 'string' ? t : t && t.name ? t.name : '';
}

/** True when the code is a slot placeholder (1A, 2B, 3A/B/C, W89, L101), not a team. */
export function isPlaceholder(s: string): boolean {
  return /^([123][A-L](\/[A-L])*|[WL]\d+)$/.test(s);
}

/**
 * Decide a match outcome per FIFA rules: penalties decide if taken, else
 * extra time, else full time. Group matches may end in a draw; a knockout
 * match with a level score and no et/p data is treated as not yet decided.
 */
export function outcomeFromScore(score: Score | undefined, isKnockout: boolean): Outcome | undefined {
  if (!score) return undefined;
  const decider = score.p || score.et || score.ft;
  if (!decider) return undefined;
  const [a, b] = decider;
  if (typeof a !== 'number' || typeof b !== 'number') return undefined;
  if (a > b) return 'team1';
  if (b > a) return 'team2';
  return isKnockout ? undefined : 'draw';
}

export async function fetchFeed(): Promise<FeedCache> {
  const res = await fetch(FEED_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.matches)) throw new Error('feed: unexpected shape');
  const cache: FeedCache = { fetchedAt: Date.now(), matches: data.matches };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full/blocked: still usable in-memory */
  }
  return cache;
}

export function cachedFeed(): FeedCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && Array.isArray(c.matches) ? c : null;
  } catch {
    return null;
  }
}

/**
 * Merge feed results into the bundled canonical schedule.
 * Knockout matches merge by num. The feed omits num for group matches, but
 * every group-stage pairing is unique, so they merge by normalized team pair
 * (with a reversed-order fallback that swaps the score sides).
 *
 * The optional live scoreboard layers on top: openfootball results stay
 * authoritative, live data fills the gap while a match is being played (and,
 * for group matches ESPN marks final, synthesizes the result early so
 * standings update before openfootball catches up).
 */
export function mergeFeed(
  schedule: ScheduleMatch[],
  feed: FeedCache | null,
  live?: LiveCache | null
): MergedMatch[] {
  const byNum = new Map<number, FeedMatch>();
  const byPair = new Map<string, FeedMatch>();
  const liveByPair = new Map<string, LiveMatch>();
  for (const lm of live?.matches ?? []) {
    liveByPair.set(`${lm.team1}|${lm.team2}`, lm);
  }
  if (feed) {
    for (const fm of feed.matches) {
      if (fm.group) {
        byPair.set(`${normTeam(teamName(fm.team1))}|${normTeam(teamName(fm.team2))}`, fm);
      } else if (fm.num != null) {
        byNum.set(fm.num, fm);
      } else if (fm.round === 'Final') {
        byNum.set(104, fm);
      } else if (/third/i.test(fm.round)) {
        byNum.set(103, fm);
      }
    }
  }

  return schedule.map((m) => {
    const out: MergedMatch = { ...m, kickoff: Date.parse(m.dateUtc) };
    const isKO = m.stage !== 'group';
    let fm: FeedMatch | undefined;
    let reversed = false;
    if (isKO) {
      fm = byNum.get(m.num);
    } else {
      const a = normTeam(m.team1!);
      const b = normTeam(m.team2!);
      fm = byPair.get(`${a}|${b}`);
      if (!fm) {
        fm = byPair.get(`${b}|${a}`);
        reversed = !!fm;
      }
    }
    if (fm) {
      if (reversed && fm.score) {
        const flip = (p?: [number, number]): [number, number] | undefined =>
          p ? [p[1], p[0]] : undefined;
        fm = { ...fm, score: { ht: flip(fm.score.ht), ft: flip(fm.score.ft), et: flip(fm.score.et), p: flip(fm.score.p) } };
      }

      if (isKO) {
        // Feed replaces placeholders with real team names once known.
        const t1 = teamName(fm.team1);
        const t2 = teamName(fm.team2);
        if (t1 && !isPlaceholder(t1)) out.resolved1 = t1;
        if (t2 && !isPlaceholder(t2)) out.resolved2 = t2;
      }
      if (fm.score) {
        out.score = fm.score;
        out.outcome = outcomeFromScore(fm.score, isKO);
        if (out.outcome === 'team1') out.winnerTeam = isKO ? out.resolved1 : m.team1;
        if (out.outcome === 'team2') out.winnerTeam = isKO ? out.resolved2 : m.team2;
      }
    }

    attachLive(out, isKO, liveByPair);
    return out;
  });
}

/** Layer the live scoreboard onto a match openfootball hasn't decided yet. */
function attachLive(out: MergedMatch, isKO: boolean, liveByPair: Map<string, LiveMatch>) {
  if (out.score || out.outcome || liveByPair.size === 0) return;
  const t1 = isKO ? out.resolved1 : out.team1;
  const t2 = isKO ? out.resolved2 : out.team2;
  if (!t1 || !t2) return;
  const a = normTeam(t1);
  const b = normTeam(t2);
  let lm = liveByPair.get(`${a}|${b}`);
  let reversed = false;
  if (!lm) {
    lm = liveByPair.get(`${b}|${a}`);
    reversed = !!lm;
  }
  if (!lm) return;
  const score: [number, number] = reversed ? [lm.score[1], lm.score[0]] : lm.score;
  const winner: 'team1' | 'team2' | undefined = !lm.winner
    ? undefined
    : reversed
      ? lm.winner === 'team1'
        ? 'team2'
        : 'team1'
      : lm.winner;
  out.live = { score, clock: lm.clock, finished: lm.state === 'post' };
  if (lm.state !== 'post') return;

  if (!isKO) {
    // A finished group match has an unambiguous result (no extra time).
    out.score = { ft: score };
    out.outcome = outcomeFromScore(out.score, false);
    if (out.outcome === 'team1') out.winnerTeam = out.team1;
    if (out.outcome === 'team2') out.winnerTeam = out.team2;
    return;
  }

  // Knockout: the precise ft/et/pens breakdown waits for openfootball, but we
  // can safely learn WHO WON as soon as it's unambiguous — from ESPN's own
  // winner flag, or (only when the score isn't level) straight from the
  // score. A level score after a completed knockout match can only mean
  // penalties decided it, so that case requires the explicit winner flag.
  // Just the winner is enough to update the bracket and pool scoring.
  const decisive: 'team1' | 'team2' | undefined =
    winner ?? (score[0] !== score[1] ? (score[0] > score[1] ? 'team1' : 'team2') : undefined);
  if (decisive === 'team1') out.winnerTeam = out.resolved1;
  if (decisive === 'team2') out.winnerTeam = out.resolved2;
}

/** Display string like "2-1", "1-1 (4-2 pens)", "2-2 (aet 3-3)" */
export function scoreLabel(score: Score | undefined): string {
  if (!score) return '';
  const ft = score.ft ? `${score.ft[0]}–${score.ft[1]}` : '';
  if (score.p) {
    const base = score.et ? `${score.et[0]}–${score.et[1]} aet` : ft;
    return `${base}, ${score.p[0]}–${score.p[1]} pens`;
  }
  if (score.et) return `${score.et[0]}–${score.et[1]} aet`;
  return ft;
}
