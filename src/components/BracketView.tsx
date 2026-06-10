import type { BracketResolution } from '../lib/bracket';
import { bracketColumns, slotLabel } from '../lib/bracket';
import type { MergedMatch } from '../lib/types';
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
  onPick,
  locked
}: {
  merged: MergedMatch[];
  resolution: BracketResolution;
  /** current predicted winner per match (prediction mode only) */
  pickedWinner?: (num: number) => string | undefined;
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
                const cell = (team: string | null, slot: string, isWin: boolean) => (
                  <button
                    class={`bk-team${isWin ? ' winner' : ''}${predict && team && !locked ? ' pickable' : ''}`}
                    disabled={!predict || !team || locked}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (predict && team && !locked) onPick!(m.num, team);
                    }}
                  >
                    <TeamBadge team={team} placeholder={slotLabel(slot)} winner={isWin} />
                  </button>
                );
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
  resolution
}: {
  merged: MergedMatch[];
  resolution: BracketResolution;
}) {
  const third = merged.find((m) => m.num === 103)!;
  const [t1, t2] = resolution.participants[103] || [null, null];
  return (
    <div class="view">
      <Bracket merged={merged} resolution={resolution} />
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
