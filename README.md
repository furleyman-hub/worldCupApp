# World Cup 2026 Tracker

A free, installable web app (PWA) for following the 2026 FIFA World Cup and
running a family prediction pool. Works on Android phones (Chrome), Kindle
Fire tablets (Silk or Firefox), and iPhones (Safari).

**Live app:** https://worldcup2026.julianfox.com/ (after setup — see
[SETUP.md](SETUP.md))

## Features

- **Schedule** — all 104 matches with date, venue, and kickoff in US Eastern
  Time; group stage by group (with live standings tables showing points) or
  by date.
- **Bracket** — the knockout rounds drawn as a graphical tournament bracket,
  filled in as real results arrive. Knockout matches follow FIFA rules:
  extra time, then penalty shoot-out — no draws.
- **Results** — live in-progress scores with the match clock (polled every
  minute from ESPN's public scoreboard while games are on), and final results
  from the free public-domain
  [openfootball](https://github.com/openfootball/worldcup.json) dataset,
  which stays authoritative for standings, bracket and pool scoring.
- **My Picks** — order each group's teams 1st→4th, choose the 8 third-place
  qualifiers, and your Round of 32 builds itself; tap teams through the
  bracket to your champion. Each group locks at its own first kickoff (so
  late joiners can still play the open groups), third-place picks when the
  last group starts, knockout picks at the first Round-of-32 game.
- **Pool** — everyone's brackets scored live against the real tournament
  (192 points max), with a leaderboard.
- Every team shows its flag and FIFA code; tap any match for full country
  names, venue, and details.

## Tech

Vite + Preact + TypeScript PWA hosted on GitHub Pages; Firebase free Spark
tier (email/password auth + Firestore) for the shared pool. No paid services
anywhere. All scoring is computed client-side; Firestore security rules
(generated with the schedule's kickoff timestamps) enforce pick locking
server-side.

```bash
npm install
npm run dev        # local development
npm test           # unit tests (standings, bracket, scoring, feed merge)
npm run build      # production build into dist/
```

Data pipeline scripts: `npm run fetch-schedule` (regenerate the canonical
schedule from the feed, with validation), `npm run pick-flags` (copy the 48
team flag SVGs from flag-icons), `npm run gen-rules` (regenerate
`firestore.rules`).
