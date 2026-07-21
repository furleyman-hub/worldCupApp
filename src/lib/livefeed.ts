// Live in-progress scores from ESPN's public scoreboard JSON. Unofficial but
// keyless and CORS-enabled; every failure here must degrade to the app's
// normal behavior (kickoff times + LIVE tag), so parsing is deliberately
// paranoid and callers treat any throw as "no live data".

import { normTeam } from './feed';

export const LIVE_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export interface LiveMatch {
  /** normalized (normTeam) names */
  team1: string;
  team2: string;
  score: [number, number];
  state: 'in' | 'post';
  /** match clock or phase, e.g. "63'", "HT", "FT" */
  clock: string;
  /** which side ESPN flags as the winner — present even on a tied score
   *  (the tell-tale sign of a penalty shoot-out) */
  winner?: 'team1' | 'team2';
}

export interface LiveCache {
  fetchedAt: number;
  matches: LiveMatch[];
}

/**
 * ESPN's scoreboard defaults to "today" when no `dates` param is given, so a
 * match checked the morning after it finished would silently vanish from the
 * feed. Request a 2-day UTC window (yesterday + today) so a just-finished
 * match stays visible while openfootball's hand-maintained feed catches up.
 */
export function dateRangeParam(now = Date.now()): string {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${fmt(new Date(now - 86_400_000))}-${fmt(new Date(now))}`;
}

export async function fetchLive(): Promise<LiveCache> {
  const res = await fetch(`${LIVE_URL}?dates=${dateRangeParam()}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`live HTTP ${res.status}`);
  return { fetchedAt: Date.now(), matches: parseLive(await res.json()) };
}

/** Tolerant parse of the ESPN scoreboard shape; malformed events are skipped. */
export function parseLive(data: unknown): LiveMatch[] {
  const out: LiveMatch[] = [];
  const events = (data as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return out;

  for (const ev of events) {
    try {
      const comp = (ev as any)?.competitions?.[0];
      const status = (ev as any)?.status ?? comp?.status;
      const state = status?.type?.state;
      if (state !== 'in' && state !== 'post') continue;

      const competitors = comp?.competitors;
      if (!Array.isArray(competitors) || competitors.length !== 2) continue;
      const home = competitors.find((c: any) => c?.homeAway === 'home') ?? competitors[0];
      const away = competitors.find((c: any) => c?.homeAway === 'away') ?? competitors[1];
      const name = (c: any): string =>
        c?.team?.displayName || c?.team?.shortDisplayName || c?.team?.name || '';
      const t1 = name(home);
      const t2 = name(away);
      const s1 = Number(home?.score);
      const s2 = Number(away?.score);
      if (!t1 || !t2 || home === away || !Number.isFinite(s1) || !Number.isFinite(s2)) continue;

      // displayClock is "63:21"-style or "0'"; shortDetail covers HT/FT/AET
      const detail: string = status?.type?.shortDetail || status?.type?.detail || '';
      const clock =
        state === 'post'
          ? detail || 'FT'
          : /half|HT/i.test(detail)
            ? 'HT'
            : String(status?.displayClock || detail || 'LIVE').replace(/:\d+$/, "'");
      const winner: 'team1' | 'team2' | undefined =
        home?.winner === true ? 'team1' : away?.winner === true ? 'team2' : undefined;

      out.push({
        team1: normTeam(t1),
        team2: normTeam(t2),
        score: [s1, s2],
        state,
        clock,
        winner
      });
    } catch {
      /* skip malformed event */
    }
  }
  return out;
}
