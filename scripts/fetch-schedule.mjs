// Generates src/data/schedule.json (the canonical 104-match dataset) from the
// openfootball public-domain feed. Validates structure hard: if the feed ever
// regresses, this script fails instead of committing a broken schedule.
//
// Usage: node scripts/fetch-schedule.mjs [path-to-local-feed.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FEED_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const STAGES = {
  'Round of 32': 'r32',
  'Round of 16': 'r16',
  'Quarter-final': 'qf',
  'Semi-final': 'sf',
  'Match for third place': 'third',
  'Final': 'final'
};

async function loadFeed() {
  const local = process.argv[2];
  if (local) return JSON.parse(readFileSync(local, 'utf8'));
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
  return res.json();
}

// "13:00 UTC-6" + "2026-06-11" -> epoch ms (UTC)
export function toUtcEpoch(date, time) {
  const m = /^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})(?::?(\d{2}))?$/.exec(time);
  if (!m) throw new Error(`unparseable time: ${time}`);
  const [y, mo, d] = date.split('-').map(Number);
  const offMin = Number(m[3]) * 60 + (m[3].startsWith('-') ? -1 : 1) * Number(m[4] || 0);
  return Date.UTC(y, mo - 1, d, Number(m[1]), Number(m[2])) - offMin * 60 * 1000;
}

const etFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true
});

const feed = await loadFeed();
const teams = JSON.parse(readFileSync(join(ROOT, 'src/data/teams.json'), 'utf8'));
const matches = feed.matches;

// --- validation ---
const group = matches.filter((m) => m.group);
const ko = matches.filter((m) => !m.group);
if (matches.length !== 104) throw new Error(`expected 104 matches, got ${matches.length}`);
if (group.length !== 72) throw new Error(`expected 72 group matches, got ${group.length}`);
const perGroup = {};
for (const m of group) perGroup[m.group] = (perGroup[m.group] || 0) + 1;
const groups = Object.keys(perGroup).sort();
if (groups.length !== 12 || groups.some((g) => perGroup[g] !== 6)) {
  throw new Error(`bad group structure: ${JSON.stringify(perGroup)}`);
}
const perStage = {};
for (const m of ko) perStage[m.round] = (perStage[m.round] || 0) + 1;
const expectStage = { 'Round of 32': 16, 'Round of 16': 8, 'Quarter-final': 4, 'Semi-final': 2, 'Match for third place': 1, 'Final': 1 };
for (const [r, n] of Object.entries(expectStage)) {
  if (perStage[r] !== n) throw new Error(`stage ${r}: expected ${n}, got ${perStage[r]}`);
}
for (const m of group) {
  for (const t of [m.team1, m.team2]) {
    if (!teams[t]) throw new Error(`unknown team in feed: "${t}" — add it to teams.json`);
  }
}
// The feed omits num on the third-place match and final; they are fixed.
for (const m of ko) {
  if (m.num == null) m.num = m.round === 'Final' ? 104 : 103;
}
const koNums = ko.map((m) => m.num).sort((a, b) => a - b);
if (koNums[0] !== 73 || koNums[31] !== 104 || new Set(koNums).size !== 32) {
  throw new Error(`knockout nums not 73..104: ${koNums}`);
}

// --- normalize ---
// Group matches carry no num in the feed; assign 1..72 chronologically.
const groupSorted = group
  .map((m) => ({ ...m, epoch: toUtcEpoch(m.date, m.time) }))
  .sort((a, b) => a.epoch - b.epoch || a.group.localeCompare(b.group));

const out = [];
groupSorted.forEach((m, i) => {
  out.push({
    num: i + 1,
    stage: 'group',
    group: m.group.replace('Group ', ''),
    dateUtc: new Date(m.epoch).toISOString(),
    etDisplay: etFmt.format(m.epoch) + ' ET',
    city: m.ground,
    team1: m.team1,
    team2: m.team2
  });
});
for (const m of ko.sort((a, b) => a.num - b.num)) {
  const epoch = toUtcEpoch(m.date, m.time);
  out.push({
    num: m.num,
    stage: STAGES[m.round],
    dateUtc: new Date(epoch).toISOString(),
    etDisplay: etFmt.format(epoch) + ' ET',
    city: m.ground,
    slot1: m.team1,
    slot2: m.team2
  });
}

const dest = join(ROOT, 'src/data/schedule.json');
writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${out.length} matches to ${dest}`);
console.log('opener:', JSON.stringify(out[0]));
console.log('final :', JSON.stringify(out[out.length - 1]));
