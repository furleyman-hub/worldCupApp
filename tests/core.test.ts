import { describe, expect, it } from 'vitest';
import scheduleJson from '../src/data/schedule.json';
import teamsJson from '../src/data/teams.json';
import type { MergedMatch, Picks, ScheduleMatch } from '../src/lib/types';
import { isPlaceholder, mergeFeed, normTeam, outcomeFromScore, scoreLabel } from '../src/lib/feed';
import { groupTables } from '../src/lib/standings';
import { bracketColumns, resolveBracket, slotLabel } from '../src/lib/bracket';
import { computeScore } from '../src/lib/scoring';
import { prunePicks } from '../src/components/MyBracket';

const SCHEDULE = scheduleJson as ScheduleMatch[];

describe('canonical schedule', () => {
  it('has 104 matches with correct stage counts', () => {
    const count = (s: string) => SCHEDULE.filter((m) => m.stage === s).length;
    expect(SCHEDULE.length).toBe(104);
    expect(count('group')).toBe(72);
    expect(count('r32')).toBe(16);
    expect(count('r16')).toBe(8);
    expect(count('qf')).toBe(4);
    expect(count('sf')).toBe(2);
    expect(count('third')).toBe(1);
    expect(count('final')).toBe(1);
  });

  it('every group team is in teams.json with a FIFA code and flag', () => {
    const teams = teamsJson as Record<string, { code: string; flag: string; name: string }>;
    for (const m of SCHEDULE) {
      if (m.stage !== 'group') continue;
      for (const t of [m.team1!, m.team2!]) {
        expect(teams[t], `missing team ${t}`).toBeDefined();
        expect(teams[t].code).toMatch(/^[A-Z]{3}$/);
      }
    }
  });

  it('knockout slots parse as placeholders', () => {
    for (const m of SCHEDULE) {
      if (m.stage === 'group') continue;
      expect(isPlaceholder(m.slot1!), m.slot1).toBe(true);
      expect(isPlaceholder(m.slot2!), m.slot2).toBe(true);
    }
  });
});

describe('outcomeFromScore (FIFA rules)', () => {
  it('full time decides when no extra time', () => {
    expect(outcomeFromScore({ ft: [2, 1] }, false)).toBe('team1');
    expect(outcomeFromScore({ ft: [0, 3] }, true)).toBe('team2');
  });
  it('group matches can draw; knockout matches cannot', () => {
    expect(outcomeFromScore({ ft: [1, 1] }, false)).toBe('draw');
    expect(outcomeFromScore({ ft: [1, 1] }, true)).toBeUndefined();
  });
  it('extra time then penalties take precedence', () => {
    expect(outcomeFromScore({ ft: [1, 1], et: [2, 1] }, true)).toBe('team1');
    // 2022 final: FT 2-2, AET 3-3, pens 4-2
    expect(outcomeFromScore({ ft: [2, 2], et: [3, 3], p: [4, 2] }, true)).toBe('team1');
  });
  it('renders penalty results in the score label', () => {
    expect(scoreLabel({ ft: [2, 2], et: [3, 3], p: [4, 2] })).toBe('3–3 aet, 4–2 pens');
    expect(scoreLabel({ ft: [2, 0] })).toBe('2–0');
  });
});

