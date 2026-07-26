# Training Log — 142 Day Tracker

A single-page, no-build app for your Jul 26 → Dec 15 transformation plan:
editable workout templates, an editable weekly schedule, a daily checklist,
and a progress log with a weight trend chart.

Without a Firestore config, it just runs on `localStorage`. Once you add
your Firebase keys, it gates the app behind **Sign in with Google** and
syncs every edit to Firestore under that user's own `uid` — wired manually
with plain `<script type="module">` and the Firebase CDN, no build tooling,
no framework.

## 1. Run it locally

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

It works immediately using `localStorage` — nothing else required.

## 2. Connect Firestore + Google Sign-In (manual setup)

1. Go to the [Firebase Console](https://console.firebase.google.com), create
   a project (or reuse one).
2. **Build → Firestore Database → Create database** — start in production
   mode, pick a region.
3. **Build → Authentication → Sign-in method → Add new provider → Google**
   — enable it, set a support email, Save.
4. **Authentication → Settings → Authorized domains** — add the domain(s)
   you'll serve the app from, e.g. `<your-username>.github.io`
   (`localhost` is already included by default, for local testing).
5. **Project settings → General → Your apps → Add app → Web (`</>`)**.
   Register the app (no Hosting needed), then copy the `firebaseConfig`
   object it gives you.
6. Paste those values into `js/firebase-config.js`, replacing the
   `REPLACE_ME` placeholders.
7. Deploy the security rules in `firestore.rules` — easiest via the
   Firestore Console → **Rules** tab (paste the file contents and Publish),
   or with the CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # point it at this repo, keep existing rules file
   firebase deploy --only firestore:rules
   ```

Once `firebaseConfig` is filled in, reload the app — you'll land on a
**"Sign in with Google"** screen instead of the dashboard. After signing in,
the status line at the bottom switches to *"synced — firestore
(you@example.com)"*, and every edit (workouts, schedule, checklist,
progress) writes straight to Firestore under your account's `uid`. Sign out
via the button next to your name in the header at any point.

If Firestore/Auth ever fails to init (bad config, offline, popup blocked),
the app automatically falls back to `localStorage` so it keeps working —
just without the sign-in gate or cross-device sync.

### A note on the Google sign-in popup

`signInWithPopup` requires the page to be served over `http://localhost`
or `https://` (which GitHub Pages provides automatically) — opening
`index.html` directly as a `file://` URL will not work for Google sign-in
(though the app still runs fine on `localStorage` in that case). Use
`npx serve .` or similar for local testing once Google auth is wired in.

## 3. Host on GitHub Pages

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial training log app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy
   from a branch → Branch: `main` / root**.
3. Your app will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

Because it's static files with no build step, every future edit is just:
edit → commit → push → Pages redeploys automatically.

## What's editable

- **Workouts** — rename any workout, add/remove exercises, edit sets/reps
  inline. Add entirely new workout templates (e.g. a Workout C once you have
  dumbbells).
- **Schedule** — each day of the week maps to Rest / Walk / any workout
  template, via dropdown. Changing a workout's name updates it everywhere.
- **Checklist** — the six daily habits from the plan, toggleable per date
  (use the date picker to fill in a missed day or check tomorrow's plan).
- **Progress** — log date, weight, waist, chest, arm, thigh, and notes.
  The chart plots weight over time automatically once you have 2+ entries.

## File structure

```
index.html            page shell, tab navigation, login screen
css/style.css          all styling (design tokens at the top)
js/firebase-config.js  YOUR Firestore project keys go here
js/app.js               app logic: auth, store abstraction, rendering, CRUD
firestore.rules         security rules — deploy these to Firebase
```

Rules stay the same regardless of which auth method you use — they just
check `request.auth.uid == uid` on each `users/{uid}/...` document, so
Google-authenticated users are scoped to their own data automatically.
