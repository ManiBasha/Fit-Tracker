# Training Log — 142 Day Tracker

A single-page, no-build app for your Jul 26 → Dec 15 transformation plan:
editable workout templates, an editable weekly schedule, a daily checklist,
and a progress log with a weight trend chart. Data is stored per-device in
`localStorage` until you connect Firestore, at which point it syncs there
instead — same pattern as before, just wired manually with plain
`<script type="module">` and the Firebase CDN, no build tooling required.

## 1. Run it locally

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

It works immediately using `localStorage` — nothing else required.

## 2. Connect Firestore (manual setup)

1. Go to the [Firebase Console](https://console.firebase.google.com), create
   a project (or reuse one).
2. **Build → Firestore Database → Create database** — start in production
   mode, pick a region.
3. **Build → Authentication → Sign-in method** — enable **Anonymous**.
   (The app signs each visitor in anonymously so their data is private and
   Firestore rules can scope reads/writes to `request.auth.uid`.)
4. **Project settings → General → Your apps → Add app → Web (`</>`)**.
   Register the app (no Hosting needed), then copy the `firebaseConfig`
   object it gives you.
5. Paste those values into `js/firebase-config.js`, replacing the
   `REPLACE_ME` placeholders.
6. Deploy the security rules in `firestore.rules` — easiest via the
   Firestore Console → **Rules** tab (paste the file contents and Publish),
   or with the CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # point it at this repo, keep existing rules file
   firebase deploy --only firestore:rules
   ```

Once `firebaseConfig` is filled in, reload the app — the status line at the
bottom will switch from *"using local storage"* to *"synced — firestore"*,
and every edit (workouts, schedule, checklist, progress) writes straight to
your Firestore project.

If Firestore ever fails to init (bad config, offline, rules issue), the app
automatically falls back to `localStorage` so it keeps working.

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
index.html            page shell, tab navigation
css/style.css          all styling (design tokens at the top)
js/firebase-config.js  YOUR Firestore project keys go here
js/app.js               app logic: store abstraction, rendering, CRUD
firestore.rules         security rules — deploy these to Firebase
```
