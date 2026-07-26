import { firebaseConfig, isConfigured } from './firebase-config.js';

/* ============================================================
   CONSTANTS
   ============================================================ */

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = { sun:'Sunday', mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' };
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];


const DEFAULT_PLAN = {
  workouts: {
    A: { name:'Workout A', exercises:[
      {id:'a1',name:'Push-ups',sets:'3',reps:'6-15'},
      {id:'a2',name:'Bodyweight squats',sets:'3',reps:'12-20'},
      {id:'a3',name:'Backpack rows',sets:'3',reps:'10-15'},
      {id:'a4',name:'Reverse lunges',sets:'3',reps:'8-12 ea'},
      {id:'a5',name:'Pike push-ups',sets:'3',reps:'6-12'},
      {id:'a6',name:'Plank',sets:'3',reps:'30-60s'}
    ]},
    B: { name:'Workout B', exercises:[
      {id:'b1',name:'Push-ups',sets:'3',reps:'6-15'},
      {id:'b2',name:'Bulgarian split squats',sets:'3',reps:'8-12 ea'},
      {id:'b3',name:'Backpack Romanian deadlift',sets:'3',reps:'10-15'},
      {id:'b4',name:'Backpack curls',sets:'3',reps:'10-15'},
      {id:'b5',name:'Chair/bench triceps dips',sets:'3',reps:'8-15'},
      {id:'b6',name:'Dead bug',sets:'3',reps:'8-12 ea'}
    ]}
  },
  schedule: { mon:'A', tue:'walk', wed:'B', thu:'walk', fri:'A', sat:'walk', sun:'rest' }
};

const PHASES = [
  { n:1, start:'2026-07-26', end:'2026-08-22', title:'Build the habit' },
  { n:2, start:'2026-08-23', end:'2026-10-03', title:'Lose fat + build muscle' },
  { n:3, start:'2026-10-04', end:'2026-11-14', title:'Visible physique transformation' },
  { n:4, start:'2026-11-15', end:'2026-12-15', title:'Sharpen the result' }
];

const DEFAULT_GOALS = { steps: 10000, sleep: 8 };

const BADGES = [
  { key:'firstWorkout', icon:'🏁', name:'First Workout', test: d => d.workoutLog.length >= 1 },
  { key:'streak7', icon:'🔥', name:'7-Day Streak', test: d => d.streak.streak >= 7 },
  { key:'streak30', icon:'💎', name:'30-Day Streak', test: d => d.streak.streak >= 30 },
  { key:'tenWorkouts', icon:'🏋️', name:'10 Workouts', test: d => d.workoutLog.length >= 10 },
  { key:'firstBody', icon:'📏', name:'First Body Log', test: d => d.bodyLog.length >= 1 },
  { key:'halfway', icon:'🏔️', name:'Halfway Point', test: d => d.dayNum >= 71 },
  { key:'phase3', icon:'🚀', name:'Phase 3 Reached', test: d => d.phase.n >= 3 },
  { key:'finish', icon:'🏆', name:'Finish Line', test: d => d.dayNum >= 142 },
  { key:'fiveBody', icon:'📈', name:'5 Body Logs', test: d => d.bodyLog.length >= 5 }
];

/* ============================================================
   STATE
   ============================================================ */

let store, plan, goals, currentUser;
let cache = { checklistToday:{}, metrics:{}, bodyLog:[], workoutLog:[], streak:{streak:0,lastDate:null} };
let charts = {};

/* ============================================================
   DATE HELPERS
   ============================================================ */

