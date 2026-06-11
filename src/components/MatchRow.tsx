import { useState } from 'preact/hooks';
import type { MergedMatch } from '../lib/types';
import { scoreLabel } from '../lib/feed';
import { slotLabel } from '../lib/bracket';
import { formatET } from '../lib/time';
import { TeamBadge, teamInfo } from './TeamBadge';

const STAGE_NAMES: Record<string, string> = {
  group: 'Group stage',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  third: 'Third place',
  final: 'Final'
};

/**
 * One match line: badges, score or kickoff time. Tapping expands full country
 * names, venue and details (more reliable than long-press tooltips on Silk).
 */
export function MatchRow({
  m,
  team1,
  team2,
  live
}: {
  m: MergedMatch;
  /** resolved names for knockout matches (group matches use m.team1/2) */
  team1?: string | null;
  team2?: string | null;
  /** match is in progress right now (Home view) */
  live?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t1 = m.stage === 'group' ? m.team1 : team1;
  const t2 = m.stage === 'group' ? m.team2 : team2;
  const played = !!m.outcome;
  const label1 = m.slot1 ? slotLabel(m.slot1) : '';
  const label2 = m.slot2 ? slotLabel(m.slot2) : '';
  const i1 = teamInfo(t1);
  const i2 = teamInfo(t2);

  return (
    <div class={`match${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>
      <div class="match-line">
        <span class="num">M{m.num}</span>
        <TeamBadge team={t1} placeholder={label1} winner={m.outcome === 'team1'} />
        <span class={`mid${played ? ' score' : ''}${!played && (live || m.live) ? ' live' : ''}`}>
          {played
            ? scoreLabel(m.score)
            : m.live
              ? `${m.live.score[0]}–${m.live.score[1]} · ${m.live.clock}`
              : live
                ? 'LIVE'
                : formatET(m.dateUtc, m.etDisplay).replace(/^\w+, /, '')}
        </span>
        <TeamBadge team={t2} placeholder={label2} winner={m.outcome === 'team2'} right />
      </div>
      {open && (
        <div class="match-detail">
          <div>
            {i1 ? i1.name : label1 || 'TBD'} vs {i2 ? i2.name : label2 || 'TBD'}
          </div>
          <div>
            {STAGE_NAMES[m.stage]}
            {m.group ? ` · Group ${m.group}` : ''} · {formatET(m.dateUtc, m.etDisplay)}
          </div>
          <div>📍 {m.city}</div>
          {played && m.score?.p && <div>Decided on penalties {m.score.p[0]}–{m.score.p[1]}</div>}
        </div>
      )}
    </div>
  );
}
