// Eastern-time rendering with the precomputed string from schedule.json as a
// fallback for browsers with broken/missing IANA timezone data (older Silk).

let etFmt: Intl.DateTimeFormat | null = null;
try {
  etFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
} catch {
  etFmt = null;
}

export function formatET(dateUtc: string, fallback: string): string {
  if (!etFmt) return fallback;
  try {
    return etFmt.format(new Date(dateUtc)) + ' ET';
  } catch {
    return fallback;
  }
}

let dayFmt: Intl.DateTimeFormat | null = null;
try {
  dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
} catch {
  dayFmt = null;
}

/** "Thursday, June 11" in the viewer's local timezone. */
export function formatLocalDay(epoch: number): string {
  if (dayFmt) {
    try {
      return dayFmt.format(new Date(epoch));
    } catch {
      /* fall through */
    }
  }
  return new Date(epoch).toDateString();
}

export function timeAgo(epoch: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epoch) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