const todayStr = () => fmt(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate()-1); return fmt(d); };
function fmt(d){ return d.toISOString().slice(0,10); }
function addDays(dateStr, n){ const d = new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return fmt(d); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
function last7Dates(){ const arr=[]; for(let i=6;i>=0;i--) arr.push(addDays(todayStr(),-i)); return arr; }
function last30Dates(){ const arr=[]; for(let i=29;i>=0;i--) arr.push(addDays(todayStr(),-i)); return arr; }
function niceDate(d){ return new Date(d+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function currentPhase(){
  const t = todayStr();
  for(const p of PHASES){ if(t>=p.start && t<=p.end) return p; }
  return t < PHASES[0].start ? PHASES[0] : PHASES[PHASES.length-1];
}
function dayNumber(){ return Math.max(1, daysBetween(PHASES[0].start, todayStr())+1); }

/* ============================================================
   STORE — Firestore (Google auth) or localStorage fallback
   ============================================================ */

const statusEl = () => document.getElementById('syncStatus');
const loginScreen = () => document.getElementById('loginScreen');
const appBody = () => document.getElementById('appBody');

function buildFirestoreStore(db, fns, uid){
  const { doc, getDoc, setDoc } = fns;
  const dataDoc = key => doc(db,'users',uid,'data',key);
  const metricDoc = dateStr => doc(db,'users',uid,'metrics',dateStr);
  const checklistDoc = dateStr => doc(db,'users',uid,'checklist',dateStr);
  return {
    backend:'firestore',
    async getData(key){ const s = await getDoc(dataDoc(key)); return s.exists() ? s.data() : null; },
    async setData(key,val){ await setDoc(dataDoc(key), val); },
    async getMetrics(dateStr){ const s = await getDoc(metricDoc(dateStr)); return s.exists() ? s.data() : null; },
    async setMetrics(dateStr,val){ await setDoc(metricDoc(dateStr), val); },
    async getChecklist(dateStr){ const s = await getDoc(checklistDoc(dateStr)); return s.exists() ? s.data().items : null; },
    async setChecklist(dateStr,items){ await setDoc(checklistDoc(dateStr), {items}); }
  };
}

function buildLocalStore(){
  const read = (k,fb) => { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; };
  const write = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  return {
    backend:'local',
    async getData(key){ return read('lb_data_'+key, null); },
    async setData(key,val){ write('lb_data_'+key, val); },
    async getMetrics(dateStr){ return read('lb_metrics_'+dateStr, null); },
    async setMetrics(dateStr,val){ write('lb_metrics_'+dateStr, val); },
    async getChecklist(dateStr){ return read('lb_check_'+dateStr, null); },
    async setChecklist(dateStr,items){ write('lb_check_'+dateStr, items); }
  };
}

function useLocalFallback(reason){
  store = buildLocalStore();
  statusEl().textContent = reason;
  loginScreen().style.display = 'none';
  appBody().style.display = 'block';
  currentUser = { displayName:'You', email:'', local:true };
}

async function initStore(){
  if(!isConfigured){ useLocalFallback('no firestore config — using local storage'); return; }
  try{
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { getFirestore, doc, getDoc, setDoc } = fsMod;
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    document.getElementById('signInBtn').addEventListener('click', async () => {
      document.getElementById('loginError').textContent = '';
      try{ await signInWithPopup(auth, provider); }
      catch(err){ document.getElementById('loginError').textContent = 'Sign-in failed — ' + err.message; }
    });
    document.getElementById('signOutBtn').addEventListener('click', () => signOut(auth));

    return await new Promise(resolve => {
      let resolved = false;
      onAuthStateChanged(auth, async user => {
        if(user){
          store = buildFirestoreStore(db, {doc,getDoc,setDoc}, user.uid);
          currentUser = user;
          statusEl().textContent = 'synced — firestore (' + (user.email||'google account') + ')';
          loginScreen().style.display = 'none';
          appBody().style.display = 'block';
          if(!resolved){ resolved = true; resolve(); } else { await bootApp(); }
        } else {
          loginScreen().style.display = 'flex';
          appBody().style.display = 'none';
        }
      });
    });
  } catch(err){
    console.error('Firebase init failed:', err);
    useLocalFallback('firestore unavailable — using local storage');
  }
}

/* ============================================================
   THEME
   ============================================================ */

function applyTheme(mode){
  const root = document.documentElement;
  const effective = mode === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  root.setAttribute('data-theme', effective);
  document.getElementById('themeIconSun').style.display = effective === 'dark' ? 'none' : 'block';
  document.getElementById('themeIconMoon').style.display = effective === 'dark' ? 'block' : 'none';
  document.querySelectorAll('#themeSegmented button').forEach(b => b.classList.toggle('active', b.dataset.theme === mode));
}

function setupTheme(){
  const stored = localStorage.getItem('lb_theme') || 'auto';
  applyTheme(stored);
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('lb_theme', next);
    applyTheme(next);
  });
  document.querySelectorAll('#themeSegmented button').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('lb_theme', btn.dataset.theme);
      applyTheme(btn.dataset.theme);
    });
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if((localStorage.getItem('lb_theme')||'auto') === 'auto') applyTheme('auto');
  });
}

/* ============================================================
   NAVIGATION
   ============================================================ */

