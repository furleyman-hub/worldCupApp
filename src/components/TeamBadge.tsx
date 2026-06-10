import teamsJson from '../data/teams.json';

const TEAMS = teamsJson as Record<string, { code: string; flag: string; name: string }>;

export function teamInfo(team: string | null | undefined) {
  if (team && TEAMS[team]) return TEAMS[team];
  return null;
}

const FLAG_BASE = import.meta.env.BASE_URL + 'flags/';

/**
 * Flag + FIFA trigram. Unknown/unresolved teams render the TBD flag with the
 * given placeholder label (e.g. "1A", "Winner M89").
 */
export function TeamBadge({
  team,
  placeholder,
  winner,
  right
}: {
  team?: string | null;
  placeholder?: string;
  winner?: boolean;
  right?: boolean;
}) {
  const info = teamInfo(team);
  const flag = info ? `${FLAG_BASE}${info.flag}.svg` : `${FLAG_BASE}tbd.svg`;
  const label = info ? info.code : placeholder || 'TBD';
  return (
    <span class={`badge${winner ? ' winner' : ''}${right ? ' right' : ''}${info ? '' : ' tbd'}`}>
      <img class="flag" src={flag} alt={info ? info.name : 'to be decided'} loading="lazy" />
      <span class="code">{label}</span>
    </span>
  );
}
