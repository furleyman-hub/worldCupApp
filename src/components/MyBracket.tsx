import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import type { MergedMatch, Outcome, Picks } from '../lib/types';
import { resolveBracket } from '../lib/bracket';
import { groupTables } from '../lib/standings';
import { formatET } from '../lib/time';
import { Bracket } from './BracketView';
import { GroupTable } from './ScheduleView';
import { TeamBadge, teamInfo } from './TeamBadge';

const GROUPS = 'ABCDEFGHIJKL'.split('');

/** Knockout picks all lock at the first Round-of-32 kickoff. */
export function knockoutLockTime(merged: MergedMatch[]): number {
  return Math.min(...merged.filter((m) => m.stage === 'r32').map((m) => m.kickoff));
}

/** Drop knockout picks that are no longer reachable after an edit. */
export function prunePicks(picks: Picks, merged: MergedMatch[]): Picks {
  const res = resolveBracket(merged, {
    pickOutcome: (num) => picks.group[String(num)],
    pickWinner: (num) => picks.knockout[String(num)]
  });
  const knockout: Record<string, string> = {};
  for (const [k, team] of Object.entries(picks.knockout)) {
    const p = res.participants[Number(k)];
    if (p && (p[0] === team || p[1] === team)) knockout[k] = team;
  }
  return { ...picks, knockout };
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
  const resolution = useMemo(
    () =>
      resolveBracket(merged, {
        pickOutcome: (num) => picks.group[String(num)],
        pickWinner: (num) => picks.knockout[String(num)]
      }),
    [merged, picks]
  );
  const predictedTables = useMemo(
    () => groupTables(merged, (num) => picks.group[String(num)]),
    [merged, picks]
  );

  const koLock = knockoutLockTime(merged);
  const koLocked = now >= koLock;
  const groupPicked = Object.keys(picks.group).length;
  const koPicked = Object.keys(picks.knockout).length;

  const setGroupPick = (num: number, outcome: Outcome) => {
    const key = String(num);
    const group = { ...picks.group };
    if (group[key] === outcome) delete group[key];
    else group[key] = outcome;
    onChange(prunePicks({ ...picks, group }, merged));
  };

  const setKoPick = (num: number, team: string) => {
    const knockout = { ...picks.knockout, [String(num)]: team };
    onChange(prunePicks({ ...picks, knockout }, merged));
  };

  const champion = (() => {
    const c = picks.knockout['104'];
    const p = resolution.participants[104];
    return c && p && (p[0] === c || p[1] === c) ? c : null;
  })();

  return (
    <div class="view">
      <section class="card hint">
        <p>
          Pick the result of all 72 group matches ({groupPicked}/72 done). Your predicted group
          tables build your own Round of 32 — then tap teams to advance them to the title
          ({koPicked}/32 knockout picks). Group picks lock at each match's kickoff; the knockout
          bracket locks at the first Round-of-32 game.
        </p>
        {champion && (
          <p class="champ">
            🏆 Your champion: <TeamBadge team={champion} /> {teamInfo(champion)?.name}
          </p>
        )}
      </section>

      <h2 class="section-title">Group stage picks</h2>
      {GROUPS.map((g) => (
        <section class="card" key={g}>
          <h2>Group {g}</h2>
          {predictedTables[g] && <GroupTable rows={predictedTables[g]} compact />}
          {merged
            .filter((m) => m.stage === 'group' && m.group === g)
            .sort((a, b) => a.kickoff - b.kickoff)
            .map((m) => {
              const locked = now >= m.kickoff;
              const pick = picks.group[String(m.num)];
              const opt = (o: Outcome, label: ComponentChildren) => (
                <button
                  class={`pick-opt${pick === o ? ' on' : ''}`}
                  disabled={locked}
                  onClick={() => setGroupPick(m.num, o)}
                >
                  {label}
                </button>
              );
              return (
                <div class={`pick-row${locked ? ' locked' : ''}`} key={m.num}>
                  <span class="pick-when">
                    {locked ? '🔒' : ''} {formatET(m.dateUtc, m.etDisplay).replace(/^\w+, /, '')}
                  </span>
                  <div class="pick-opts">
                    {opt('team1', <TeamBadge team={m.team1} />)}
                    {opt('draw', 'Draw')}
                    {opt('team2', <TeamBadge team={m.team2} right />)}
                  </div>
                </div>
              );
            })}
        </section>
      ))}

      <h2 class="section-title">
        Knockout picks{' '}
        {koLocked ? '🔒 (locked)' : `— open until ${formatET(new Date(koLock).toISOString(), '')}`}
      </h2>
      <p class="note">
        Slots appear as you finish each group's picks. Tap a team to advance it to the next round.
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
