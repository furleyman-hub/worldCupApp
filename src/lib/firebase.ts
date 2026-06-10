// Firebase wiring (Auth + Firestore, Spark free tier). The app runs fully
// without a config: picks are kept in localStorage and the pool features
// (sign-in, leaderboard) show a setup hint instead.

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  type User
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  type Firestore
} from 'firebase/firestore';
import { firebaseConfig, FAMILY_PASSPHRASE } from '../firebaseConfig';
import type { Picks, UserInfo } from './types';

export const cloudEnabled = !!firebaseConfig.apiKey;

let db: Firestore | null = null;
let authReady = false;

function ensureInit() {
  if (authReady || !cloudEnabled) return;
  const app = initializeApp(firebaseConfig);
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
  authReady = true;
}

export function watchAuth(cb: (user: User | null) => void): () => void {
  if (!cloudEnabled) {
    cb(null);
    return () => {};
  }
  ensureInit();
  return onAuthStateChanged(getAuth(), cb);
}

export async function signUp(email: string, password: string, displayName: string, passphrase: string) {
  if (passphrase.trim() !== FAMILY_PASSPHRASE) {
    throw new Error('Wrong family passphrase — ask the pool organizer.');
  }
  ensureInit();
  const cred = await createUserWithEmailAndPassword(getAuth(), email, password);
  await updateProfile(cred.user, { displayName });
  await setDoc(doc(db!, 'users', cred.user.uid), {
    displayName,
    joinedAt: serverTimestamp()
  });
  return cred.user;
}

export async function signIn(email: string, password: string) {
  ensureInit();
  return (await signInWithEmailAndPassword(getAuth(), email, password)).user;
}

export async function signOut() {
  if (cloudEnabled) await fbSignOut(getAuth());
}

const LOCAL_PICKS_KEY = 'wc26:picks';

export function loadLocalPicks(): Picks {
  try {
    const raw = localStorage.getItem(LOCAL_PICKS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.group && p.knockout) return p;
    }
  } catch {
    /* fall through */
  }
  return { group: {}, knockout: {} };
}

export function saveLocalPicks(picks: Picks) {
  try {
    localStorage.setItem(LOCAL_PICKS_KEY, JSON.stringify(picks));
  } catch {
    /* storage blocked — picks stay in memory */
  }
}

export async function savePicksCloud(uid: string, picks: Picks) {
  ensureInit();
  await setDoc(doc(db!, 'picks', uid), {
    group: picks.group,
    knockout: picks.knockout,
    updatedAt: serverTimestamp()
  });
}

export async function loadMyPicks(uid: string): Promise<Picks | null> {
  ensureInit();
  const snap = await getDoc(doc(db!, 'picks', uid));
  if (!snap.exists()) return null;
  const v = snap.data();
  return { group: v.group || {}, knockout: v.knockout || {} };
}

export async function loadAllPicks(): Promise<{ users: UserInfo[]; picks: Record<string, Picks> }> {
  ensureInit();
  const [userSnap, pickSnap] = await Promise.all([
    getDocs(collection(db!, 'users')),
    getDocs(collection(db!, 'picks'))
  ]);
  const users: UserInfo[] = userSnap.docs.map((d) => {
    const v = d.data();
    return {
      uid: d.id,
      displayName: v.displayName || 'Anonymous',
      joinedAt: v.joinedAt?.toMillis?.() ?? 0
    };
  });
  const picks: Record<string, Picks> = {};
  for (const d of pickSnap.docs) {
    const v = d.data();
    picks[d.id] = { group: v.group || {}, knockout: v.knockout || {} };
  }
  return { users, picks };
}
