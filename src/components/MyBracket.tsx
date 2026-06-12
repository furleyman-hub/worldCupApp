import { useMemo } from 'preact/hooks';
import type { MergedMatch, Picks } from '../lib/types';
import { pickableThirds, predictedChampion, resolvePickedBracket } from '../lib/bracket';
import { groupTeams } from '../lib/standings';
import { formatET } from '../lib/time';
import { Bracket } from './BracketView';
import { TeamBadge, teamInfo } from './TeamBadge';

const GROUPS = 'ABCDEFGHIJKL'.split('');
const POS_LABELS = ['1st', '2nd', '3rd', '4th'];

/** Each group's order locks at that group's own first kickoff. */
export function groupLockTimes(merged: MergedMatch[]): Record<string, number> {
  const locks: Record<string, number> = {};
  for (const m of merged) {
    if (m.stage !== 'group') continue;
    const g = m.group!;
    if (!(g in locks) || m.kickoff < locks[g]) locks[g] = m.kickoff;
  }
  return locks;
}

/**
 * Third-place picks lock when the last group kicks off: every order is frozen
 * by then, and it is safely before the first group finishes — so the choice
 * can never be made with real results in hand.
 */
export function thirdsLockTime(merged: MergedMatch[]): number {
  return Math.max(...Object.values(groupLockTimes(merged)));
}

/** Knockout picks all lock at the first Round-of-32 kickoff. */
export function knockoutLockTime(merged: MergedMatch[]): number {
  return Math.min(...merged.filter((m) => m.stage === 'r32').map((m) => m.kickoff));
}

/** Drop thirds and knockout picks that are no longer reachable after an edit. */
export function prunePicks(picks: Picks, merged: MergedMatch[]): Picks {
  const valid = pickableThirds(picks);
  const thirds = picks.thirds.filter((t) => valid.has(t));

  const res = resolvePickedBracket(merged, { ...picks, thirds });
  const knockout: Record<string, string> = {};
  for (const [k, team] of Object.entries(picks.knockout)) {
    const p = res.participants[Number(k)];
    if (p && (p[0] === team || p[1] === team)) knockout[k] = team;
  }
  return { ...picks, thirds, knockout };
}

/**
 * Drop the sections whose lock has already passed. Used to salvage a delayed
 * cloud sync: the server rejects a write that touches any locked section, so
 * a retry must only carry what is still open. (The locked picks survive on
 * the device but can no longer be proven to predate the lock.)
 */
export function clampToLocks(picks: Picks, merged: MergedMatch[], now: number): Picks {
  const locks = groupLockTimes(merged);
  const groupOrder: Record<string, string[]> = {};
  for (const [g, order] of Object.entries(picks.groupOrder)) {
    if (now < (locks[g] ?? 0)) groupOrder[g] = order;
  }
  const thirds = now < thirdsLockTime(merged) ? picks.thirds : [];
  const knockout = now < knockoutLockTime(merged) ? picks.knockout : {};
  return prunePicks({ groupOrder, thirds, knockout }, merged);
}