function setupNav(){
  function go(viewName){
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + viewName));
    window.scrollTo({top:0, behavior:'instant'});
  }
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.view)));
  document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.nav)));
  document.getElementById('profileShortcut').addEventListener('click', () => go('profile'));
  window._goView = go;
}

/* ============================================================
   DATA LOADING
   ============================================================ */

async function loadAll(){
  plan = await store.getData('plan');
  if(!plan){ plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)); await store.setData('plan', plan); }

  goals = await store.getData('goals') || { ...DEFAULT_GOALS };
  cache.bodyLog = (await store.getData('bodyLog'))?.entries || [];
  cache.workoutLog = (await store.getData('workoutLog'))?.entries || [];
  cache.streak = await store.getData('streak') || { streak:0, lastDate:null };
  cache.profile = await store.getData('profile') || { height:null };

  cache.checklistToday = await store.getChecklist(todayStr()) || {};
  cache.metricsToday = await store.getMetrics(todayStr()) || {};

  const dates7 = last7Dates();
  cache.metricsWeek = {};
  await Promise.all(dates7.map(async d => { cache.metricsWeek[d] = await store.getMetrics(d) || {}; }));

  cache.checklistYesterday = await store.getChecklist(yesterdayStr());
  cache.metricsYesterday = await store.getMetrics(yesterdayStr());
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function renderHeader(){
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = greeting + (currentUser?.displayName ? ', ' + currentUser.displayName.split(' ')[0] : '') + ' 👋';
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'});
  const initial = (currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase();
  document.getElementById('avatarInitial').textContent = initial;
  document.getElementById('avatarLg').textContent = initial;
  document.getElementById('profileName').textContent = currentUser?.displayName || 'You';
  document.getElementById('profileEmail').textContent = currentUser?.email || (store.backend === 'local' ? 'Local device only' : '');
}

function renderYesterdayBanner(){
  const hasChecklist = cache.checklistYesterday && Object.values(cache.checklistYesterday).some(Boolean);
  const hasMetrics = cache.metricsYesterday && Object.keys(cache.metricsYesterday).length > 0;
  const banner = document.getElementById('yesterdayBanner');
  if(!hasChecklist && !hasMetrics){
    banner.style.display = 'flex';
    document.getElementById('yesterdayBannerText').textContent = `No activity logged for ${niceDate(yesterdayStr())}. Add it so your streak and charts stay accurate.`;
    document.getElementById('yesterdayBannerBtn').onclick = () => openQuickLogModal(yesterdayStr());
  } else {
    banner.style.display = 'none';
  }
}

function setRing(circle, pct, radius){
  const c = 2 * Math.PI * radius;
  circle.style.strokeDasharray = c;
  const clamped = Math.max(0, Math.min(1, pct));
  circle.style.strokeDashoffset = c * (1 - clamped);
}

function renderTicks(){
  const g = document.getElementById('tickMarks');
  if(g.childElementCount) return;
  for(let i=0;i<60;i++){
    const angle = (i/60) * 2*Math.PI;
    const r1=95, r2 = i%5===0 ? 88 : 92;
    const x1 = 100 + r1*Math.cos(angle), y1 = 100 + r1*Math.sin(angle);
    const x2 = 100 + r2*Math.cos(angle), y2 = 100 + r2*Math.sin(angle);
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',x1); line.setAttribute('y1',y1);
    line.setAttribute('x2',x2); line.setAttribute('y2',y2);
    line.setAttribute('class','tick');
    g.appendChild(line);
  }
}

function renderDashboard(){
  renderTicks();
  const steps = Number(cache.metricsToday.steps || 0);
  document.getElementById('stepsToday').textContent = steps.toLocaleString();
  document.getElementById('stepsGoalPill').textContent = 'Goal ' + goals.steps.toLocaleString();
  const pct = steps / goals.steps;
  setRing(document.getElementById('stepsRing'), pct, 82);
  document.getElementById('stepsPct').textContent = Math.round(pct*100) + '%';

  document.getElementById('heartRateVal').textContent = cache.metricsToday.heartRate ? cache.metricsToday.heartRate + ' bpm' : '–';
  document.getElementById('caloriesVal').textContent = cache.metricsToday.calories ? cache.metricsToday.calories.toLocaleString() : '–';
  document.getElementById('sleepVal').textContent = cache.metricsToday.sleepHours ? cache.metricsToday.sleepHours + 'h' : '–';

  const dates = last7Dates();
  document.getElementById('weekRangeLabel').textContent = niceDate(dates[0]) + ' – ' + niceDate(dates[6]);
  drawBarChart('weeklyChart', dates.map(d=>DAY_SHORT[new Date(d+'T00:00:00').getDay()]), dates.map(d=>Number(cache.metricsWeek[d]?.steps||0)), '#6C63FF');

  renderRecentWorkouts();
}

function renderRecentWorkouts(){
  const list = document.getElementById('recentWorkoutsList');
  const recent = [...cache.workoutLog].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  list.innerHTML = recent.length ? '' : '<p class="timeline-empty">No workouts logged yet. Complete today\'s session to start your history.</p>';
  recent.forEach(w => {
    const row = document.createElement('div');
    row.className = 'timeline-item';
    row.innerHTML = `<div><div class="t-name">${escapeHtml(w.workoutName)}</div><div class="t-date">${niceDate(w.date)}</div></div><span class="pill">✓ Done</span>`;
    list.appendChild(row);
  });
}

/* ============================================================
   CHARTS (Chart.js)
   ============================================================ */

function drawBarChart(canvasId, labels, data, color){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor: color, borderRadius:8, maxBarThickness:26 }] },
    options:{
      plugins:{ legend:{display:false} },
      scales:{ x:{grid:{display:false}}, y:{grid:{color:'rgba(150,150,170,0.15)'}, beginAtZero:true} },
      animation:{ duration:600 }
    }
  });
}

