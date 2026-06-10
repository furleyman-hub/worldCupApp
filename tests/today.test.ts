import { describe, expect, it } from 'vitest';
import type { MergedMatch, Stage } from '../src/lib/types';
import { homeSections, matchStatus, sameLocalDay } from '../src/lib/today';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Timestamps are built with local-time constructors so assertions hold in any
// test-runner timezone — the functions under test work in the viewer's zone.
function mk(num: number, kickoff: number, stage: Stage = 'group', extra: Partial<MergedMatch> = {}): MergedMatch {
  return {
    num,
    stage,
    dateUtc: new Date(kickoff).toISOString(),
    etDisplay: '',
    city: '',
    kickoff,
    ...extra
  } as MergedMatch;
}

describe('matchStatus', () => {
  const k = new Date(2026, 5, 15, 15, 0).getTime();

  it('is upcoming before kickoff', () => {
    expect(matchStatus(mk(1, k), k - 1)).toBe('upcoming');
  });

  it('is live during the match window', () => {
    expect(matchStatus(mk(1, k), k)).toBe('live');
    expect(matchStatus(mk(1, k), k + 2 * HOUR)).toBe('live');
  });

  it('group window closes before the knockout window', () => {
    const t = k + 3 * HOUR;
    expect(matchStatus(mk(1, k, 'group'), t)).toBe('finished');
    expect(matchStatus(mk(90, k, 'r16'), t)).toBe('live');
    expect(matchStatus(mk(90, k, 'r16'), k + 4 * HOUR)).toBe('finished');
  });

  it('a recorded outcome means finished even inside the window', () => {
    expect(matchStatus(mk(1, k, 'group', { outcome: 'draw' }), k + HOUR)).toBe('finished');
  });
});

describe('sameLocalDay', () => {
  it('matches within a local day and not across midnight', () => {
    const evening = new Date(2026, 5, 11, 23, 30).getTime();
    expect(sameLocalDay(evening, new Date(2026, 5, 11, 0, 5).getTime())).toBe(true);
    expect(sameLocalDay(evening, evening + HOUR)).toBe(false);
  });
});

describe('homeSections', () => {
  const noon = new Date(2026, 5, 15, 12, 0).getTime();

  it('splits live from the full today list, sorted by kickoff', () => {
    const liveNow = mk(2, noon - HOUR);
    const earlier = mk(1, noon - 5 * HOUR, 'group', { outcome: 'team1' });
    const tonight = mk(3, noon + 7 * HOUR);
    const tomorrow = mk(4, noon + DAY);
    const s = homeSections([tonight, tomorrow, liveNow, earlier], noon);
    expect(s.live.map((m) => m.num)).toEqual([2]);
    expect(s.today.map((m) => m.num)).toEqual([1, 2, 3]);
    expect(s.next).toEqual([]);
  });

  it('falls back to the next match day when nothing is on today', () => {
    const inTwoDays = mk(1, noon + 2 * DAY);
    const sameDayLater = mk(2, noon + 2 * DAY + HOUR);
    const inThreeDays = mk(3, noon + 3 * DAY);
    const s = homeSections([inThreeDays, sameDayLater, inTwoDays], noon);
    expect(s.today).toEqual([]);
    expect(s.next.map((m) => m.num)).toEqual([1, 2]);
  });

  it('counts a just-after-local-midnight kickoff toward that local day', () => {
    // e.g. a 02:00 UTC kickoff that lands at 00:30 local on the viewer's "today"
    const now = new Date(2026, 5, 12, 0, 5).getTime();
    const lateGame = mk(1, new Date(2026, 5, 12, 0, 30).getTime());
    const s = homeSections([lateGame], now);
    expect(s.today.map((m) => m.num)).toEqual([1]);
  });
});