export function MyBracket({
  merged,
  picks,
  onChange,
  now = Date.now()
}: {
  merged: MergedMatch[];
  picks: Picks;
  onChange: (p: Picks) => void;
  now?: number;
}) {
  const resolution = useMemo(() => resolvePickedBracket(merged, picks), [merged, picks]);
  const teamsByGroup = useMemo(() => groupTeams(merged), [merged]);

  const locks = groupLockTimes(merged);
  const thirdsLock = thirdsLockTime(merged);
  const thirdsLocked = now >= thirdsLock;
  const koLock = knockoutLockTime(merged);
  const koLocked = now >= koLock;

  const orderedGroups = GROUPS.filter((g) => (picks.groupOrder[g] || []).length === 4).length;
  const thirdOptions = pickableThirds(picks);

  // Tap an unplaced team to give it the next position; tap a placed team to
  // redo the order from that position down.
  const tapTeam = (g: string, team: string) => {
    const order = picks.groupOrder[g] || [];
    const at = order.indexOf(team);
    const next = at >= 0 ? order.slice(0, at) : [...order, team];
    const groupOrder = { ...picks.groupOrder };
    if (next.length) groupOrder[g] = next;
    else delete groupOrder[g];
    onChange(prunePicks({ ...picks, groupOrder }, merged));
  };

  const tapThird = (team: string) => {
    const thirds = picks.thirds.includes(team)
      ? picks.thirds.filter((t) => t !== team)
      : picks.thirds.length < 8
        ? [...picks.thirds, team]
        : picks.thirds;
    onChange(prunePicks({ ...picks, thirds }, merged));
  };

  const setKoPick = (num: number, team: string) => {
    const knockout = { ...picks.knockout, [String(num)]: team };
    onChange(prunePicks({ ...picks, knockout }, merged));
  };

  const champion = predictedChampion(merged, picks);

  return (
    <div class="view">
      <section class="card hint">
        <p>
          Three steps: order each group's teams 1st→4th ({orderedGroups}/12 groups done), choose
          the 8 third-place teams that advance ({picks.thirds.length}/8), then tap teams through
          your Round of 32 bracket to the title. Each group locks at its own first kickoff, the
          third-place picks when the last group starts, and the knockout bracket at the first
          Round-of-32 game — so it's never too late to join in.
        </p>
        {champion && (
          <p class="champ">
            🏆 Your champion: <TeamBadge team={champion} /> {teamInfo(champion)?.name}
          </p>
        )}
      </section>

      <h2 class="section-title">1. Group finishing order</h2>
      <p class="note">
        Tap teams in finishing order: first tap is the group winner, last is 4th. Tap a placed
        team to redo from there. Top 2 advance; 3rd place might. Each group stays open until its
        own first match kicks off.
      </p>
      {GROUPS.map((g) => {
        const order = picks.groupOrder[g] || [];
        const locked = now >= (locks[g] ?? 0);
        return (
          <section class="card" key={g}>
            <h2>
              Group {g}{' '}
              <span class="lock-when">
                {locked
                  ? '🔒 locked'
                  : `open until ${formatET(new Date(locks[g]).toISOString(), '')}`}
              </span>
            </h2>
            {(teamsByGroup[g] || []).map((team) => {
              const pos = order.indexOf(team);
              return (
                <button
                  class={`order-row${pos >= 0 ? ` placed p${pos}` : ''}`}
                  disabled={locked}
                  onClick={() => tapTeam(g, team)}
                  key={team}
                >
                  <span class="order-pos">{pos >= 0 ? POS_LABELS[pos] : '·'}</span>
                  <TeamBadge team={team} />
                  <span class="order-name">{teamInfo(team)?.name}</span>
                </button>
              );
            })}
          </section>
        );
      })}

      <h2 class="section-title">
        2. Third-place qualifiers{' '}
        {thirdsLocked
          ? '🔒 (locked)'
          : `— pick 8 (${picks.thirds.length}/8), open until ${formatET(new Date(thirdsLock).toISOString(), '')}`}
      </h2>
      <section class="card">
        {thirdOptions.size === 0 ? (
          <p class="note">Finish ordering your groups first — your 3rd-place teams appear here.</p>
        ) : (
          <>
            <div class="thirds-grid">
              {GROUPS.map((g) => {
                const order = picks.groupOrder[g] || [];
                if (order.length !== 4) return null;
                const team = order[2];
                const on = picks.thirds.includes(team);
                const full = !on && picks.thirds.length >= 8;
                return (
                  <button
                    class={`pick-opt${on ? ' on' : ''}`}
                    disabled={thirdsLocked || full}
                    onClick={() => tapThird(team)}
                    key={g}
                  >
                    <TeamBadge team={team} />
                  </button>
                );
              })}
            </div>
            {thirdOptions.size < 12 && (
              <p class="note">
                {12 - thirdOptions.size} more group{thirdOptions.size === 11 ? '' : 's'} to order
                before all 12 candidates show.
              </p>
            )}
          </>
        )}
      </section>

      <h2 class="section-title">
        3. Knockout bracket{' '}
        {koLocked ? '🔒 (locked)' : `— open until ${formatET(new Date(koLock).toISOString(), '')}`}
      </h2>
      <p class="note">
        Your Round of 32 fills in once all groups are ordered and 8 thirds are chosen. Tap a team
        to advance it to the next round.
      </p>
      <Bracket
        merged={merged}
        resolution={resolution}
        pickedWinner={(num) => {
          const w = picks.knockout[String(num)];
          const p = resolution.participants[num];
          return w && p && (p[0] === w || p[1] === w) ? w : undefined;
        }}
        onPick={setKoPick}
        locked={koLocked}
      />
    </div>
  );
}
