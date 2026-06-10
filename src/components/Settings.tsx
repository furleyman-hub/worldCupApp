import { useState } from 'preact/hooks';
import type { User } from 'firebase/auth';
import { cloudEnabled, signIn, signOut, signUp } from '../lib/firebase';
import { timeAgo } from '../lib/time';

export function Settings({
  user,
  lastUpdated,
  offline,
  onRefresh,
  refreshing
}: {
  user: User | null;
  lastUpdated: number | null;
  offline: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div class="view">
      <section class="card">
        <h2>Results data</h2>
        <p class="note">
          Results come from the free, public-domain{' '}
          <a href="https://github.com/openfootball/worldcup.json" target="_blank" rel="noreferrer">
            openfootball
          </a>{' '}
          dataset, refreshed every time you open the app. It is usually updated within hours of
          full time.
        </p>
        <p>
          {offline ? '⚠ Offline — showing cached data. ' : ''}
          Last updated: {lastUpdated ? timeAgo(lastUpdated) : 'never'}
        </p>
        <button class="btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh now'}
        </button>
      </section>

      <Account user={user} />

      <section class="card">
        <h2>Install on your device</h2>
        <ul class="rules">
          <li>
            <b>Android (Chrome):</b> menu ⋮ → "Add to Home screen" (or "Install app").
          </li>
          <li>
            <b>Kindle Fire (Silk):</b> menu → "Add to Home Screen". Firefox works too.
          </li>
          <li>
            <b>iPhone (Safari):</b> Share <span style="font-size:0.9em">▵</span> → "Add to Home
            Screen".
          </li>
        </ul>
      </section>
    </div>
  );
}

function Account({ user }: { user: User | null }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!cloudEnabled) {
    return (
      <section class="card">
        <h2>Account</h2>
        <p class="note">
          Cloud sync isn't configured yet — your picks are saved on this device only. See
          SETUP.md to enable the free family pool.
        </p>
      </section>
    );
  }

  if (user) {
    return (
      <section class="card">
        <h2>Account</h2>
        <p>
          Signed in as <b>{user.displayName || user.email}</b>. Your picks sync to the family
          pool from any device you sign in on.
        </p>
        <button class="btn" onClick={() => signOut()}>
          Sign out
        </button>
      </section>
    );
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signUp(email.trim(), password, name.trim(), phrase);
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(humanAuthError(err as Error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card">
      <h2>Family pool account</h2>
      <div class="seg">
        <button class={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button class={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
          Create account
        </button>
      </div>
      <form onSubmit={submit} class="auth-form">
        {mode === 'signup' && (
          <input
            placeholder="Display name (shown on leaderboard)"
            value={name}
            required
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
        <input
          type="password"
          placeholder="Password (6+ characters)"
          value={password}
          required
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        {mode === 'signup' && (
          <input
            placeholder="Family passphrase"
            value={phrase}
            required
            onInput={(e) => setPhrase((e.target as HTMLInputElement).value)}
          />
        )}
        {error && <p class="error">{error}</p>}
        <button class="btn primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}

function humanAuthError(e: Error): string {
  const m = e.message || '';
  if (m.includes('auth/invalid-credential') || m.includes('auth/wrong-password'))
    return 'Wrong email or password.';
  if (m.includes('auth/email-already-in-use')) return 'That email already has an account — sign in instead.';
  if (m.includes('auth/weak-password')) return 'Password must be at least 6 characters.';
  if (m.includes('auth/invalid-email')) return 'That email address looks invalid.';
  return m;
}
