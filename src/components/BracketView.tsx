import { useMemo, useState } from 'preact/hooks';
import type { BracketResolution } from '../lib/bracket';
import { bracketColumns, pickedRoundAdvancers, slotLabel } from '../lib/bracket';
import type { MergedMatch, Picks } from '../lib/types';
import { scoreLabel } from '../lib/feed';
import { formatET } from '../lib/time';
import { MatchRow } from './MatchRow';
import { TeamBadge } from './TeamBadge';

const COL_TITLES = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

/**
 * Graphical knockout bracket: horizontally scrollable columns where winners
 * feed the adjacent match in the next column. Works the same for the actual
 * bracket and (with onPick) the user's prediction bracket.
 */
export function Bracket({
  merged,
  resolution,
  pickedWinner,
  myPick,
  onPick,
  locked
}: {
  merged: MergedMatch[];
  resolution: BracketResolution;
  /** current predicted winner per match (prediction mode only) */
  pickedWinner?: (num: number) => string | undefined;
  /** teams the user picked to advance out of this match's round, to overlay on
   *  the actual bracket (slot-independent — see pickedRoundAdvancers) */
  myPick?: (num: number) => Set<string>;
  onPick?: (num: number, team: string) => void;
  locked?: boolean;
}) {
  const cols = bracketColumns(merged);
  const predict = !!onPick;

  return (
    <div class="bracket-scroll">
      <div class="bracket">
        {cols.map((col, ci) => (
          <div class="bracket-col" key={ci}>
            <h3>{COL_TITLES[ci]}</h3>
            <div class="bracket-matches">
              {col.map((m) => {
                const [t1, t2] = resolution.participants[m.num] || [null, null];
                const win = predict ? pickedWinner!(m.num) : m.winnerTeam;
                const decided = !predict && !!m.winnerTeam;
                const cell = (team: string | null, slot: string, isWin: boolean) => {
                  // a filled third-place slot before the standings are final
                  const provisional =
                    !predict && resolution.thirdsProvisional && slot.startsWith('3') && !!team;
                  // the user picked this team to advance out of this round
                  const mine = !!team && !!myPick?.(m.num).has(team);
                  const mineClass = mine
                    ? decided
                      ? m.winnerTeam === team
                        ? 'hit'
                        : 'miss'
                      : 'pend'
                    : '';
                  return (
                    <button
                      class={`bk-team${isWin ? ' winner' : ''}${provisional ? ' provisional' : ''}${predict && team && !locked ? ' pickable' : ''}`}
                      disabled={!predict || !team || locked}
                      title={provisional ? 'Provisional — third-place spots finalize once all groups end' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (predict && team && !locked) onPick!(m.num, team);
                      }}
                    >
                      <TeamBadge team={team} placeholder={slotLabel(slot)} winner={isWin} />
                      {provisional && <span class="prov-tag">likely</span>}
                      {mine && (
                        <span
                          class={`my-pick ${mineClass}`}
                          title={
                            mineClass === 'hit'
                              ? 'Your pick — advanced'
                              : mineClass === 'miss'
                                ? 'Your pick — knocked out'
                                : 'Your pick'
                          }
                        >
                          {mineClass === 'hit' ? '✓' : mineClass === 'miss' ? '✗' : '●'}
                        </span>
                      )}
                    </button>
                  );
                };
                return (
                  <div class="bk-match" key={m.num}>
                    <div class="bk-head">
                      <span>M{m.num}</span>
                      <span>
                        {predict
                          ? ''
                          : m.score
                            ? scoreLabel(m.score)
                            : formatET(m.dateUtc, m.etDisplay)}
                      </span>
                    </div>
                    {cell(t1, m.slot1!, !!win && win === t1)}
                    {cell(t2, m.slot2!, !!win && win === t2)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BracketView({
  merged,
  resolution,
  picks
}: {
  merged: MergedMatch[];
  resolution: BracketResolution;
  picks: Picks;
}) {
  const third = merged.find((m) => m.num === 103)!;
  const [t1, t2] = resolution.participants[103] || [null, null];
  const hasPicks = Object.keys(picks.knockout).length > 0;
  const [compare, setCompare] = useState(true);
  const showMine = hasPicks && compare;
  const advancers = useMemo(() => pickedRoundAdvancers(merged, picks), [merged, picks]);

  return (
    <div class="view">
      {hasPicks && (
        <>
          <div class="bar">
            <h2>Knockout bracket</h2>
            <button class={`btn${compare ? ' primary' : ''}`} onClick={() => setCompare(!compare)}>
              {compare ? '✓ My picks' : 'Compare my picks'}
            </button>
          </div>
          {showMine && (
            <p class="note">
              Teams you picked to get through each round: <span class="my-pick pend">●</span> still
              to play · <span class="my-pick hit">✓</span> advanced ·{' '}
              <span class="my-pick miss">✗</span> knocked out. An unmarked team is one you didn't
              pick to win that round.
            </p>
          )}
        </>
      )}
      <Bracket merged={merged} resolution={resolution} myPick={showMine ? advancers : undefined} />
      {resolution.thirdsProvisional && (
        <p class="note">
          ⓘ Teams marked <span class="prov-tag">likely</span> are the current best third-place
          qualifiers — these spots refine as more groups finish and lock in once all 12 are done.
        </p>
      )}
      <section class="card">
        <h2>Third place match</h2>
        <MatchRow m={third} team1={t1} team2={t2} />
      </section>
      <p class="note">
        Knockout matches level after 90 minutes go to extra time, then a penalty shoot-out —
        there are no draws. Swipe sideways to see later rounds.
      </p>
    </div>
  );
}