function drawLineChart(canvasId, labels, data, color){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ data, borderColor:color, backgroundColor: color+'22', fill:true, tension:.4, pointRadius:3 }] },
    options:{
      plugins:{ legend:{display:false} },
      scales:{ x:{grid:{display:false}}, y:{grid:{color:'rgba(150,150,170,0.15)'}} },
      animation:{ duration:600 }
    }
  });
}

/* ============================================================
   ACTIVITY VIEW
   ============================================================ */

async function renderActivity(range){
  range = range || 'week';
  const dates = range === 'week' ? last7Dates() : last30Dates();
  let metricsMap = cache.metricsWeek;
  if(range === 'month'){
    metricsMap = {};
    await Promise.all(dates.map(async d => { metricsMap[d] = cache.metricsWeek[d] || await store.getMetrics(d) || {}; }));
  }
  const labels = dates.map(d => range === 'week' ? DAY_SHORT[new Date(d+'T00:00:00').getDay()] : niceDate(d));
  drawBarChart('stepsChart', labels, dates.map(d=>Number(metricsMap[d]?.steps||0)), '#6C63FF');
  drawLineChart('hrChart', labels, dates.map(d=>metricsMap[d]?.heartRate||null), '#FF6584');
  drawBarChart('sleepChart', labels, dates.map(d=>Number(metricsMap[d]?.sleepHours||0)), '#2E3A8C');
  drawBarChart('calChart', labels, dates.map(d=>Number(metricsMap[d]?.calories||0)), '#FF7A59');

  renderBodyLog();
}

function computeBmi(weightKg, heightCm){
  if(!weightKg || !heightCm) return null;
  const m = heightCm/100;
  return +(weightKg / (m*m)).toFixed(1);
}
function bmiCategory(bmi){
  if(bmi==null) return '–';
  if(bmi<18.5) return 'Underweight';
  if(bmi<25) return 'Healthy';
  if(bmi<30) return 'Overweight';
  return 'Obese';
}

