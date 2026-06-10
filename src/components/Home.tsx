import { useEffect, useMemo, useState } from 'preact/hooks';
import type { MergedMatch } from '../lib/types';
import type { BracketResolution } from '../lib/bracket';
import { homeSections, matchStatus } from '../lib/today';
import { formatLocalDay } from '../lib/time';
import { MatchRow } from './MatchRow';

/**
 * Landing page: what's on today (in the viewer's local day) and what's being
 * played right now. Re-evaluates on a timer so a match flips to LIVE while
 * the app sits open on the couch.
 */
export function Home({
  merged,
  resolution
}: {
  merged: MergedMatch[];
  resolution: BracketResolution;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { live, today, next } = useMemo(() => homeSections(merged, now), [merged, now]);

  const row = (m: MergedMatch) => {
    const isLive = matchStatus(m, now) === 'live';
    if (m.stage === 'group') return <MatchRow m={m} live={isLive} key={m.num} />;
    const [t1, t2] = resolution.participants[m.num] || [null, null];
    return <MatchRow m={m} team1={t1} team2={t2} live={isLive} key={m.num} />;
  };

  return (
    <div class="view">
      {live.length > 0 && (
        <section class="card live-card">
          <h2>
            <span class="live-dot" />
            Live now
          </h2>
          {live.map(row)}
        </section>
      )}

      <section class="card">
        <h2>Today · {formatLocalDay(now)}</h2>
        {today.length > 0 ? today.map(row) : <p class="note">No matches today.</p>}
      </section>

      {today.length === 0 && next.length > 0 && (
        <section class="card">
          <h2>Next matches · {formatLocalDay(next[0].kickoff)}</h2>
          {next.map(row)}
        </section>
      )}

      <p class="note">
        Kickoff times are shown in ET; “today” follows your device’s timezone. Tap a match for
        details.
      </p>
    </div>
  );
}
