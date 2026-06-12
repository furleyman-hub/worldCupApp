import { useEffect, useMemo, useState } from 'preact/hooks';
import { emptyPicks, type MergedMatch, type Picks, type UserInfo } from '../lib/types';
import { computeScore, POINTS, type ScoreBreakdown } from '../lib/scoring';
import { predictedChampion } from '../lib/bracket';
import { cloudEnabled, loadAllPicks } from '../lib/firebase';
import { TeamBadge } from './TeamBadge';

interface Row {
  user: UserInfo;
  score: ScoreBreakdown;
  champion: string | null;
}

export function Leaderboard({ merged, myUid }: { merged: MergedMatch[]; myUid: string | null }) {
  const [data, setData] = useState<{ users: UserInfo[]; picks: Record<string, Picks> } | null>(
    null
  );
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try {
      setData(await loadAllPicks());
    } catch (e) {
      setError(`Could not load the pool: ${(e as Error).message}`);
    }
  };

  // Firestore rules only allow signed-in reads, and the auth session restores
  // asynchronously on app start — so wait for a uid before querying.
  useEffect(() => {
    if (cloudEnabled && myUid) load();
  }, [myUid]);

  // scoring is recomputed locally as results arrive; no refetch needed
  const rows = useMemo(() => {
    if (!data) return null;
    const scored: Row[] = data.users.map((u) => {
      const p = data.picks[u.uid] || emptyPicks();
      return {
        user: u,
        score: computeScore(p, merged),
        champion: predictedChampion(merged, p)
      };
    });
    scored.sort(
      (a, b) =>
        b.score.total - a.score.total ||
        b.score.positionCorrect - a.score.positionCorrect ||
        a.user.joinedAt - b.user.joinedAt
    );
    return scored;
  }, [data, merged]);

  if (!cloudEnabled) {
    return (
      <div class="view">
        <section class="card">
          <h2>Family pool</h2>
          <p>
            The shared pool isn't configured yet. Follow <b>SETUP.md</b> in the repository to
            create the free Firebase project, then everyone can sign up and compare brackets here.
          </p>
        </section>
      </div>
    );
  }

  if (!myUid) {
    return (
      <div class="view">
        <section class="card">
          <h2>Family pool</h2>
          <p class="note">
            Sign in (or create an account) on the <b>⚙️ More</b> tab to see the leaderboard.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div class="view">
      <div class="bar">
        <h2>Leaderboard</h2>
        <button class="btn" onClick={load}>
          ↻ Refresh
        </button>
      </div>
      {error && <p class="error">{error}</p>}
      {!rows && !error && <p class="note">Loading…</p>}
      {rows && rows.length === 0 && <p class="note">No players yet — be the first to sign up!</p>}
      {rows?.map((r, i) => (
        <section
          class={`card lb-row${r.user.uid === myUid ? ' me' : ''}`}
          key={r.user.uid}
          onClick={() => setOpen(open === r.user.uid ? null : r.user.uid)}
        >
          <div class="lb-line">
            <span class="lb-rank">{i + 1}</span>
            <span class="lb-name">
              {r.user.displayName}
              {r.user.uid === myUid ? ' (you)' : ''}
            </span>
            <span class="lb-champ" title="Champion pick">
              {r.champion ? (
                <>
                  🏆 <TeamBadge team={r.champion} />
                </>
              ) : (
                <span class="lb-nochamp">no champion yet</span>
              )}
            </span>
            <span class="lb-pts">{r.score.total} pts</span>
          </div>
          {open === r.user.uid && <Breakdown s={r.score} />}
        </section>
      ))}
      <ScoringRules />
    </div>
  );
}

function Breakdown({ s }: { s: ScoreBreakdown }) {
  const round = (label: string, teams: string[], pts: number) => (
    <div class="bd-row">
      <span>
        {label} ({pts} pts each)
      </span>
      <span class="bd-teams">
        {teams.length ? teams.map((t) => <TeamBadge team={t} />) : '—'}
      </span>
    </div>
  );
  return (
    <div class="breakdown">
      <div class="bd-row">
        <span>Group positions</span>
        <span>
          {s.positionCorrect}/{s.positionDecided} correct = {s.position} pts
        </span>
      </div>
      {round('Third-place qualifiers', s.thirds, POINTS.third)}
      {round('Reached Round of 16', s.r16, POINTS.r16)}
      {round('Reached Quarter-finals', s.qf, POINTS.qf)}
      {round('Reached Semi-finals', s.sf, POINTS.sf)}
      {round('Reached Final', s.final, POINTS.final)}
      <div class="bd-row">
        <span>Champion ({POINTS.champion} pts)</span>
        <span class="bd-teams">{s.champion ? <TeamBadge team={s.champion} /> : '—'}</span>
      </div>
    </div>
  );
}

export function ScoringRules() {
  return (
    <section class="card">
      <h2>How scoring works (192 max)</h2>
      <ul class="rules">
        <li>Team placed in its exact group finishing position: 1 pt × 48</li>
        <li>Each third-place qualifier you called right: 2 pts × 8</li>
        <li>Each team you correctly send to the Round of 16: 2 pts × 16</li>
        <li>Each team you correctly send to the Quarter-finals: 4 pts × 8</li>
        <li>Each team you correctly send to the Semi-finals: 6 pts × 4</li>
        <li>Each team you correctly send to the Final: 10 pts × 2</li>
        <li>Correct champion: 20 pts</li>
      </ul>
      <p class="note">
        Group positions score once a group finishes; thirds score once all groups are done.
        Knockout points count a team reaching that round anywhere in your bracket, so you aren't
        punished by FIFA's third-place slot shuffling. Ties break on correct group positions.
      </p>
    </section>
  );
}