function renderBodyLog(){
  const entries = [...cache.bodyLog].sort((a,b)=>a.date.localeCompare(b.date));
  const height = cache.profile.height;
  const latest = entries[entries.length-1];
  const bmi = latest ? computeBmi(Number(latest.weight), height || latest.height) : null;

  document.getElementById('bmiSummary').innerHTML = `
    <div class="bmi-chip"><span class="v">${latest ? latest.weight+' kg' : '–'}</span><span class="l">Latest weight</span></div>
    <div class="bmi-chip"><span class="v">${height ? height+' cm' : '–'}</span><span class="l">Height</span></div>
    <div class="bmi-chip"><span class="v">${bmi ?? '–'}</span><span class="l">BMI · ${escapeHtml(bmiCategory(bmi))}</span></div>
  `;

  drawLineChart('weightChart', entries.map(e=>niceDate(e.date)), entries.map(e=>Number(e.weight)), '#21C7A8');

  const table = document.getElementById('bodyLogTable');
  if(!entries.length){
    table.innerHTML = '<p class="muted small">No entries yet. Aim to log weight weekly.</p>';
  } else {
    let html = '<table><thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th></th></tr></thead><tbody>';
    [...entries].reverse().forEach(e => {
      const b = computeBmi(Number(e.weight), height || e.height);
      html += `<tr><td>${niceDate(e.date)}</td><td>${escapeHtml(e.weight)} kg</td><td>${b ?? '–'}</td><td><button data-id="${e.id}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    table.innerHTML = html;
    table.querySelectorAll('button[data-id]').forEach(btn => btn.addEventListener('click', async () => {
      cache.bodyLog = cache.bodyLog.filter(e => e.id !== btn.dataset.id);
      await store.setData('bodyLog', { entries: cache.bodyLog });
      renderBodyLog();
    }));
  }

  // weekly reminder
  const weekAgo = addDays(todayStr(), -7);
  const loggedThisWeek = entries.some(e => e.date >= weekAgo);
  if(!loggedThisWeek){
    document.getElementById('addBodyLogBtn').classList.add('link-btn');
  }
}

document.getElementById('addBodyLogBtn').addEventListener('click', () => {
  openModal('Log weight', [
    { key:'date', label:'Date', type:'date', value: todayStr() },
    { key:'weight', label:'Weight (kg)', type:'number' }
  ], async values => {
    cache.bodyLog.push({ id:'b'+Date.now(), date: values.date, weight: values.weight });
    await store.setData('bodyLog', { entries: cache.bodyLog });
    renderBodyLog();
  });
});

/* ---- Wearable sync: quick log + CSV import ---- */

function openQuickLogModal(dateStr){
  const existing = cache.metricsWeek[dateStr] || cache.metricsToday || {};
  openModal('Quick-log — ' + niceDate(dateStr), [
    { key:'steps', label:'Steps', type:'number', value: existing.steps || '' },
    { key:'heartRate', label:'Avg heart rate (bpm)', type:'number', value: existing.heartRate || '' },
    { key:'sleepHours', label:'Sleep (hours)', type:'number', value: existing.sleepHours || '' },
    { key:'calories', label:'Calories burned', type:'number', value: existing.calories || '' }
  ], async values => {
    const clean = {};
    Object.entries(values).forEach(([k,v]) => { if(v!=='') clean[k] = Number(v); });
    await store.setMetrics(dateStr, clean);
    if(dateStr === todayStr()) cache.metricsToday = clean;
    cache.metricsWeek[dateStr] = clean;
    renderYesterdayBanner();
    renderDashboard();
    renderActivity();
  });
}

document.getElementById('quickLogBtn').addEventListener('click', () => openQuickLogModal(todayStr()));

document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('csvFileInput').click());
document.getElementById('csvFileInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if(!file) return;
  const status = document.getElementById('importStatus');
  status.textContent = 'Importing…';
  try{
    const text = await file.text();
    const rows = text.trim().split('\n').map(r => r.split(','));
    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = { date: header.indexOf('date'), steps: header.indexOf('steps'), heartRate: header.indexOf('heartrate'), sleepHours: header.indexOf('sleephours'), calories: header.indexOf('calories') };
    if(idx.date === -1) throw new Error('CSV needs a "date" column (YYYY-MM-DD). Optional columns: steps, heartRate, sleepHours, calories.');
    let count = 0;
    for(const row of rows.slice(1)){
      if(!row[idx.date]) continue;
      const dateStr = row[idx.date].trim();
      const rec = {};
      if(idx.steps>-1 && row[idx.steps]) rec.steps = Number(row[idx.steps]);
      if(idx.heartRate>-1 && row[idx.heartRate]) rec.heartRate = Number(row[idx.heartRate]);
      if(idx.sleepHours>-1 && row[idx.sleepHours]) rec.sleepHours = Number(row[idx.sleepHours]);
      if(idx.calories>-1 && row[idx.calories]) rec.calories = Number(row[idx.calories]);
      await store.setMetrics(dateStr, rec);
      count++;
    }
    status.textContent = `Imported ${count} day(s). Refreshing…`;
    await loadAll();
    renderDashboard();
    await renderActivity();
    renderYesterdayBanner();
  } catch(err){
    status.textContent = 'Import failed — ' + err.message;
  }
  e.target.value = '';
});

/* ============================================================
   WORKOUTS VIEW
   ============================================================ */

function todaysAssignment(){
  const dayKey = DAY_KEYS[new Date().getDay()];
  return { dayKey, assign: plan.schedule[dayKey] };
}

function renderTodayWorkoutBlock(){
  const { assign } = todaysAssignment();
  const box = document.getElementById('todayWorkoutBlock');
  const logBtn = document.getElementById('logWorkoutBtn');
  if(assign === 'rest'){ box.innerHTML = '<p class="muted">Rest day — recovery matters too.</p>'; logBtn.style.display='none'; return; }
  if(assign === 'walk'){ box.innerHTML = '<p class="muted">Walk — 30–60 min.</p>'; logBtn.style.display='none'; return; }
  const w = plan.workouts[assign];
  if(!w){ box.innerHTML = '<p class="muted">No workout assigned today.</p>'; logBtn.style.display='none'; return; }
  logBtn.style.display = 'block';
  const alreadyLogged = cache.workoutLog.some(l => l.date === todayStr());
  logBtn.textContent = alreadyLogged ? "Today's workout logged ✓" : "Mark today's workout complete";
  logBtn.disabled = alreadyLogged;
  box.innerHTML = w.exercises.map(ex => `<div class="ex-row" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line);"><span>${escapeHtml(ex.name)}</span><span class="muted">${escapeHtml(ex.sets)}×${escapeHtml(ex.reps)}</span></div>`).join('');
}

document.getElementById('logWorkoutBtn').addEventListener('click', async () => {
  const { assign } = todaysAssignment();
  const w = plan.workouts[assign];
  if(!w) return;
  cache.workoutLog.push({ id:'w'+Date.now(), date: todayStr(), workoutKey: assign, workoutName: w.name });
  await store.setData('workoutLog', { entries: cache.workoutLog });
  await recomputeStreak(todayStr(), true);
  renderTodayWorkoutBlock();
  renderRecentWorkouts();
  renderWorkoutHistory();
  renderGoalVsActual();
  renderInsights();
});

function renderGoalVsActual(){
  const box = document.getElementById('goalVsActual');
  const plannedThisWeek = Object.values(plan.schedule).filter(v => v !== 'rest' && v !== 'walk').length;
  const weekStart = addDays(todayStr(), -6);
  const actualThisWeek = cache.workoutLog.filter(l => l.date >= weekStart).length;
  const pct = plannedThisWeek ? Math.min(1, actualThisWeek/plannedThisWeek) : 0;
  box.innerHTML = `
    <div class="gva-row"><span class="gva-label">Workouts</span><div class="gva-bar-track"><div class="gva-bar-fill" style="width:${pct*100}%"></div></div><span class="gva-val">${actualThisWeek}/${plannedThisWeek}</span></div>
  `;
}

function renderWorkoutList(){
  const list = document.getElementById('workoutList');
  list.innerHTML = '';
  Object.entries(plan.workouts).forEach(([key,w]) => {
    const card = document.createElement('div');
    card.className = 'workout-card';
    const head = document.createElement('div');
    head.className = 'workout-card-head';
    const nameInput = document.createElement('input');
    nameInput.value = w.name;
    nameInput.addEventListener('change', () => { w.name = nameInput.value; savePlan(); });
    head.appendChild(nameInput);
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      if(confirm(`Delete "${w.name}"?`)){ delete plan.workouts[key]; savePlan(); renderWorkoutList(); renderSchedule(); renderTodayWorkoutBlock(); }
    });
    head.appendChild(delBtn);
    card.appendChild(head);
    w.exercises.forEach(ex => card.appendChild(exerciseRow(w, ex)));
    const foot = document.createElement('div');
    foot.className = 'workout-card-foot';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-ghost btn-sm';
    addBtn.textContent = '+ Add exercise';
    addBtn.addEventListener('click', () => { w.exercises.push({id:'ex'+Date.now(),name:'',sets:'3',reps:'10'}); savePlan(); renderWorkoutList(); });
    foot.appendChild(addBtn);
    card.appendChild(foot);
    list.appendChild(card);
  });
}

