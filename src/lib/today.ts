import type { MergedMatch } from './types';

export type MatchStatus = 'upcoming' | 'live' | 'finished';

// Live windows from kickoff. A group game runs ~2h including halftime and
// stoppage; knockout games can add extra time and a shoot-out. The feed only
// posts scores after full time, so the window is what makes a game "live".
const GROUP_WINDOW_MS = 2.5 * 3_600_000;
const KNOCKOUT_WINDOW_MS = 3.5 * 3_600_000;

export function matchStatus(m: MergedMatch, now: number): MatchStatus {
  if (m.outcome) return 'finished';
  if (now < m.kickoff) return 'upcoming';
  const window = m.stage === 'group' ? GROUP_WINDOW_MS : KNOCKOUT_WINDOW_MS;
  return now < m.kickoff + window ? 'live' : 'finished';
}

/**
 * Compare two instants by the calendar day of the viewer's timezone.
 * Kickoffs are stored in UTC; a 02:00 UTC kickoff is still "tonight" for a
 * viewer in the Americas, which is exactly what Date's local getters give us.
 */
export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export interface HomeSections {
  /** matches in progress right now */
  live: MergedMatch[];
  /** every match on the viewer's current local day (played, live or upcoming) */
  today: MergedMatch[];
  /** when nothing is on today: the next local day that has matches */
  next: MergedMatch[];
}

export function homeSections(merged: MergedMatch[], now: number): HomeSections {
  const byKickoff = (a: MergedMatch, b: MergedMatch) => a.kickoff - b.kickoff;
  const live = merged.filter((m) => matchStatus(m, now) === 'live').sort(byKickoff);
  const today = merged.filter((m) => sameLocalDay(m.kickoff, now)).sort(byKickoff);
  let next: MergedMatch[] = [];
  if (!today.length) {
    const future = merged.filter((m) => m.kickoff > now).sort(byKickoff);
    if (future.length) next = future.filter((m) => sameLocalDay(m.kickoff, future[0].kickoff));
  }
  return { live, today, next };
}
