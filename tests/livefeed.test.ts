import { describe, expect, it } from 'vitest';
import scheduleJson from '../src/data/schedule.json';
import type { ScheduleMatch } from '../src/lib/types';
import { mergeFeed } from '../src/lib/feed';
import { parseLive, type LiveCache } from '../src/lib/livefeed';

const SCHEDULE = scheduleJson as ScheduleMatch[];

/** Hand-built sample of ESPN's scoreboard shape (pre + in + post + junk). */
const espnSample = {
  events: [
    {
      // not started -> ignored
      status: { type: { state: 'pre', shortDetail: '6/11 - 10:00 PM EDT' } },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: 'South Korea' }, score: '0' },
            { homeAway: 'away', team: { displayName: 'Czechia' }, score: '0' }
          ]
        }
      ]
    },
    {
      // in progress
      status: { type: { state: 'in', shortDetail: "63'" }, displayClock: "63'" },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: 'Mexico' }, score: '2' },
            { homeAway: 'away', team: { displayName: 'South Africa' }, score: '1' }
          ]
        }
      ]
    },
    {
      // finished
      status: { type: { state: 'post', shortDetail: 'FT' } },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: 'Canada' }, score: '3' },
            { homeAway: 'away', team: { displayName: 'Curaçao' }, score: '0' }
          ]
        }
      ]
    },
    { status: { type: { state: 'in' } } }, // malformed -> skipped
    null
  ]
};

describe('live feed parsing', () => {
  it('parses in-progress and finished events, skipping pre/malformed ones', () => {
    const live = parseLive(espnSample);
    expect(live.length).toBe(2);
    expect(live[0]).toEqual({
      team1: 'mexico',
      team2: 'south africa',
      score: [2, 1],
      state: 'in',
      clock: "63'"
    });
    expect(live[1].state).toBe('post');
    expect(live[1].team2).toBe('curacao'); // accent-normalized
  });

  it('survives garbage payloads', () => {
    expect(parseLive(null)).toEqual([]);
    expect(parseLive({})).toEqual([]);
    expect(parseLive({ events: 'nope' })).toEqual([]);
  });
});

describe('live merge precedence', () => {
  const liveCache = (matches: LiveCache['matches']): LiveCache => ({ fetchedAt: 0, matches });

  it('attaches an in-progress score without deciding the match', () => {
    const live = liveCache([
      { team1: 'mexico', team2: 'south africa', score: [2, 1], state: 'in', clock: "63'" }
    ]);
    const m1 = mergeFeed(SCHEDULE, null, live).find((m) => m.num === 1)!;
    expect(m1.live).toEqual({ score: [2, 1], clock: "63'", finished: false });
    expect(m1.outcome).toBeUndefined();
    expect(m1.score).toBeUndefined();
  });

  it('swaps the score when the live feed lists the teams reversed', () => {
    const live = liveCache([
      { team1: 'south africa', team2: 'mexico', score: [1, 2], state: 'in', clock: 'HT' }
    ]);
    const m1 = mergeFeed(SCHEDULE, null, live).find((m) => m.num === 1)!;
    expect(m1.live!.score).toEqual([2, 1]);
  });

  it('synthesizes a final group result when ESPN says post', () => {
    const live = liveCache([
      { team1: 'mexico', team2: 'south africa', score: [2, 0], state: 'post', clock: 'FT' }
    ]);
    const m1 = mergeFeed(SCHEDULE, null, live).find((m) => m.num === 1)!;
    expect(m1.outcome).toBe('team1');
    expect(m1.winnerTeam).toBe('Mexico');
    expect(m1.score).toEqual({ ft: [2, 0] });
  });

  it('keeps openfootball authoritative over the live feed', () => {
    const feed = {
      fetchedAt: 0,
      matches: [
        {
          round: 'Matchday 1',
          date: '2026-06-11',
          team1: 'Mexico',
          team2: 'South Africa',
          group: 'Group A',
          score: { ft: [1, 1] as [number, number] }
        }
      ]
    };
    const live = liveCache([
      { team1: 'mexico', team2: 'south africa', score: [2, 0], state: 'post', clock: 'FT' }
    ]);
    const m1 = mergeFeed(SCHEDULE, feed, live).find((m) => m.num === 1)!;
    expect(m1.outcome).toBe('draw'); // openfootball wins
    expect(m1.live).toBeUndefined();
  });

  it('shows a finished knockout score but leaves the outcome to openfootball', () => {
    // resolve M73's teams via the feed first, then a live FT score arrives
    const feed = {
      fetchedAt: 0,
      matches: [
        { round: 'Round of 32', num: 73, date: '2026-06-28', team1: 'Mexico', team2: 'England' }
      ]
    };
    const live = liveCache([
      { team1: 'mexico', team2: 'england', score: [1, 1], state: 'post', clock: 'FT-Pens' }
    ]);
    const m = mergeFeed(SCHEDULE, feed, live).find((x) => x.num === 73)!;
    expect(m.live).toEqual({ score: [1, 1], clock: 'FT-Pens', finished: true });
    expect(m.outcome).toBeUndefined();
  });
});