function exerciseRow(workout, ex){
  const row = document.createElement('div');
  row.className = 'exercise-row';
  const nameInput = document.createElement('input'); nameInput.placeholder='Exercise'; nameInput.value=ex.name;
  nameInput.addEventListener('change', () => { ex.name=nameInput.value; savePlan(); });
  const setsInput = document.createElement('input'); setsInput.placeholder='Sets'; setsInput.value=ex.sets;
  setsInput.addEventListener('change', () => { ex.sets=setsInput.value; savePlan(); });
  const repsInput = document.createElement('input'); repsInput.placeholder='Reps'; repsInput.value=ex.reps;
  repsInput.addEventListener('change', () => { ex.reps=repsInput.value; savePlan(); });
  const delBtn = document.createElement('button'); delBtn.textContent='✕';
  delBtn.addEventListener('click', () => { workout.exercises = workout.exercises.filter(e=>e.id!==ex.id); savePlan(); renderWorkoutList(); });
  row.append(nameInput, setsInput, repsInput, delBtn);
  return row;
}

document.getElementById('addWorkoutBtn').addEventListener('click', () => {
  let key = 'W'+(Object.keys(plan.workouts).length+1);
  while(plan.workouts[key]) key += 'x';
  plan.workouts[key] = { name:'New Workout', exercises:[] };
  savePlan(); renderWorkoutList(); renderSchedule();
});

