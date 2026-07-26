import { firebaseConfig, isConfigured } from './firebase-config.js';

/* ============================================================
   BACKEND: Firestore if configured, else localStorage fallback.
   Both are exposed through the same async `store` interface so
   the rest of the app never needs to know which one is active.
   ============================================================ */

let store;
const statusEl = () => document.getElementById('syncStatus');
const loginScreen = () => document.getElementById('loginScreen');
const appBody = () => document.getElementById('appBody');
const userBadgeRow = () => document.getElementById('userBadgeRow');

function buildFirestoreStore(db, docFns, uid) {
  const { doc, getDoc, setDoc } = docFns;
  return {
    backend: 'firestore',
    async getPlan() {
      const snap = await getDoc(doc(db, 'users', uid, 'data', 'plan'));
      return snap.exists() ? snap.data() : null;
    },
    async savePlan(plan) {
      await setDoc(doc(db, 'users', uid, 'data', 'plan'), plan);
    },
    async getChecklist(dateStr) {
      const snap = await getDoc(doc(db, 'users', uid, 'checklist', dateStr));
      return snap.exists() ? snap.data().items : null;
    },
    async saveChecklist(dateStr, items) {
      await setDoc(doc(db, 'users', uid, 'checklist', dateStr), { items });
    },
    async getProgress() {
      const snap = await getDoc(doc(db, 'users', uid, 'data', 'progress'));
      return snap.exists() ? snap.data().entries : [];
    },
    async saveProgress(entries) {
      await setDoc(doc(db, 'users', uid, 'data', 'progress'), { entries });
    }
  };
}

function buildLocalStore() {
  const read = (k, fallback) => {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  return {
    backend: 'local',
    async getPlan() { return read('lb_plan', null); },
    async savePlan(plan) { write('lb_plan', plan); },
    async getChecklist(dateStr) { return read('lb_check_' + dateStr, null); },
    async saveChecklist(dateStr, items) { write('lb_check_' + dateStr, items); },
    async getProgress() { return read('lb_progress', []); },
    async saveProgress(entries) { write('lb_progress', entries); }
  };
}

function useLocalFallback(reason) {
  store = buildLocalStore();
  statusEl().textContent = reason;
  statusEl().className = 'sync-status local';
  loginScreen().style.display = 'none';
  appBody().style.display = '';
  userBadgeRow().style.display = 'none';
}

/**
 * Sets up Firebase Auth (Google Sign-In) + Firestore, gated by a login
 * screen. Resolves once, the first time a signed-in user is available;
 * further sign-in/out events after that just re-render in place.
 */
async function initStore() {
  if (!isConfigured) {
    useLocalFallback('no firestore config — using local storage');
    return;
  }

  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const firestoreMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { getFirestore, doc, getDoc, setDoc } = firestoreMod;
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    document.getElementById('signInBtn').addEventListener('click', async () => {
      document.getElementById('loginError').textContent = '';
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error('Google sign-in failed:', err);
        document.getElementById('loginError').textContent = 'Sign-in failed — ' + err.message;
      }
    });

    document.getElementById('signOutBtn').addEventListener('click', () => signOut(auth));

    return await new Promise((resolve) => {
      let resolved = false;
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          store = buildFirestoreStore(db, { doc, getDoc, setDoc }, user.uid);
          statusEl().textContent = 'synced — firestore (' + (user.email || 'google account') + ')';
          statusEl().className = 'sync-status ok';
          loginScreen().style.display = 'none';
          appBody().style.display = '';
          userBadgeRow().style.display = 'flex';
          document.getElementById('userBadge').textContent = user.displayName || user.email || 'Signed in';

          if (!resolved) {
            resolved = true;
            resolve();
          } else {
            // A later sign-in after a sign-out: reload data for the new user.
            await bootApp();
          }
        } else {
          loginScreen().style.display = 'flex';
          appBody().style.display = 'none';
          userBadgeRow().style.display = 'none';
          statusEl().textContent = 'signed out';
          statusEl().className = 'sync-status local';
        }
      });
    });
  } catch (err) {
    console.error('Firebase init failed, falling back to localStorage:', err);
    useLocalFallback('firestore unavailable — using local storage');
  }
}

/* ============================================================
   DEFAULT PLAN — seeded from the 20-week transformation brief.
   Everything below is fully editable in the UI afterwards.
   ============================================================ */

