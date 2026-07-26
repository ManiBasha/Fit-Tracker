# Pulse — Training & Health Tracker

A single-page, no-build health/training app for your Jul 26 → Dec 15 plan.
Plain HTML/CSS/JS + [Chart.js](https://www.chartjs.org/) via CDN — no
framework, no bundler. Runs on `localStorage` out of the box; add your
Firebase keys and it gates behind **Sign in with Google** and syncs
everything to Firestore under that user's own account.

## What's new since the last version

- Real actual-workout tracking (not just templates) with plan-vs-actual comparison
- Onboarding on first Google sign-in (name, age, gender, weight, height)
- Every log now lets you pick the date, not just "today"
- Sleep is now start-time/end-time based, not a manual hours field
- Calories burned are computed from actual logged workouts
- Weekly weigh-in reminder banner
- Apple-Health-style triple activity rings (Workout / Steps / Sleep)

## Screens

- **Dashboard** — greeting, big step count with an animated watch-face-style
  progress ring, heart rate / calories / sleep mini cards, this week's step
  chart, recent workouts, "Start today's workout" button, and a banner if
  yesterday wasn't logged.
- **Activity** — steps (week/month toggle), heart rate trend, sleep
  analysis, calories burned, body log with **weight + height → BMI**
  auto-calculated, and the wearable sync card.
- **Workouts** — today's assigned session with a one-tap "mark complete"
  (feeds the streak and history), goal-vs-actual for the week, fully
  editable workout templates and weekly schedule, and a full history
  timeline.
- **Insights** — a blended health score ring (steps + sleep + workout
  consistency), the 4-phase program timeline, achievement badges, and a
  30-day steps chart.
- **Profile** — step/sleep goals, height (for BMI), light/dark/auto theme,
  sign out.

Dark mode is adaptive by default (`auto` follows OS preference) with a
manual light/dark override, both in the header toggle and Profile.

## Wearable sync — what's real vs. what's manual

Being upfront about this, since it shapes how the "sync" card works:

- **Huawei Health Kit** does have a genuine REST API (`health-api.cloud.huawei.com`)
  for steps, heart rate, sleep, etc., but it requires a Huawei Developer
  Console app approval and an OAuth2 flow with a **client secret** — that
  has to live on a server, not in this static site. A small Firebase Cloud
  Function could hold that secret if you want to build real auto-sync later.
- **Apple HealthKit has no public web API at all.** It's an on-device iOS
  framework. The only ways to get that data onto the web are a native
  companion app, an iOS Shortcuts automation, or a paid aggregator
  (Terra, Spike, Validic) that reads HealthKit on-device and forwards it.

So today, the **Wearable sync** card on the Activity tab gives you two
working options instead of a fake "Connect" button:

1. **Quick-log** — type in what your Watch 4 / Huawei Health / Apple Health
   app shows for steps, heart rate, sleep, and calories. Takes a few
   seconds, works right now, no backend needed.
2. **CSV import** — bulk-import a CSV (see format below) if you've
   exported a range of days from Huawei Health or via an Apple Health
   export shortcut.

CSV format (header row required, only `date` is mandatory):
```csv
date,steps,heartRate,sleepHours,calories
2026-07-26,8462,68,7.5,2340
2026-07-27,9120,71,6.8,2510
```

If you want to pursue real automatic sync later, the cleanest path is a
Firebase Cloud Function that does the Huawei OAuth token exchange
server-side and writes into the same `metrics/{date}` documents this app
already reads — the front end wouldn't need to change.

## 1. Run it locally

```bash
npx serve .
# or
python3 -m http.server 8000
```

Works immediately on `localStorage` — nothing else required.

## 2. Connect Firestore + Google Sign-In

1. [Firebase Console](https://console.firebase.google.com) → create a
   project (or reuse one).
2. **Build → Firestore Database → Create database** — production mode,
   pick a region.
3. **Build → Authentication → Sign-in method → Add provider → Google** —
   enable it, set a support email.
4. **Authentication → Settings → Authorized domains** — add
   `<your-username>.github.io` (or your custom domain). `localhost` is
   included by default.
5. **Project settings → General → Your apps → Add app → Web (`</>`)** —
   register, copy the `firebaseConfig` object.
6. Paste those values into `js/firebase-config.js`, replacing the
   `REPLACE_ME` placeholders.
7. Deploy `firestore.rules` — paste into Firestore Console → **Rules** →
   Publish, or via CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # point at this repo, keep the existing rules file
   firebase deploy --only firestore:rules
   ```

Reload the app — you'll land on **Sign in with Google** instead of the
dashboard. After signing in, Profile → sync status shows
`synced — firestore (you@example.com)`, and every edit writes straight to
Firestore under your `uid`. `signInWithPopup` needs `http://localhost` or
`https://` — it won't work opening `index.html` as a `file://` path.

## 3. Host on GitHub Pages

```bash
git init
git add .
git commit -m "Pulse tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then **Settings → Pages → Build and deployment → Source: Deploy from a
branch → `main` / root**. Live at
`https://<your-username>.github.io/<repo-name>/` shortly after. Every
future change is just edit → commit → push.

## Data model (Firestore)

```
users/{uid}/data/plan          workout templates + weekly schedule
users/{uid}/data/goals         step goal, sleep goal
users/{uid}/data/bodyLog       weight log entries → BMI (with profile.height)
users/{uid}/data/workoutLog    actual logged sessions: date, duration, calories,
                                 per-exercise {plannedSets/Reps, actualSets/Reps, hit}
users/{uid}/data/streak        current daily streak counter
users/{uid}/data/profile       name, age, gender, height, onboarded flag
users/{uid}/checklist/{date}   legacy 6-item daily checklist (kept from v1)
users/{uid}/metrics/{date}     steps, heartRate, sleepStart/End, sleepHours,
                                 (optional CSV-imported wearable calories)
```

`firestore.rules` scopes every collection to `request.auth.uid == uid`,
so it works identically whether you're signed in via Google or (if you
ever revert to it) anonymous auth.

## File structure

```
index.html            app shell: login screen, 5 views, bottom nav
css/style.css          design tokens, glassmorphism, light/dark themes
js/firebase-config.js  YOUR Firestore project keys go here
js/app.js               auth, store, rendering, charts, CRUD for everything
firestore.rules         security rules — deploy these to Firebase
```