function renderSchedule(){
  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = '';
  DAY_KEYS.forEach(dayKey => {
    const row = document.createElement('div');
    row.className = 'schedule-row';
    const label = document.createElement('span');
    label.className = 'day';
    label.textContent = DAY_LABELS[dayKey];
    const select = document.createElement('select');
    const options = [{value:'rest',label:'Rest'},{value:'walk',label:'Walk'}, ...Object.entries(plan.workouts).map(([k,w])=>({value:k,label:w.name}))];
    options.forEach(o => { const opt=document.createElement('option'); opt.value=o.value; opt.textContent=o.label; if(plan.schedule[dayKey]===o.value) opt.selected=true; select.appendChild(opt); });
    select.addEventListener('change', () => { plan.schedule[dayKey]=select.value; savePlan(); renderTodayWorkoutBlock(); renderGoalVsActual(); });
    row.append(label, select);
    grid.appendChild(row);
  });
}

async function savePlan(){ await store.setData('plan', plan); }

function renderWorkoutHistory(){
  const list = document.getElementById('workoutHistory');
  const sorted = [...cache.workoutLog].sort((a,b)=>b.date.localeCompare(a.date));
  list.innerHTML = sorted.length ? '' : '<p class="timeline-empty">Nothing logged yet.</p>';
  sorted.forEach(w => {
    const row = document.createElement('div');
    row.className = 'timeline-item';
    row.innerHTML = `<div><div class="t-name">${escapeHtml(w.workoutName)}</div><div class="t-date">${niceDate(w.date)}</div></div><span class="pill">✓</span>`;
    list.appendChild(row);
  });
}

document.getElementById('startWorkoutBtn').addEventListener('click', () => window._goView('workouts'));

/* ============================================================
   STREAK
   ============================================================ */

async function recomputeStreak(dateStr, isComplete){
  if(!isComplete) return;
  const s = cache.streak;
  if(s.lastDate === dateStr) return;
  if(s.lastDate === addDays(dateStr,-1)){ s.streak += 1; }
  else { s.streak = 1; }
  s.lastDate = dateStr;
  await store.setData('streak', s);
}

/* ============================================================
   INSIGHTS
   ============================================================ */