describe('feed merge', () => {
  it('merges a group result by team pair regardless of feed date', () => {
    const feed = {
      fetchedAt: 0,
      matches: [
        {
          round: 'Matchday 1',
          date: '2026-06-11',
          team1: 'Mexico',
          team2: 'South Africa',
          group: 'Group A',
          score: { ft: [2, 0] as [number, number] }
        }
      ]
    };
    const merged = mergeFeed(SCHEDULE, feed);
    const m1 = merged.find((m) => m.num === 1)!;
    expect(m1.outcome).toBe('team1');
    expect(m1.winnerTeam).toBe('Mexico');
  });

  it('tolerates reversed team order by swapping the score', () => {
    const feed = {
      fetchedAt: 0,
      matches: [
        {
          round: 'Matchday 1',
          date: '2026-06-11',
          team1: 'South Africa',
          team2: 'Mexico',
          group: 'Group A',
          score: { ft: [0, 2] as [number, number] }
        }
      ]
    };
    const m1 = mergeFeed(SCHEDULE, feed).find((m) => m.num === 1)!;
    expect(m1.outcome).toBe('team1');
    expect(m1.winnerTeam).toBe('Mexico');
  });

  it('normalizes drifted team names', () => {
    expect(normTeam('Côte d’Ivoire'.replace('’', "'"))).toBe('ivory coast');
    expect(normTeam('Korea Republic')).toBe('south korea');
    expect(normTeam('Türkiye')).toBe('turkey');
    expect(normTeam('Curacao')).toBe(normTeam('Curaçao'));
  });

  it('fills knockout names and winners from the feed by num', () => {
    const feed = {
      fetchedAt: 0,
      matches: [
        {
          round: 'Round of 32',
          num: 73,
          date: '2026-06-28',
          team1: 'Mexico',
          team2: 'England',
          score: { ft: [1, 1] as [number, number], p: [3, 4] as [number, number] }
        }
      ]
    };
    const m = mergeFeed(SCHEDULE, feed).find((x) => x.num === 73)!;
    expect(m.resolved1).toBe('Mexico');
    expect(m.resolved2).toBe('England');
    expect(m.outcome).toBe('team2'); // penalties decide
    expect(m.winnerTeam).toBe('England');
  });

  it('survives an empty or absent feed', () => {
    expect(mergeFeed(SCHEDULE, null).length).toBe(104);
    expect(mergeFeed(SCHEDULE, { fetchedAt: 0, matches: [] }).length).toBe(104);
  });
});

/** Picks where the alphabetically-first team of each pair always wins. */
function allPicks(): Picks {
  const picks: Picks = { group: {}, knockout: {} };
  for (const m of SCHEDULE) {
    if (m.stage !== 'group') continue;
    picks.group[String(m.num)] = m.team1! < m.team2! ? 'team1' : 'team2';
  }
  return picks;
}

describe('standings + bracket resolution from picks', () => {
  it('derives complete predicted tables and resolves all R32 slots', () => {
    const merged = mergeFeed(SCHEDULE, null);
    const picks = allPicks();
    const tables = groupTables(merged, (n) => picks.group[String(n)]);
    expect(Object.keys(tables).length).toBe(12);
    for (const rows of Object.values(tables)) {
      expect(rows.length).toBe(4);
      expect(rows[0].pts).toBeGreaterThanOrEqual(rows[1].pts);
      expect(rows.reduce((s, r) => s + r.pts, 0)).toBeGreaterThan(0);
    }
    const res = resolveBracket(merged, { pickOutcome: (n) => picks.group[String(n)] });
    expect(res.thirdQualifiers.length).toBe(8);
    for (const m of merged.filter((m) => m.stage === 'r32')) {
      const [a, b] = res.participants[m.num];
      expect(a, `slot1 of M${m.num}`).toBeTruthy();
      expect(b, `slot2 of M${m.num}`).toBeTruthy();
    }
    // 32 distinct teams enter the knockout
    const all = merged
      .filter((m) => m.stage === 'r32')
      .flatMap((m) => res.participants[m.num]);
    expect(new Set(all).size).toBe(32);
  });

  it('propagates knockout picks down the bracket and prunes stale ones', () => {
    const merged = mergeFeed(SCHEDULE, null);
    const picks = allPicks();
    let res = resolveBracket(merged, { pickOutcome: (n) => picks.group[String(n)] });
    // pick every knockout winner = first participant
    for (const m of merged) {
      if (m.stage === 'group') continue;
      res = resolveBracket(merged, {
        pickOutcome: (n) => picks.group[String(n)],
        pickWinner: (n) => picks.knockout[String(n)]
      });
      const [a] = res.participants[m.num];
      if (a && m.num !== 103) picks.knockout[String(m.num)] = a;
    }
    expect(Object.keys(picks.knockout).length).toBe(31); // 16+8+4+2+1, no third place
    const champion = picks.knockout['104'];
    expect(champion).toBeTruthy();

    // flip one group so its winner changes -> downstream picks get pruned
    const g = merged.find((m) => m.num === 1)!;
    picks.group['1'] = picks.group['1'] === 'team1' ? 'team2' : 'team1';
    const pruned = prunePicks(picks, merged);
    expect(Object.keys(pruned.knockout).length).toBeLessThan(31);
    void g;
  });
});