const DEFAULT_PLAN = {
  workouts: {
    A: {
      name: 'Workout A',
      exercises: [
        { id: 'a1', name: 'Push-ups', sets: '3', reps: '6-15' },
        { id: 'a2', name: 'Bodyweight squats', sets: '3', reps: '12-20' },
        { id: 'a3', name: 'Backpack rows', sets: '3', reps: '10-15' },
        { id: 'a4', name: 'Reverse lunges', sets: '3', reps: '8-12 ea' },
        { id: 'a5', name: 'Pike push-ups', sets: '3', reps: '6-12' },
        { id: 'a6', name: 'Plank', sets: '3', reps: '30-60s' }
      ]
    },
    B: {
      name: 'Workout B',
      exercises: [
        { id: 'b1', name: 'Push-ups', sets: '3', reps: '6-15' },
        { id: 'b2', name: 'Bulgarian split squats', sets: '3', reps: '8-12 ea' },
        { id: 'b3', name: 'Backpack Romanian deadlift', sets: '3', reps: '10-15' },
        { id: 'b4', name: 'Backpack curls', sets: '3', reps: '10-15' },
        { id: 'b5', name: 'Chair/bench triceps dips', sets: '3', reps: '8-15' },
        { id: 'b6', name: 'Dead bug', sets: '3', reps: '8-12 ea' }
      ]
    }
  },
  schedule: {
    mon: 'A', tue: 'walk', wed: 'B', thu: 'walk', fri: 'A', sat: 'walk', sun: 'rest'
  }
};

const CHECKLIST_ITEMS = [
  { key: 'protein', label: 'Protein target reached' },
  { key: 'steps', label: '7,000–10,000 steps' },
  { key: 'workout', label: 'Workout completed (if scheduled)' },
  { key: 'wholeFoods', label: 'Mostly whole foods' },
  { key: 'noSugaryDrinks', label: 'No unnecessary sugary drinks' },
  { key: 'sleep', label: '7–9 hours sleep planned' }
];

const PHASES = [
  { n: 1, start: '2026-07-26', end: '2026-08-22', title: 'Build the habit' },
  { n: 2, start: '2026-08-23', end: '2026-10-03', title: 'Lose fat + build muscle' },
  { n: 3, start: '2026-10-04', end: '2026-11-14', title: 'Visible physique transformation' },
  { n: 4, start: '2026-11-15', end: '2026-12-15', title: 'Sharpen the result' }
];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

let plan = null;

/* ============================================================
   DATE HELPERS
   ============================================================ */

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function currentPhase() {
  const t = todayStr();
  for (const p of PHASES) {
    if (t >= p.start && t <= p.end) return p;
  }
  if (t < PHASES[0].start) return PHASES[0];
  return PHASES[PHASES.length - 1];
}

/* ============================================================
   TABS
   ============================================================ */

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

/* ============================================================
   SCOREBOARD + DASHBOARD
   ============================================================ */

function renderScoreboard() {
  const start = PHASES[0].start, end = PHASES[PHASES.length - 1].end;
  const dayNum = Math.max(1, daysBetween(start, todayStr()) + 1);
  const left = Math.max(0, daysBetween(todayStr(), end));
  const phase = currentPhase();

  document.getElementById('dayNumber').textContent = dayNum;
  document.getElementById('daysLeft').textContent = left;
  document.getElementById('phaseNumber').textContent = 'P' + phase.n;
  document.getElementById('phaseLabel').textContent = 'Phase';
}

async function renderDashboard() {
  const phase = currentPhase();
  document.getElementById('dashPhaseTitle').textContent = `Phase ${phase.n} — ${phase.title}`;
  document.getElementById('dashPhaseGoal').textContent = `${formatDate(phase.start)} → ${formatDate(phase.end)}`;

  const dayKey = DAY_KEYS[new Date().getDay()];
  const assign = plan.schedule[dayKey];
  const box = document.getElementById('todayWorkout');
  box.innerHTML = '';
  if (assign === 'rest') {
    box.innerHTML = '<p class="muted">Rest day.</p>';
  } else if (assign === 'walk') {
    box.innerHTML = '<p class="muted">Walk — 30–60 min.</p>';
  } else if (plan.workouts[assign]) {
    plan.workouts[assign].exercises.forEach(ex => {
      const row = document.createElement('div');
      row.className = 'ex-row';
      row.innerHTML = `<span>${escapeHtml(ex.name)}</span><span class="muted">${escapeHtml(ex.sets)}×${escapeHtml(ex.reps)}</span>`;
      box.appendChild(row);
    });
  } else {
    box.innerHTML = '<p class="muted">No workout assigned for today.</p>';
  }

  const items = (await store.getChecklist(todayStr())) || {};
  const summary = document.getElementById('dashChecklistSummary');
  summary.innerHTML = '';
  CHECKLIST_ITEMS.forEach(ci => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (items[ci.key] ? ' done' : '');
    chip.textContent = ci.label.split(' ').slice(0, 2).join(' ');
    summary.appendChild(chip);
  });
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   WORKOUTS PANEL (editable)
   ============================================================ */

