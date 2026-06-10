import { useState } from 'preact/hooks';
import type { MergedMatch, TableRow } from '../lib/types';
import { formatET } from '../lib/time';
import { MatchRow } from './MatchRow';
import { TeamBadge } from './TeamBadge';

const GROUPS = 'ABCDEFGHIJKL'.split('');

export function GroupTable({ rows, compact }: { rows: TableRow[]; compact?: boolean }) {
  return (
    <table class={`standings${compact ? ' compact' : ''}`}>
      <thead>
        <tr>
          <th class="pos">#</th>
          <th class="team">Team</th>
          <th>P</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          {!compact && <th>GD</th>}
          <th class="pts">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr class={i < 2 ? 'qualify' : i === 2 ? 'maybe' : ''}>
            <td class="pos">{i + 1}</td>
            <td class="team">
              <TeamBadge team={r.team} />
            </td>
            <td>{r.p}</td>
            <td>{r.w}</td>
            <td>{r.d}</td>
            <td>{r.l}</td>
            {!compact && <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>}
            <td class="pts">{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScheduleView({
  merged,
  tables
}: {
  merged: MergedMatch[];
  tables: Record<string, TableRow[]>;
}) {
  const [mode, setMode] = useState<'group' | 'date'>('group');
  const groupMatches = merged.filter((m) => m.stage === 'group');

  return (
    <div class="view">
      <div class="seg">
        <button class={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}>
          By group
        </button>
        <button class={mode === 'date' ? 'on' : ''} onClick={() => setMode('date')}>
          By date
        </button>
      </div>

      {mode === 'group' ? (
        GROUPS.map((g) => (
          <section class="card" key={g}>
            <h2>Group {g}</h2>
            {tables[g] && <GroupTable rows={tables[g]} />}
            {groupMatches
              .filter((m) => m.group === g)
              .sort((a, b) => a.kickoff - b.kickoff)
              .map((m) => (
                <MatchRow m={m} key={m.num} />
              ))}
          </section>
        ))
      ) : (
        <ByDate matches={groupMatches} />
      )}
      <p class="note">
        Top 2 of each group qualify (green); the 8 best third-place teams (amber) also advance.
      </p>
    </div>
  );
}

function ByDate({ matches }: { matches: MergedMatch[] }) {
  const sorted = [...matches].sort((a, b) => a.kickoff - b.kickoff);
  const out = [];
  let lastDay = '';
  for (const m of sorted) {
    const et = formatET(m.dateUtc, m.etDisplay);
    const dayLabel = et.replace(/, \d{1,2}:\d{2}.*$/, '');
    if (dayLabel !== lastDay) {
      lastDay = dayLabel;
      out.push(
        <h3 class="day" key={`d${m.num}`}>
          {dayLabel}
        </h3>
      );
    }
    out.push(<MatchRow m={m} key={m.num} />);
  }
  return <div>{out}</div>;
}
