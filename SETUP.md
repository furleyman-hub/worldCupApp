# One-time setup

Everything in this app runs on free tiers — there is nothing to pay for.
Two short setup tasks make it live: turning on GitHub Pages (hosting) and
creating a free Firebase project (the family pool).

## 1. Turn on GitHub Pages (hosting)

1. Open the repository on github.com → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge/push this code to the `main` branch. The included workflow
   (`.github/workflows/deploy.yml`) builds and deploys automatically.
4. After the action finishes, the app is live at
   **https://worldcup2026.julianfox.com/**

The schedule, results, and on-device picks all work at this point. The family
pool (accounts, synced picks, leaderboard) needs step 2.

## 2. Create the free Firebase project (family pool)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and sign in with any Google account → **Add project** (call it anything,
   e.g. `worldcup-family`). Disable Analytics when asked — not needed.
   The default **Spark plan is free**; never upgrade to Blaze.
2. **Enable sign-in:** Build → **Authentication** → Get started →
   **Sign-in method** → enable **Email/Password**.
3. **Authorize the app's domain:** still in Authentication → **Settings** →
   **Authorized domains** → Add domain → `worldcup2026.julianfox.com`
   (also keep/add `furleyman-hub.github.io` as a fallback).
4. **Create the database:** Build → **Firestore Database** → Create database →
   production mode → location `nam5 (United States)`.
5. **Paste the security rules:** Firestore → **Rules** tab → replace the
   contents with the entire `firestore.rules` file from this repository →
   **Publish**. (These rules make sure people can only edit their own picks,
   and that picks lock at kickoff.)
6. **Connect the app:** Project overview → ⚙ **Project settings** →
   **Your apps** → Web (</>) → register an app (no hosting needed) → copy the
   `firebaseConfig` values into `src/firebaseConfig.ts` in this repository.
   In the same file, change `FAMILY_PASSPHRASE` to a phrase only your family
   knows — it is required to create an account.
7. Commit and push `src/firebaseConfig.ts` to `main`. (The web config is not
   a secret; protection comes from the rules and the authorized-domain list.)

## 3. Install it on each device

Open **https://worldcup2026.julianfox.com/** and then:

- **Android phone (Chrome):** menu **⋮** → **Add to Home screen** (or
  "Install app").
- **Kindle Fire (Silk browser):** menu → **Add to Home Screen**.
  Firefox on Fire works too (use its "Add to Home screen" / install option).
- **iPhone (Safari):** **Share** button → **Add to Home Screen**.

It opens full-screen like a regular app, keeps working offline (with the last
downloaded results), and updates itself automatically.

## 4. Invite the family

Send everyone the URL and the family passphrase. Each person taps
**More → Create account**, picks a display name, and fills in their bracket
under **My Picks**. The **Pool** tab shows the live leaderboard.

## Maintenance (optional)

- Results come from the public-domain
  [openfootball dataset](https://github.com/openfootball/worldcup.json),
  refreshed every time the app opens (plus the ↻ button). No key, no cost.
- If the schedule data ever needs regenerating:
  `npm run fetch-schedule && npm run gen-rules`, review the diff, push, and
  re-paste `firestore.rules` into the Firebase console.