describe('bracket display ordering', () => {
  it('column matches feed the adjacent next-round match', () => {
    const merged = mergeFeed(SCHEDULE, null);
    const cols = bracketColumns(merged);
    expect(cols.map((c) => c.length)).toEqual([16, 8, 4, 2, 1]);
    // each r16 match's W-slots are the two r32 matches beside it
    cols[1].forEach((m, i) => {
      const feeders = [cols[0][2 * i].num, cols[0][2 * i + 1].num].sort((a, b) => a - b);
      const slots = [m.slot1!, m.slot2!]
        .map((s) => Number(/^W(\d+)$/.exec(s)![1]))
        .sort((a, b) => a - b);
      expect(slots).toEqual(feeders);
    });
  });

  it('labels slots for humans', () => {
    expect(slotLabel('1A')).toBe('Group A winner');
    expect(slotLabel('2K')).toBe('Group K runner-up');
    expect(slotLabel('W89')).toBe('Winner M89');
    expect(slotLabel('L101')).toBe('Loser M101');
  });
});

describe('scoring', () => {
  function playResults(picks: Picks): MergedMatch[] {
    // simulate a tournament where exactly the user's picks happen,
    // propagating actual winners stage by stage like the real event
    const merged = mergeFeed(SCHEDULE, null).map((m) => {
      if (m.stage !== 'group') return m;
      const o = picks.group[String(m.num)];
      const score: [number, number] = o === 'team1' ? [1, 0] : o === 'team2' ? [0, 1] : [1, 1];
      return { ...m, score: { ft: score }, outcome: o };
    });
    for (const stage of ['r32', 'r16', 'qf', 'sf', 'third', 'final'] as const) {
      const res = resolveBracket(merged, {});
      for (const m of merged) {
        if (m.stage !== stage) continue;
        const [a, b] = res.participants[m.num];
        m.resolved1 = a ?? undefined;
        m.resolved2 = b ?? undefined;
        // the picked team wins; the unscored third-place match goes to slot 1
        const want = stage === 'third' ? a : picks.knockout[String(m.num)];
        if (want && (a === want || b === want)) {
          m.winnerTeam = want;
          m.outcome = a === want ? 'team1' : 'team2';
          m.score = { ft: a === want ? [1, 0] : [0, 1] };
        }
      }
    }
    return merged;
  }

  it('awards a perfect bracket 200 points', () => {
    const picks = allPicks();
    const merged0 = mergeFeed(SCHEDULE, null);
    // fill knockout picks = first participant at each step
    for (const stage of ['r32', 'r16', 'qf', 'sf', 'final'] as const) {
      const res = resolveBracket(merged0, {
        pickOutcome: (n) => picks.group[String(n)],
        pickWinner: (n) => picks.knockout[String(n)]
      });
      for (const m of merged0.filter((m) => m.stage === stage)) {
        const [a] = res.participants[m.num];
        if (a) picks.knockout[String(m.num)] = a;
      }
    }
    const played = playResults(picks);
    const s = computeScore(picks, played);
    expect(s.groupCorrect).toBe(72);
    expect(s.r16.length).toBe(16);
    expect(s.qf.length).toBe(8);
    expect(s.sf.length).toBe(4);
    expect(s.final.length).toBe(2);
    expect(s.champion).toBeTruthy();
    expect(s.total).toBe(200);
  });

  it('scores zero with no picks and partial credit for group-only picks', () => {
    const picks = allPicks();
    const played = playResults(picks);
    expect(computeScore({ group: {}, knockout: {} }, played).total).toBe(0);
    const groupOnly = computeScore({ group: picks.group, knockout: {} }, played);
    expect(groupOnly.total).toBe(72);
  });
});
