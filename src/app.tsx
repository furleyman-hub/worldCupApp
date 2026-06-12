import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { User } from 'firebase/auth';
import scheduleJson from './data/schedule.json';
import type { Picks, ScheduleMatch } from './lib/types';
import { cachedFeed, fetchFeed, mergeFeed, type FeedCache } from './lib/feed';
import { fetchLive, type LiveCache } from './lib/livefeed';
import { matchStatus } from './lib/today';
import { groupTables } from './lib/standings';
import { resolveBracket } from './lib/bracket';
import {
  cloudEnabled,
  loadLocalPicks,
  loadMyPicks,
  saveLocalPicks,
  savePicksCloud,
  watchAuth
} from './lib/firebase';
import { timeAgo } from './lib/time';
import { clampToLocks } from './components/MyBracket';
import { Home } from './components/Home';
import { ScheduleView } from './components/ScheduleView';
import { BracketView } from './components/BracketView';
import { MyBracket } from './components/MyBracket';
import { Leaderboard } from './components/Leaderboard';
import { Settings } from './components/Settings';

const SCHEDULE = scheduleJson as ScheduleMatch[];

type Tab = 'home' | 'groups' | 'bracket' | 'picks' | 'pool' | 'more';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'groups', icon: '📅', label: 'Schedule' },
  { id: 'bracket', icon: '🏆', label: 'Bracket' },
  { id: 'picks', icon: '✏️', label: 'My Picks' },
  { id: 'pool', icon: '🥇', label: 'Pool' },
  { id: 'more', icon: '⚙️', label: 'More' }
];

export function App() {
  const [tab, setTab] = useState<Tab>(
    () => (location.hash.replace('#', '') as Tab) || 'home'
  );
  const [feed, setFeed] = useState<FeedCache | null>(() => cachedFeed());
  const [live, setLive] = useState<LiveCache | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [picks, setPicks] = useState<Picks>(() => loadLocalPicks());
  const [saveState, setSaveState] = useState('');
  const saveTimer = useRef<number | undefined>(undefined);

  const refreshLive = async () => {
    try {
      setLive(await fetchLive());
    } catch {
      setLive(null); // never let live-feed trouble break the app
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    refreshLive();
    try {
      setFeed(await fetchFeed());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setRefreshing(false);
    }
  };

  // refresh whenever the app opens or comes back to the foreground
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // poll the live scoreboard every 60s, but only while the app is visible
  // and at least one match is actually in its live window
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (SCHEDULE.some((m) => matchStatus({ ...m, kickoff: Date.parse(m.dateUtc) }, now) === 'live')) {
        refreshLive();
      }
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      watchAuth((u) => {
        setUser(u);
        if (!u) return;
        // cloud picks win on sign-in; if none exist yet, push the local ones up
        loadMyPicks(u.uid)
          .then((cloud) => {
            if (cloud) {
              setPicks(cloud);
              saveLocalPicks(cloud);
            } else {
              const local = loadLocalPicks();
              savePicksCloud(u.uid, local).catch(() => {
                // a lock may have passed since the picks were made and the
                // server rejects the whole write — salvage what's still open
                const clamped = clampToLocks(local, mergeFeed(SCHEDULE, null), Date.now());
                savePicksCloud(u.uid, clamped).catch(() => {});
              });
            }
          })
          .catch(() => {});
      }),
    []
  );

  const goTab = (t: Tab) => {
    setTab(t);
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* ignore */
    }
  };

  const merged = useMemo(() => mergeFeed(SCHEDULE, feed, live), [feed, live]);
  const tables = useMemo(() => groupTables(merged), [merged]);
  const actualResolution = useMemo(() => resolveBracket(merged), [merged]);

  const changePicks = (p: Picks) => {
    setPicks(p);
    saveLocalPicks(p);
    if (cloudEnabled && user) {
      // debounce cloud writes — group picking is tap-heavy
      setSaveState('saving…');
      clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        try {
          await savePicksCloud(user.uid, p);
          setSaveState('saved ✓');
        } catch (e) {
          setSaveState(`save failed: ${(e as Error).message}`);
        }
      }, 1200);
    }
  };

  return (
    <div class="shell">
      <header class="topbar">
        <span class="title">⚽ World Cup 2026</span>
        <span class="updated">
          {offline ? '⚠ offline · ' : ''}
          {feed ? timeAgo(feed.fetchedAt) : 'no data yet'}
          {tab === 'picks' && saveState ? ` · ${saveState}` : ''}
        </span>
        <button class="refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh results">
          {refreshing ? '…' : '↻'}
        </button>
      </header>

      <main class="content">
        {tab === 'home' && <Home merged={merged} resolution={actualResolution} />}
        {tab === 'groups' && <ScheduleView merged={merged} tables={tables} />}
        {tab === 'bracket' && <BracketView merged={merged} resolution={actualResolution} />}
        {tab === 'picks' && <MyBracket merged={merged} picks={picks} onChange={changePicks} />}
        {tab === 'pool' && <Leaderboard merged={merged} myUid={user?.uid ?? null} />}
        {tab === 'more' && (
          <Settings
            user={user}
            lastUpdated={feed?.fetchedAt ?? null}
            offline={offline}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        )}
      </main>

      <nav class="tabbar">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'on' : ''} onClick={() => goTab(t.id)}>
            <span class="t-icon">{t.icon}</span>
            <span class="t-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