function renderWorkouts() {
  const list = document.getElementById('workoutList');
  list.innerHTML = '';

  Object.entries(plan.workouts).forEach(([key, w]) => {
    const card = document.createElement('div');
    card.className = 'workout-card';

    const head = document.createElement('div');
    head.className = 'workout-card-head';
    const nameInput = document.createElement('input');
    nameInput.value = w.name;
    nameInput.addEventListener('change', () => { w.name = nameInput.value; savePlan(); });
    head.appendChild(nameInput);

    const delWorkoutBtn = document.createElement('button');
    delWorkoutBtn.className = 'btn btn-danger btn-sm';
    delWorkoutBtn.textContent = 'Delete workout';
    delWorkoutBtn.addEventListener('click', () => {
      if (confirm(`Delete "${w.name}"? This can't be undone.`)) {
        delete plan.workouts[key];
        savePlan();
        renderWorkouts();
        renderSchedule();
      }
    });
    head.appendChild(delWorkoutBtn);
    card.appendChild(head);

    w.exercises.forEach(ex => {
      card.appendChild(renderExerciseRow(w, ex));
    });

    const foot = document.createElement('div');
    foot.className = 'workout-card-foot';
    const addExBtn = document.createElement('button');
    addExBtn.className = 'btn btn-ghost btn-sm';
    addExBtn.textContent = '+ Add exercise';
    addExBtn.addEventListener('click', () => {
      w.exercises.push({ id: 'ex' + Date.now(), name: '', sets: '3', reps: '10' });
      savePlan();
      renderWorkouts();
    });
    foot.appendChild(addExBtn);
    card.appendChild(foot);

    list.appendChild(card);
  });

  const addWorkoutFoot = document.createElement('div');
  list.appendChild(addWorkoutFoot);
}

function renderExerciseRow(workout, ex) {
  const row = document.createElement('div');
  row.className = 'exercise-row';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Exercise name';
  nameInput.value = ex.name;
  nameInput.addEventListener('change', () => { ex.name = nameInput.value; savePlan(); });

  const setsInput = document.createElement('input');
  setsInput.placeholder = 'Sets';
  setsInput.value = ex.sets;
  setsInput.addEventListener('change', () => { ex.sets = setsInput.value; savePlan(); });

  const repsInput = document.createElement('input');
  repsInput.placeholder = 'Reps';
  repsInput.value = ex.reps;
  repsInput.addEventListener('change', () => { ex.reps = repsInput.value; savePlan(); });

  const delBtn = document.createElement('button');
  delBtn.textContent = '✕';
  delBtn.title = 'Remove exercise';
  delBtn.addEventListener('click', () => {
    workout.exercises = workout.exercises.filter(e => e.id !== ex.id);
    savePlan();
    renderWorkouts();
  });

  row.append(nameInput, setsInput, repsInput, delBtn);
  return row;
}

document.getElementById('addWorkoutBtn').addEventListener('click', () => {
  let key = 'W' + (Object.keys(plan.workouts).length + 1);
  while (plan.workouts[key]) key += 'x';
  plan.workouts[key] = { name: 'New Workout', exercises: [] };
  savePlan();
  renderWorkouts();
  renderSchedule();
});

/* ============================================================
   SCHEDULE PANEL (editable)
   ============================================================ */

function renderSchedule() {
  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = '';

  DAY_KEYS.forEach(dayKey => {
    const label = document.createElement('div');
    label.className = 'schedule-day-label';
    label.textContent = DAY_LABELS[dayKey];
    grid.appendChild(label);

    const cell = document.createElement('div');
    cell.className = 'schedule-day-select';
    const select = document.createElement('select');

    const options = [
      { value: 'rest', label: 'Rest' },
      { value: 'walk', label: 'Walk' },
      ...Object.entries(plan.workouts).map(([k, w]) => ({ value: k, label: w.name }))
    ];
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (plan.schedule[dayKey] === o.value) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      plan.schedule[dayKey] = select.value;
      savePlan();
      renderDashboard();
    });

    cell.appendChild(select);
    grid.appendChild(cell);
  });
}

async function savePlan() {
  await store.savePlan(plan);
}

/* ============================================================
   CHECKLIST PANEL
   ============================================================ */

async function renderChecklist(dateStr) {
  const items = (await store.getChecklist(dateStr)) || {};
  const container = document.getElementById('checklistItems');
  container.innerHTML = '';

  CHECKLIST_ITEMS.forEach(ci => {
    const row = document.createElement('div');
    row.className = 'check-row' + (items[ci.key] ? ' checked' : '');
    row.innerHTML = `<span class="box"></span><span class="label">${escapeHtml(ci.label)}</span>`;
    row.addEventListener('click', async () => {
      items[ci.key] = !items[ci.key];
      row.classList.toggle('checked', !!items[ci.key]);
      await store.saveChecklist(dateStr, items);
      if (dateStr === todayStr()) renderDashboard();
    });
    container.appendChild(row);
  });
}