function renderInsights(){
  const dayNum = dayNumber();
  const phase = currentPhase();

  // health score: blend of steps%, sleep%, workout consistency
  const dates = last7Dates();
  const avgStepsPct = dates.reduce((sum,d)=>sum + Math.min(1,(cache.metricsWeek[d]?.steps||0)/goals.steps), 0) / 7;
  const avgSleepPct = dates.reduce((sum,d)=>sum + Math.min(1,(cache.metricsWeek[d]?.sleepHours||0)/goals.sleep), 0) / 7;
  const workoutsThisWeek = cache.workoutLog.filter(l => l.date >= dates[0]).length;
  const plannedThisWeek = Object.values(plan.schedule).filter(v=>v!=='rest'&&v!=='walk').length || 1;
  const workoutPct = Math.min(1, workoutsThisWeek/plannedThisWeek);
  const score = Math.round((avgStepsPct*0.4 + avgSleepPct*0.3 + workoutPct*0.3) * 100);

  const ring = document.getElementById('healthScoreRing');
  const c = 2*Math.PI*50;
  ring.style.strokeDasharray = c;
  ring.style.strokeDashoffset = c * (1 - score/100);
  document.getElementById('healthScoreVal').textContent = score;

  document.getElementById('scoreBreakdown').innerHTML = `
    <div class="score-item"><span>Steps</span><strong>${Math.round(avgStepsPct*100)}%</strong></div>
    <div class="score-item"><span>Sleep</span><strong>${Math.round(avgSleepPct*100)}%</strong></div>
    <div class="score-item"><span>Workouts</span><strong>${workoutsThisWeek}/${plannedThisWeek}</strong></div>
  `;

  // phase timeline
  const tEl = document.getElementById('phaseTimeline');
  tEl.innerHTML = '';
  PHASES.forEach(p => {
    const t = todayStr();
    const state = t > p.end ? 'done' : (t >= p.start && t <= p.end) ? 'active' : '';
    const item = document.createElement('div');
    item.className = 'phase-item';
    item.innerHTML = `<div class="phase-dot-col"><span class="phase-dot ${state}"></span><span class="phase-line"></span></div>
      <div><div class="phase-title">Phase ${p.n} — ${escapeHtml(p.title)}</div><div class="phase-dates">${niceDate(p.start)} – ${niceDate(p.end)}</div></div>`;
    tEl.appendChild(item);
  });

  // badges
  const badgeData = { workoutLog: cache.workoutLog, bodyLog: cache.bodyLog, streak: cache.streak, dayNum, phase };
  const grid = document.getElementById('badgeGrid');
  grid.innerHTML = '';
  BADGES.forEach(b => {
    const earned = b.test(badgeData);
    const el = document.createElement('div');
    el.className = 'badge' + (earned ? ' earned' : '');
    el.innerHTML = `<span class="badge-icon">${b.icon}</span><span class="badge-name">${escapeHtml(b.name)}</span>`;
    grid.appendChild(el);
  });

  // monthly chart
  const dates30 = last30Dates();
  drawBarChart('monthlyChart', dates30.map((d,i)=> i%3===0 ? niceDate(d) : ''), dates30.map(d=>Number(cache.metricsWeek[d]?.steps || 0)), '#A78BFA');
}

/* ============================================================
   PROFILE
   ============================================================ */

function renderProfile(){
  document.getElementById('stepGoalInput').value = goals.steps;
  document.getElementById('sleepGoalInput').value = goals.sleep;
  document.getElementById('heightInput').value = cache.profile.height || '';
}

document.getElementById('saveGoalsBtn').addEventListener('click', async () => {
  goals.steps = Number(document.getElementById('stepGoalInput').value) || DEFAULT_GOALS.steps;
  goals.sleep = Number(document.getElementById('sleepGoalInput').value) || DEFAULT_GOALS.sleep;
  await store.setData('goals', goals);
  renderDashboard(); renderInsights();
});

document.getElementById('saveHeightBtn').addEventListener('click', async () => {
  cache.profile.height = Number(document.getElementById('heightInput').value) || null;
  await store.setData('profile', cache.profile);
  renderBodyLog();
});

/* ============================================================
   MODAL HELPER
   ============================================================ */

function openModal(title, fields, onSubmit){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
  const inputs = {};
  fields.forEach(f => {
    const label = document.createElement('label'); label.textContent = f.label;
    const input = document.createElement('input'); input.type = f.type || 'text';
    if(f.value !== undefined && f.value !== null) input.value = f.value;
    inputs[f.key] = input;
    modal.append(label, input);
  });
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button'); cancel.className='btn btn-ghost'; cancel.textContent='Cancel';
  cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button'); save.className='btn btn-primary'; save.textContent='Save';
  save.addEventListener('click', () => {
    const values = {}; Object.entries(inputs).forEach(([k,el]) => values[k]=el.value);
    onSubmit(values); overlay.remove();
  });
  actions.append(cancel, save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.getElementById('modalRoot').appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

document.querySelectorAll('[data-open]').forEach(card => {
  card.addEventListener('click', () => {
    const metric = card.dataset.open.split('-')[1];
    openQuickLogModal(todayStr());
  });
});

/* ============================================================
   INIT
   ============================================================ */

document.getElementById('stepsRangeToggle')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if(!btn) return;
  document.querySelectorAll('#stepsRangeToggle button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderActivity(btn.dataset.range);
});

async function bootApp(){
  await loadAll();
  renderHeader();
  renderYesterdayBanner();
  renderDashboard();
  await renderActivity('week');
  renderTodayWorkoutBlock();
  renderGoalVsActual();
  renderWorkoutList();
  renderSchedule();
  renderWorkoutHistory();
  renderInsights();
  renderProfile();
}

async function main(){
  setupTheme();
  setupNav();
  await initStore();
  await bootApp();
}

main();