const checklistDateInput = document.getElementById('checklistDate');
checklistDateInput.value = todayStr();
checklistDateInput.addEventListener('change', () => renderChecklist(checklistDateInput.value));

/* ============================================================
   PROGRESS PANEL
   ============================================================ */

let progressEntries = [];

async function renderProgress() {
  progressEntries = (await store.getProgress()) || [];
  progressEntries.sort((a, b) => a.date.localeCompare(b.date));

  const table = document.getElementById('progressTable');
  if (progressEntries.length === 0) {
    table.innerHTML = '<p class="muted" style="padding:14px;">No entries yet. Log your baseline photos and measurements to start tracking.</p>';
  } else {
    let html = '<table><thead><tr><th>Date</th><th>Weight</th><th>Waist</th><th>Chest</th><th>Arm</th><th>Thigh</th><th></th></tr></thead><tbody>';
    progressEntries.forEach(e => {
      html += `<tr>
        <td>${escapeHtml(e.date)}</td>
        <td>${escapeHtml(e.weight ?? '—')}</td>
        <td>${escapeHtml(e.waist ?? '—')}</td>
        <td>${escapeHtml(e.chest ?? '—')}</td>
        <td>${escapeHtml(e.arm ?? '—')}</td>
        <td>${escapeHtml(e.thigh ?? '—')}</td>
        <td class="actions"><button data-id="${e.id}">✕</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    table.innerHTML = html;
    table.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        progressEntries = progressEntries.filter(e => e.id !== btn.dataset.id);
        await store.saveProgress(progressEntries);
        renderProgress();
      });
    });
  }

  drawChart(progressEntries);
}

function drawChart(entries) {
  const canvas = document.getElementById('progressChart');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = 140;
  ctx.clearRect(0, 0, w, h);

  const withWeight = entries.filter(e => e.weight !== undefined && e.weight !== '' && e.weight !== null);
  if (withWeight.length < 2) {
    ctx.fillStyle = '#565B50';
    ctx.font = '12px IBM Plex Mono';
    ctx.fillText('Log 2+ weight entries to see a trend line.', 10, h / 2);
    return;
  }

  const weights = withWeight.map(e => parseFloat(e.weight));
  const min = Math.min(...weights), max = Math.max(...weights);
  const pad = 20;
  const range = (max - min) || 1;

  ctx.strokeStyle = '#B23A28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  withWeight.forEach((e, i) => {
    const x = pad + (i / (withWeight.length - 1)) * (w - pad * 2);
    const y = h - pad - ((parseFloat(e.weight) - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#20241F';
  withWeight.forEach((e, i) => {
    const x = pad + (i / (withWeight.length - 1)) * (w - pad * 2);
    const y = h - pad - ((parseFloat(e.weight) - min) / range) * (h - pad * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

document.getElementById('addProgressBtn').addEventListener('click', () => {
  openModal('Log Progress Entry', [
    { key: 'date', label: 'Date', type: 'date', value: todayStr() },
    { key: 'weight', label: 'Weight (kg)', type: 'number' },
    { key: 'waist', label: 'Waist (cm)', type: 'number' },
    { key: 'chest', label: 'Chest (cm)', type: 'number' },
    { key: 'arm', label: 'Arm (cm)', type: 'number' },
    { key: 'thigh', label: 'Thigh (cm)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'text' }
  ], async (values) => {
    progressEntries.push({ id: 'p' + Date.now(), ...values });
    await store.saveProgress(progressEntries);
    renderProgress();
  });
});

/* ============================================================
   MODAL HELPER
   ============================================================ */

function openModal(title, fields, onSubmit) {
  const root = document.getElementById('modalRoot');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h3>${escapeHtml(title)}</h3>`;

  const inputs = {};
  fields.forEach(f => {
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.type = f.type || 'text';
    if (f.value) input.value = f.value;
    inputs[f.key] = input;
    modal.appendChild(label);
    modal.appendChild(input);
  });

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const values = {};
    Object.entries(inputs).forEach(([k, el]) => { values[k] = el.value; });
    onSubmit(values);
    overlay.remove();
  });
  actions.append(cancelBtn, saveBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  root.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ============================================================
   INIT
   ============================================================ */

async function bootApp() {
  plan = await store.getPlan();
  if (!plan) {
    plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
    await store.savePlan(plan);
  }

  renderScoreboard();
  await renderDashboard();
  renderWorkouts();
  renderSchedule();
  await renderChecklist(checklistDateInput.value || todayStr());
  await renderProgress();
}

async function main() {
  setupTabs();
  await initStore();   // resolves once a store (local, or signed-in firestore) is ready
  await bootApp();
}

main();
