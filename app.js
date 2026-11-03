/* =========================================================
   Thailand Trip Tracker
   State lives in localStorage under KEY and syncs to Firebase.
   No dependencies, no build step.
   ========================================================= */

/* ---------------- demo mode ----------------
   Open the app with ?demo and it runs entirely on its own: no sign-in, no
   database, sample data to poke at. This is how someone who has just cloned
   the repo can look around without standing up a Firebase project first.

   Three things keep it from ever touching a real trip: it stores under its
   own key, sync is never started, and save() refuses to push. ?nodemo turns
   it back off. */
const DEMO = (() => {
  try {
    const q = new URL(location.href).searchParams;
    if (q.has('nodemo')) { localStorage.removeItem('th-trip-demo-on'); return false; }
    if (q.has('demo'))   { localStorage.setItem('th-trip-demo-on', '1'); return true; }
    return localStorage.getItem('th-trip-demo-on') === '1';
  } catch (e) { return false; }
})();

const KEY = DEMO ? 'th-trip-demo' : 'th-trip-v1';
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- taxonomy: category -> icon + palette slot ---------- */
const CATS = {
  'Food':          { ic:'bowl',   p:3  },
  'Stay':          { ic:'bed',    p:8  },
  'Transport':     { ic:'car',    p:6  },
  'Activities':    { ic:'ticket', p:2  },
  'Shopping':      { ic:'bag',    p:1  },
  'Drinks':        { ic:'cup',    p:9  },
  'SIM/Internet':  { ic:'wifi',   p:7  },
  'Visa & Fees':   { ic:'doc',    p:10 },
  'Spa & Massage': { ic:'leaf',   p:5  },
  'Flights':       { ic:'plane',  p:4  },
  'Misc':          { ic:'dots',   p:10 }
};
const DEFAULT_CATS = Object.keys(CATS);

const TYPES = {
  flight:    { label:'Flight',    ic:'plane',  p:4  },
  hotel:     { label:'Stay',      ic:'bed',    p:8  },
  transport: { label:'Transport', ic:'car',    p:6  },
  activity:  { label:'Activity',  ic:'ticket', p:2  },
  other:     { label:'Other',     ic:'dots',   p:10 }
};

const DEFAULT_CHECKLIST = [
  ['Documents','Passport valid 6+ months'],
  ['Documents','Thailand Digital Arrival Card (TDAC) submitted'],
  ['Documents','Return / onward ticket printout'],
  ['Documents','Hotel booking printouts (immigration may ask)'],
  ['Documents','Travel insurance policy'],
  ['Money','Order THB cash / forex card'],
  ['Money','Tell bank about international use'],
  ['Money','Keep ~20,000 THB proof of funds'],
  ['Packing','Universal adapter (Thailand: Type A/B/C)'],
  ['Packing','Sunscreen + mosquito repellent'],
  ['Packing','Light rain jacket / poncho'],
  ['Packing','Medicines + ORS sachets'],
  ['Before leaving','Download offline Google Maps'],
  ['Before leaving','Install Grab + Bolt apps'],
  ['In Thailand','Buy tourist SIM at airport (AIS/TrueMove)'],
  ['In Thailand','Agree taxi meter / use Grab only']
];
const GROUP_ORDER = ['Documents','Money','Packing','Before leaving','In Thailand'];

/* ============================== state ============================== */
let S = load();

function blank() {
  return {
    settings: {
      name:'Thailand', base:'THB', start:'', end:'', budget:0, rate:2.6,
      people:['Me'], categories:[...DEFAULT_CATS], theme:'system',
      budgetCur:'INR', rateAuto:true, rateLive:0, rateFetched:'', rateProvider:'',
      me:'', lastQuick:{ cat:'Food', method:'Cash', split:'shared' }
    },
    expenses:[], bookings:[], cash:[], removed:[], days:{},
    checklist: DEFAULT_CHECKLIST.map(([group,text]) => ({id:uid(),group,text,done:false})),
    notes:''
  };
}
/* Sample data for ?demo. Deliberately exercises the parts that are easy to get
   wrong: a shared cost, a personal one, a cost split between only some people,
   both currencies, and a booking still marked as an idea. */
function demoTrip() {
  const t = blank();
  Object.assign(t.settings, {
    name: 'Sample trip', start: '2026-11-14', end: '2026-11-24',
    people: ['Sam', 'Alex', 'Jo'], me: 'Sam',
    budget: 150000, budgetCur: 'INR', base: 'THB'
  });
  t.bookings = [
    { id:'demo1', type:'flight', title:'BLR → BKK · 6E 1051', status:'paid',
      from:'BLR', to:'BKK', city:'Bangkok', vendor:'IndiGo',
      start:'2026-11-14T09:20', end:'2026-11-14T14:50',
      cost:16726, cur:'INR', paidBy:'Sam', bookedBy:'Sam', split:'personal' },
    { id:'demo2', type:'hotel', title:'Riverside apartment', status:'paid',
      city:'Bangkok', vendor:'Airbnb',
      start:'2026-11-14T15:00', end:'2026-11-17T11:00',
      cost:32000, cur:'INR', paidBy:'Alex', bookedBy:'Alex', split:'shared' },
    { id:'demo3', type:'activity', title:'Phi Phi speedboat day trip', status:'hold',
      city:'Krabi', vendor:'Klook', start:'2026-11-21T08:00',
      cost:0, cur:'THB', split:'shared' }
  ];
  /* one planned day, so the Itinerary screen shows what a day plan looks like
     rather than eleven blank rows */
  t.days = {
    '2026-11-15': { title: 'Temples, then the river',
      lines: [['Morning', 'Grand Palace and Wat Pho \u2014 go early, it gets hot'],
              ['14:00', 'river boat to Wat Arun'],
              ['Evening', 'Thipsamai for pad thai'],
              ['', 'Cover your knees and shoulders or they will turn you away']] }
  };
  t.expenses = [
    { id:'demo4', date:'2026-11-14', amount:640, cur:'THB', cat:'Food',
      note:'Pad thai at Thipsamai', payer:'Sam', method:'Cash', split:'shared' },
    { id:'demo5', date:'2026-11-15', amount:1200, cur:'THB', cat:'Transport',
      note:'Grab to the Grand Palace', payer:'Jo', method:'UPI/Wallet', split:'shared' },
    { id:'demo6', date:'2026-11-15', amount:900, cur:'THB', cat:'Spa & Massage',
      note:'Thai massage — Sam and Jo only', payer:'Jo', method:'Cash',
      split:'custom', with:['Sam','Jo'] },
    { id:'demo7', date:'2026-11-16', amount:450, cur:'THB', cat:'Shopping',
      note:'Sunglasses', payer:'Alex', method:'Card', split:'personal' }
  ];
  t.cash = [
    { id:'demo8', person:'Sam', date:'2026-11-14', thb:5000, paidHome:11800, note:'Airport ATM' }
  ];
  t.notes = 'This is sample data. Open with ?nodemo to leave demo mode.';
  return t;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEMO ? demoTrip() : blank();    // a real device fills itself from the database
    const d = JSON.parse(raw);
    return Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings||{}) });
  } catch (e) { console.warn('unreadable save, starting fresh', e); return blank(); }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(S));
  if (DEMO) return;                                 // demo data never leaves the browser
  if (!applyingRemote && window.TripSync) window.TripSync.pushChanges(S);
}
let applyingRemote = false;

/* ============================== money ============================== */
const SYM = { THB:'฿', INR:'₹' };
const rate = () => Number(S.settings.rate) || 2.6;
const base = () => S.settings.base || 'THB';
const other = () => base() === 'THB' ? 'INR' : 'THB';

function toBase(amount, cur) {
  const a = Number(amount) || 0;
  if (cur === base()) return a;
  return base() === 'THB' ? a / rate() : a * rate();
}
function fmt(amount, cur = base()) {
  const a = Number(amount) || 0, abs = Math.abs(a);
  const n = abs >= 1000 ? Math.round(abs).toLocaleString('en-IN')
                        : (Math.round(abs * 100) / 100).toLocaleString('en-IN');
  return (a < 0 ? '−' : '') + (SYM[cur] || '') + n;
}
const fmtBase = v => fmt(v, base());
/* the budget number is stored with the currency it was entered in, so flipping
   the display currency converts it instead of silently reinterpreting it */
const budgetBase = () => toBase(Number(S.settings.budget) || 0, S.settings.budgetCur || base());
/* ---------------- the budget lens ----------------
   The same trip read two ways. "Everyone" is the group's money: every rupee
   anyone spent, against the whole trip budget. "Just me" is your money: your
   share of what is shared, plus anything only you carried, against your own
   budget. The choice is yours alone — it never syncs, so five people can each
   look at this differently without arguing over one setting. */
const budgetView = () => S.settings.budgetView === 'mine' ? 'mine' : 'group';

/* Your budget: whatever you set, or an even cut of the trip budget if you
   have not set one. */
const myBudgetBase = () => {
  const own = Number(S.settings.myBudget) || 0;
  if (own > 0) return toBase(own, S.settings.budgetCur || base());
  const n = (S.settings.people || []).length || 1;
  return budgetBase() / n;
};

/* What one entry costs you, which is nothing at all if you are not on it. */
function myShare(e) {
  const on = sharers(e);
  if (!on.includes(meName())) return 0;
  return toBase(e.amount, e.cur) / (on.length || 1);
}

/* The amount every Overview number is built from, under whichever lens. */
const lensAmount = e => budgetView() === 'mine' ? myShare(e) : toBase(e.amount, e.cur);

const fmtOther = vBase => fmt(base() === 'THB' ? vBase * rate() : vBase / rate(), other());
/* compact for tight spots: ฿12.4k */
function fmtShort(v) {
  const a = Math.abs(v);
  if (a >= 100000) return SYM[base()] + (a/1000).toFixed(0) + 'k';
  if (a >= 10000)  return SYM[base()] + (a/1000).toFixed(1) + 'k';
  return fmtBase(v);
}

/* ---------------- geography ---------------- */
const PLACES = {
  BLR:{ n:'Bengaluru', lat:13.1986, lon:77.7066, tz:5.5 },
  DEL:{ n:'Delhi',     lat:28.5562, lon:77.1000, tz:5.5 },
  BOM:{ n:'Mumbai',    lat:19.0896, lon:72.8656, tz:5.5 },
  BKK:{ n:'Bangkok',   lat:13.6900, lon:100.7501, tz:7, sub:'Suvarnabhumi' },
  DMK:{ n:'Bangkok',   lat:13.9126, lon:100.6068, tz:7, sub:'Don Mueang' },
  USM:{ n:'Koh Samui', lat:9.5479,  lon:100.0622, tz:7 },
  HKT:{ n:'Phuket',    lat:8.1132,  lon:98.3169, tz:7 },
  KBV:{ n:'Krabi',     lat:8.0992,  lon:98.9862, tz:7 }
};
/* departure and arrival are written in their own local times, so a flight's real
   length has to subtract the offset between the two airports */
function flightMins(b) {
  if (!b.start || !b.end) return 0;
  const raw = (new Date(b.end) - new Date(b.start)) / 60000;
  const from = PLACES[b.from], to = PLACES[b.to];
  const shift = (from && to) ? (to.tz - from.tz) * 60 : 0;
  const m = Math.round(raw - shift);
  return (m > 0 && m < 2880) ? m : 0;
}
/* Where you actually sleep, which is not the airport. The flats' exact
   addresses are not in the trip file, so these are the areas the itinerary
   recommends: Asok / Phrom Phong, Bo Phut, Ao Nang, Nai Yang. */
const STAY_AT = {
  'Bangkok':  { lat:13.7340, lon:100.5620 },
  'Koh Samui':{ lat:9.5620,  lon:100.0570 },
  'Ao Nang':  { lat:8.0322,  lon:98.8262  },
  'Phuket':   { lat:8.0925,  lon:98.3012  }
};
/* map points that are not airports: the mainland pier the Samui ferry lands at,
   and the islands / launch points the day trips go out to and back from */
const SPOTS = {
  'Donsak':    { n:'Donsak',     lat:9.3078,  lon:99.6520 },
  'Koh Tao':   { n:'Koh Tao',    lat:10.0956, lon:99.8404 },
  'Phi Phi':   { n:'Phi Phi',    lat:7.7407,  lon:98.7784 },
  'Ao Thalane':{ n:'Ao Thalane', lat:8.1490,  lon:98.7830 }
};

/* ---------------- live exchange rate ---------------- */
const RATE_APIS = [
  { name:'open.er-api.com', url:'https://open.er-api.com/v6/latest/THB', pick:d => d?.rates?.INR },
  { name:'currency-api',    url:'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/thb.json',
    pick:d => d?.thb?.inr },
  { name:'frankfurter.dev', url:'https://api.frankfurter.dev/v1/latest?base=THB&symbols=INR', pick:d => d?.rates?.INR }
];
let rateBusy = false;

function rateAge() {
  const f = S.settings.rateFetched;
  if (!f) return 'never fetched';
  const mins = Math.round((Date.now() - new Date(f).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 1440) return Math.round(mins/60) + 'h ago';
  const d = Math.round(mins/1440);
  return d + (d === 1 ? ' day ago' : ' days ago');
}
const rateIsFresh = () => (S.settings.rateFetched || '').slice(0,10) === todayISO();

async function refreshRate(announce) {
  if (rateBusy) return null;
  rateBusy = true;
  try {
    for (const api of RATE_APIS) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 7000);
        const res = await fetch(api.url, { signal:ctl.signal, cache:'no-store' });
        clearTimeout(timer);
        if (!res.ok) continue;
        const v = Number(api.pick(await res.json()));
        if (!v || !isFinite(v) || v <= 0) continue;
        S.settings.rateLive = Math.round(v * 10000) / 10000;
        S.settings.rateFetched = new Date().toISOString();
        S.settings.rateProvider = api.name;
        if (S.settings.rateAuto) S.settings.rate = S.settings.rateLive;
        save(); render();
        if (announce) toast(`Rate updated — 1 ฿ = ₹${S.settings.rateLive}`);
        return S.settings.rateLive;
      } catch (e) { /* try the next provider */ }
    }
    if (announce) toast('Could not reach any rate service — keeping the current value');
    return null;
  } finally { rateBusy = false; }
}
function maybeRefreshRate() {                    // once a day, quietly
  if (!S.settings.rateAuto || rateIsFresh()) return;
  refreshRate(false);
}

/* ============================== dates ============================== */
const todayISO = () => new Date().toLocaleDateString('en-CA');
const prettyDay = iso => new Date(iso+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const prettyLong = iso => new Date(iso+'T12:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
const shortDay = iso => new Date(iso+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const dowLetter = iso => new Date(iso+'T12:00').toLocaleDateString('en-GB',{weekday:'narrow'});
const dOnly = dt => (dt||'').slice(0,10);
const tOnly = dt => { const t = (dt||'').slice(11,16); return (!t || t === '00:00') ? '' : t; };
const daysBetween = (a,b) => Math.round((new Date(b+'T12:00') - new Date(a+'T12:00')) / 864e5);

function dateRange(a,b) {
  if (!a || !b) return [];
  const out = [], d = new Date(a+'T12:00'), end = new Date(b+'T12:00');
  while (d <= end && out.length < 400) { out.push(d.toLocaleDateString('en-CA')); d.setDate(d.getDate()+1); }
  return out;
}
function tripStats() {
  const { start, end } = S.settings;
  const t = todayISO();
  const total = (start && end) ? Math.max(0, daysBetween(start,end) + 1) : 0;
  let elapsed = 0, remaining = total, phase = 'none', toGo = 0;
  if (total) {
    if (t < start)      { phase = 'before'; remaining = total; toGo = daysBetween(t,start); }
    else if (t > end)   { phase = 'after';  elapsed = total; remaining = 0; }
    else                { phase = 'during'; elapsed = daysBetween(start,t)+1; remaining = total - elapsed + 1; }
  } else if (start) {                      // outbound booked, return date not decided yet
    if (t < start) { phase = 'before'; toGo = daysBetween(t,start); }
    else           { phase = 'during'; elapsed = daysBetween(start,t)+1; }
  }
  return { total, elapsed, remaining, phase, toGo };
}

/* ============================== dom utils ============================== */
const $  = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico = (n, cls='ic') => `<svg class="${cls}" viewBox="0 0 24 24"><use href="#i-${n}"/></svg>`;
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function catMeta(c) {
  if (CATS[c]) return CATS[c];
  let h = 0; for (const ch of String(c)) h = (h*31 + ch.charCodeAt(0)) % 10;
  return { ic:'tag', p:h+1 };
}
const catColor = c => cssVar('--p' + catMeta(c).p);
const typeColor = t => cssVar('--p' + (TYPES[t]||TYPES.other).p);
const personColor = p => {
  const i = Math.max(0, S.settings.people.indexOf(p));
  return cssVar('--p' + [1,2,6,3,8,7][i % 6]);
};
function initials(n) {
  const w = String(n).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0,2) : w.map(x => x[0]).join('').slice(0,2)).toUpperCase();
}
const safeUrl = u => /^https?:\/\//i.test(String(u||'').trim()) ? String(u).trim() : '';

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2200);
}

/* ============================== chart builders ============================== */
/* donut: segs = [{v, color, label}] */
function donut(segs, center, sub, thickness = 4.4) {
  const live = segs.filter(s => s.v > 0);
  const total = live.reduce((a,s) => a+s.v, 0);
  let off = 0;
  const arcs = total ? live.map(s => {
    const len = s.v / total * 100;
    const gap = live.length > 1 ? Math.min(1.2, len/3) : 0;
    const c = `<circle cx="21" cy="21" r="15.9155" pathLength="100" stroke="${s.color}"
      stroke-width="${thickness}" stroke-dasharray="${(len-gap).toFixed(2)} ${(100-len+gap).toFixed(2)}"
      stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    off += len; return c;
  }).join('') : '';
  return `<div class="donut-holder">
    <svg class="donut" viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r="15.9155" pathLength="100" stroke="var(--track)" stroke-width="${thickness}"/>
      ${arcs}
    </svg>
    <div class="donut-center"><div class="v">${center}</div><div class="l">${sub}</div></div>
  </div>`;
}

/* sparkline over an array of numbers */
function sparkline(vals, color) {
  if (vals.length < 2) return '';
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const span = (max - min) || 1;
  const pts = vals.map((v,i) => [i/(vals.length-1)*100, 28 - (v-min)/span*26]);
  const line = pts.map((p,i) => `${i?'L':'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  return `<svg class="tile-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <path class="area" d="${line} L100 30 L0 30 Z" fill="${color}" fill-opacity=".13"/>
    <path d="${line}" stroke="${color}"/></svg>`;
}

/* vertical bars, one per day */
function dayBars(days, pace) {
  const max = Math.max(...days.map(d => d.v), pace || 0, 1);
  const step = Math.max(1, Math.ceil(days.length / 12));
  const paceTop = pace ? (100 - pace/max*100) : null;
  return `<div class="chart">
    <div class="bars">
      ${paceTop !== null && pace > 0 && paceTop > 2 ? `<div class="pace-line" style="top:${paceTop.toFixed(1)}%">
        <span class="pace-tag">pace ${fmtShort(pace)}</span></div>` : ''}
      ${days.map((d,i) => `<div class="bar-col${d.v?'':' zero'}${d.today?' today':''}">
        <span class="bv">${d.v ? fmtBase(d.v) : 'nothing'} · ${shortDay(d.date)}</span>
        <span class="bx" style="height:${d.v ? Math.max(3, d.v/max*100) : 2}%"></span>
        <span class="bl">${(i % step === 0 || d.today) ? dowLetter(d.date) : ''}</span>
      </div>`).join('')}
    </div></div>`;
}

function miniRing(pct, color) {
  return `<svg class="mini-ring" viewBox="0 0 42 42" aria-hidden="true">
    <circle cx="21" cy="21" r="17" pathLength="100" fill="none" stroke="var(--border)" stroke-width="4.5"/>
    ${pct > 0 ? `<circle cx="21" cy="21" r="17" pathLength="100" fill="none" stroke="${color}" stroke-width="4.5"
      stroke-linecap="round" stroke-dasharray="${pct.toFixed(1)} ${(100-pct).toFixed(1)}"/>` : ''}</svg>`;
}

function emptyState(icon, text) {
  return `<div class="empty">${ico(icon)}<span>${esc(text)}</span></div>`;
}

/* ============================== theme ============================== */
function applyTheme() {
  const t = S.settings.theme || 'system';
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme:dark)').matches);
  $('#themeBtn').innerHTML = ico(dark ? 'sun' : 'moon');
  $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.theme === t));
}
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
  S.settings.theme = dark ? 'light' : 'dark';
  save(); applyTheme(); render();
};
$$('#themeSeg button').forEach(b => b.onclick = () => {
  S.settings.theme = b.dataset.theme; save(); applyTheme(); render();
});
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
  if ((S.settings.theme||'system') === 'system') { applyTheme(); render(); }
});

/* ============================== modal ============================== */
let modalSubmit = null;
function openModal(title, fields, values, onSave, rebuildOn) {
  $('#modalTitle').textContent = title;
  const build = (fieldList, vals) => renderModalFields(fieldList, vals);
  const fieldsFor = typeof fields === 'function' ? fields : () => fields;
  let current = { ...(values || {}) };

  const paint = () => {
    build(fieldsFor(current), current);
    if (!rebuildOn) return;
    const watcher = $(`#modalBody [name="${rebuildOn}"]`);
    if (watcher) watcher.onchange = () => {
      const fd = new FormData($('#modalForm'));
      const next = Object.fromEntries(fd.entries());
      if (fd.has('with')) next.with = fd.getAll('with');
      if (fd.has('forWhom')) next.forWhom = fd.getAll('forWhom');
      current = { ...current, ...next };
      paint();
    };
  };
  paint();
  modalSubmit = onSave;
  $('#modal').hidden = false;
  setTimeout(() => $('#modalBody input,#modalBody select')?.focus(), 40);
}

function renderModalFields(fields, values) {
  $('#modalBody').innerHTML = fields.map(f => {
    const v = values?.[f.key] ?? f.def ?? '';
    const cls = f.span ? ' class="span2"' : '';
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.key}">${f.options.map(o => {
        const val = typeof o === 'string' ? o : o.v, lab = typeof o === 'string' ? o : o.l;
        return `<option value="${esc(val)}"${String(val)===String(v)?' selected':''}>${esc(lab)}</option>`;
      }).join('')}</select>`;
    } else if (f.type === 'people') {
      const chosen = new Set(Array.isArray(values?.[f.key]) ? values[f.key]
        : (f.key === 'with' ? [] : S.settings.people));
      input = `<div class="split-chips">${S.settings.people.map(p =>
        `<label class="pchip"><input type="checkbox" name="${f.key}" value="${esc(p)}"${
          chosen.has(p) ? ' checked' : ''}><i class="dotp" style="background:${personColor(p)}"></i>${esc(p)}</label>`
      ).join('')}</div>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.key}" rows="${f.rows||3}" placeholder="${esc(f.ph||'')}">${esc(v)}</textarea>`;
    } else {
      input = `<input type="${f.type||'text'}" name="${f.key}" value="${esc(v)}" placeholder="${esc(f.ph||'')}"
        ${f.step?`step="${f.step}"`:''} ${f.req?'required':''}>`;
    }
    return `<label${cls}>${esc(f.label)}${input}</label>`;
  }).join('');
}
function closeModal() { $('#modal').hidden = true; modalSubmit = null; }
$('#modalForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (fd.has('with')) data.with = fd.getAll('with');       // checkbox groups need getAll
  if (fd.has('forWhom')) data.forWhom = fd.getAll('forWhom');
  const fn = modalSubmit; closeModal(); fn && fn(data);
});
$('#modalClose').onclick = $('#modalCancel').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#modal').hidden) closeModal();
  else if (!$('#quick').hidden) closeQuick();
});

/* ---------------- rate dialog (from the header chip) ---------------- */
function openRateModal() {
  const st = S.settings;
  $('#modalTitle').textContent = 'Exchange rate';
  $('#modalBody').innerHTML = `
    <div class="rate-panel span2">
      <div class="big">1 ฿ = ₹${(Number(st.rate)||0).toFixed(4)}</div>
      <div class="src">${st.rateLive
        ? `Live ₹${st.rateLive} from ${esc(st.rateProvider||'—')} · ${rateAge()}`
        : 'No live rate fetched yet — using your value'}</div>
    </div>
    <label class="span2">Rate to use — 1 THB in INR
      <input type="number" name="rate" step="0.0001" min="0" value="${Number(st.rate)||0}"></label>
    <label class="span2">Daily auto-update
      <select name="rateAuto">
        <option value="1"${st.rateAuto?' selected':''}>On — fetch a fresh rate once a day</option>
        <option value="0"${!st.rateAuto?' selected':''}>Off — keep my value</option>
      </select></label>
    <div class="span2 btn-row">
      <button type="button" class="btn" id="rateNow">${ico('download')}<span>Fetch live rate now</span></button>
    </div>`;
  $('#rateNow').onclick = async () => {
    $('#rateNow').disabled = true;
    const v = await refreshRate(true);
    closeModal();
    if (v) openRateModal();
  };
  modalSubmit = d => {
    S.settings.rateAuto = d.rateAuto === '1';
    const v = Number(d.rate);
    if (v > 0) S.settings.rate = v;
    save(); render(); toast('Rate saved');
    if (S.settings.rateAuto && !rateIsFresh()) refreshRate(false);
  };
  $('#modal').hidden = false;
}

/* ============================== expenses ============================== */
const expFields = () => ([
  {key:'date',   label:'Date',     type:'date', def:todayISO(), req:true},
  {key:'amount', label:'Amount',   type:'number', step:'0.01', req:true, ph:'0'},
  {key:'cur',    label:'Currency', type:'select', options:['THB','INR'], def:'THB'},
  {key:'cat',    label:'Category', type:'select', options:S.settings.categories},
  {key:'note',   label:'What was it?', span:true, ph:'Pad thai at Thipsamai'},
  {key:'payer',  label:'Paid by',  type:'select', options:S.settings.people, def:meName()},
  {key:'method', label:'Paid with',type:'select', options:['Cash','Card','UPI/Wallet','Prepaid/Forex']},
  {key:'split',  label:'Split',    type:'select', span:true,
   options:[{v:'shared',l:`Shared — split across all ${S.settings.people.length}`},
            {v:'personal',l:'Personal — only whoever paid'},
            {v:'custom',l:'Split between selected people…'}]},
  {key:'with',   label:'Who shares it (used when you pick “selected people”)', type:'people', span:true}
]);
function addExpense() {
  openModal('Add expense', expFields(), null, d => {
    S.expenses.push({ id:uid(), ...d, amount:Number(d.amount) }); save(); render(); toast('Expense added');
  });
}
function editExpense(id) {
  const e = S.expenses.find(x => x.id === id); if (!e) return;
  openModal('Edit expense', expFields(), e, d => {
    Object.assign(e, d, { amount:Number(d.amount), edited:new Date().toISOString() });
    save(); render(); toast('Updated');
  });
}
function delExpense(id) {
  if (!confirm('Delete this expense?')) return;
  S.removed = [...new Set([...(S.removed||[]), id])];
  S.expenses = S.expenses.filter(x => x.id !== id); save(); render();
}
/* A booking with a cost IS money someone spent. Rather than keeping a shadow
   expense row for each one, the money views read a single combined ledger.
   Bookings still marked "Idea" are excluded — an idea is not yet a cost. */
const TYPE_CAT = { flight:'Flights', hotel:'Stay', transport:'Transport', activity:'Activities', other:'Misc' };

function bookingAsEntry(b) {
  return {
    id: 'bk:' + b.id,
    fromBooking: b.id,
    date: dOnly(b.start) || todayISO(),
    amount: Number(b.cost) || 0,
    cur: b.cur || 'INR',
    cat: TYPE_CAT[b.type] || 'Misc',
    note: b.title,
    payer: b.paidBy,
    split: b.split || 'shared',
    with: Array.isArray(b.with) ? b.with : undefined,
    method: b.method || 'Card'
  };
}
/* A cost with nobody attached is not silently charged to whoever happens to be
   first in the travellers list — it is excluded until someone says who paid. */
const countsAsSpend = b => Number(b.cost) > 0 && b.status !== 'hold' && Boolean(b.paidBy);
const needsPayer = b => Number(b.cost) > 0 && b.status !== 'hold' && !b.paidBy;
function ledger() {
  return [...S.expenses, ...(S.bookings || []).filter(countsAsSpend).map(bookingAsEntry)];
}

const spentBase = () => ledger().reduce((s,e) => s + toBase(e.amount,e.cur), 0);

/* Who carries the cost of one expense.
   personal -> the payer alone; custom -> the people named on it; shared -> everyone. */
function sharers(e) {
  const all = S.settings.people;
  if (e.split === 'personal') return [e.payer];
  if (e.split === 'custom') {
    const list = (Array.isArray(e.with) ? e.with : []).filter(p => all.includes(p));
    return list.length ? list : [e.payer];
  }
  return all.length ? all : [e.payer];
}

/* Per person: what the trip costs them, what they have paid, and the gap. */
function personTotals() {
  const rows = {};
  const row = n => (rows[n] = rows[n] || { name:n, cost:0, paid:0, shareOfShared:0, own:0, byCat:{}, count:0 });
  S.settings.people.forEach(row);
  ledger().forEach(e => {
    const v = toBase(e.amount, e.cur);
    const on = sharers(e);
    const each = v / (on.length || 1);
    row(e.payer).paid += v;
    on.forEach(p => {
      const r = row(p);
      r.cost += each;
      r.count++;
      r.byCat[e.cat] = (r.byCat[e.cat] || 0) + each;
      if (on.length === 1) r.own += each; else r.shareOfShared += each;
    });
  });
  return S.settings.people.map(p => {
    const r = rows[p];
    return { ...r, balance: r.paid - r.cost };
  });
}

/* Fewest transfers that clear everyone. */
function settlePlan(rows) {
  const cred = rows.filter(r => r.balance > 0.5).map(r => ({ n:r.name, v:r.balance })).sort((a,b) => b.v-a.v);
  const debt = rows.filter(r => r.balance < -0.5).map(r => ({ n:r.name, v:-r.balance })).sort((a,b) => b.v-a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].v, cred[j].v);
    if (amt > 0.5) out.push({ from:debt[i].n, to:cred[j].n, amt });
    debt[i].v -= amt; cred[j].v -= amt;
    if (debt[i].v <= 0.5) i++;
    if (cred[j].v <= 0.5) j++;
  }
  return out;
}
const spentOn = d => ledger().filter(e => e.date === d).reduce((s,e) => s + toBase(e.amount,e.cur), 0);

/* ---------------- cash in hand ----------------
   A withdrawal is not spending — it turns bank money into baht in a pocket.
   Cash held = baht withdrawn − baht spent with method 'Cash'. */
const meName = () => S.settings.me || S.settings.people[0] || 'Me';

function cashRows() {
  const out = {};
  const row = n => (out[n] = out[n] || { name:n, thb:0, paidHome:0, spent:0, count:0 });
  S.settings.people.forEach(row);
  (S.cash || []).forEach(w => {
    const r = row(w.person);
    r.thb += Number(w.thb) || 0;
    r.paidHome += toBase(w.paid, w.paidCur || 'INR');
    r.count++;
  });
  ledger().filter(e => e.method === 'Cash').forEach(e => {
    const r = row(e.payer);
    r.spent += e.cur === 'THB' ? Number(e.amount)||0 : (Number(e.amount)||0) / rate();
  });
  return S.settings.people.map(p => {
    const r = out[p];
    return { ...r, held: r.thb - r.spent, effRate: r.thb ? r.paidHome / r.thb : 0 };
  });
}

const cashFields = () => ([
  {key:'date',   label:'Date', type:'date', def:todayISO(), req:true},
  {key:'person', label:'Who withdrew it', type:'select', options:S.settings.people, def:meName()},
  {key:'thb',    label:'Baht received (฿)', type:'number', step:'1', req:true, ph:'10000'},
  {key:'paid',   label:'Amount debited', type:'number', step:'0.01', req:true, ph:'30500'},
  {key:'paidCur',label:'Debited in', type:'select', options:['INR','THB'], def:'INR'},
  {key:'note',   label:'Where', ph:'ATM at Suvarnabhumi · Kasikorn'}
]);
function addCash() {
  openModal('Cash withdrawal', cashFields(), null, d => {
    S.cash = S.cash || [];
    S.cash.push({ id:uid(), ...d, thb:Number(d.thb), paid:Number(d.paid) });
    save(); render(); toast('Withdrawal logged');
  });
}
function editCash(id) {
  const w = (S.cash||[]).find(x => x.id === id); if (!w) return;
  openModal('Edit withdrawal', cashFields(), w, d => {
    Object.assign(w, d, { thb:Number(d.thb), paid:Number(d.paid), edited:new Date().toISOString() });
    save(); render(); toast('Updated');
  });
}
function delCash(id) {
  if (!confirm('Delete this withdrawal?')) return;
  S.removed = [...new Set([...(S.removed||[]), id])];
  S.cash = (S.cash||[]).filter(x => x.id !== id); save(); render();
}

/* ---------------- quick add ---------------- */
const QUICK = [
  { l:'7-Eleven', ic:'bag',    cat:'Food',          note:'7-Eleven',   method:'Cash' },
  { l:'Meal',     ic:'bowl',   cat:'Food',          note:'',           method:'Cash' },
  { l:'Drinks',   ic:'cup',    cat:'Drinks',        note:'',           method:'Cash' },
  { l:'Grab',     ic:'car',    cat:'Transport',     note:'Grab',       method:'Card' },
  { l:'Taxi',     ic:'car',    cat:'Transport',     note:'Taxi',       method:'Cash' },
  { l:'Massage',  ic:'leaf',   cat:'Spa & Massage', note:'',           method:'Cash' },
  { l:'Tour',     ic:'ticket', cat:'Activities',    note:'',           method:'Card' },
  { l:'Other',    ic:'dots',   cat:'Misc',          note:'',           method:'Cash' }
];
let q = { amount:'', cur:'THB', preset:0 };

function openQuick() {
  const last = S.settings.lastQuick || {};
  q = { amount:'', cur:'THB', preset:Math.max(0, QUICK.findIndex(p => p.cat === last.cat)) };
  $('#qPresets').innerHTML = QUICK.map((p,i) =>
    `<button class="qpreset${i===q.preset?' on':''}" data-q="${i}">${ico(p.ic)}<span>${esc(p.l)}</span></button>`).join('');
  $('#qPad').innerHTML = ['1','2','3','4','5','6','7','8','9','.','0','⌫']
    .map(k => `<button class="qkey" data-k="${k}">${k}</button>`).join('');
  $('#qPayer').innerHTML = S.settings.people.map(p =>
    `<option${p===meName()?' selected':''}>${esc(p)}</option>`).join('');
  $('#qSplit').value = last.split || 'shared';
  $('#qMethod').value = QUICK[q.preset].method || last.method || 'Cash';
  $$('#qCurSeg [data-qcur]').forEach(b => b.classList.toggle('on', b.dataset.qcur === q.cur));
  drawQuick();
  $('#quick').hidden = false;
}
function drawQuick() {
  $('#qCur').textContent = SYM[q.cur];
  const n = Number(q.amount || 0);
  $('#qVal').textContent = q.amount === '' ? '0'
    : (q.amount.endsWith('.') ? q.amount : n.toLocaleString('en-IN', { maximumFractionDigits:2 }));
}
function closeQuick() { $('#quick').hidden = true; }

$('#fab').onclick = openQuick;
$('#qClose').onclick = closeQuick;
$('#quick').addEventListener('click', e => { if (e.target.id === 'quick') closeQuick(); });
$('#qPad').addEventListener('click', e => {
  const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
  if (k === '⌫') q.amount = q.amount.slice(0, -1);
  else if (k === '.') { if (!q.amount.includes('.')) q.amount = (q.amount || '0') + '.'; }
  else if (!(q.amount.includes('.') && q.amount.split('.')[1].length >= 2)) q.amount += k;
  drawQuick();
});
$('#qPresets').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  q.preset = Number(b.dataset.q);
  $$('#qPresets .qpreset').forEach((x,i) => x.classList.toggle('on', i === q.preset));
  $('#qMethod').value = QUICK[q.preset].method;
});
$$('#qCurSeg [data-qcur]').forEach(b => b.onclick = () => {
  q.cur = b.dataset.qcur;
  $$('#qCurSeg [data-qcur]').forEach(x => x.classList.toggle('on', x === b));
  drawQuick();
});
$('#qSave').onclick = () => {
  const amount = Number(q.amount);
  if (!amount) return toast('Enter an amount first');
  const p = QUICK[q.preset];
  S.expenses.push({ id:uid(), date:todayISO(), amount, cur:q.cur, cat:p.cat,
    note:p.note || p.l, payer:$('#qPayer').value, split:$('#qSplit').value, method:$('#qMethod').value });
  S.settings.lastQuick = { cat:p.cat, method:$('#qMethod').value, split:$('#qSplit').value };
  save(); closeQuick(); render(); toast(`${fmt(amount, q.cur)} logged`);
};
$('#qFull').onclick = () => { closeQuick(); addExpense(); };

/* ============================== bookings ============================== */
let bookFilter = '', expCat = '', mineOnly = false;
/* The form follows the kind of booking. A flight needs airport codes and a PNR;
   a stay needs check-in, check-out and a listing link; an activity needs a
   meeting point. Asking for all of it every time is what made this confusing. */
function bookFields(values) {
  const type = (values && values.type) || 'flight';
  const people = S.settings.people || [];
  const money = [
    { key:'cost',    label:'Cost', type:'number', step:'0.01', ph:'0' },
    { key:'cur',     label:'Currency', type:'select', options:['THB','INR'], def:'THB' },
    { key:'bookedBy',label:'Booked by', type:'select', options:[''].concat(people) },
    { key:'paidBy',  label:'Paid by', type:'select', options:[''].concat(people) },
    { key:'split',   label:'Split the cost', type:'select', span:true,
      options:[{v:'shared',l:`Shared — across all ${people.length}`},
               {v:'personal',l:'Personal — only whoever paid'},
               {v:'custom',l:'Between selected people…'}] },
    { key:'with',    label:'Who shares the cost (for “selected people”)', type:'people', span:true },
    { key:'forWhom', label:'Who is this booking for', type:'people', span:true },
    { key:'notes',   label:'Notes', type:'textarea', span:true,
      ph:'Cancellation policy, what to carry, pickup point…' }
  ];
  const head = [
    { key:'type',   label:'Type', type:'select',
      options:Object.keys(TYPES).map(k => ({ v:k, l:TYPES[k].label })) },
    { key:'status', label:'Status', type:'select',
      options:[{v:'paid',l:'Paid'},{v:'pending',l:'Payment pending'},{v:'hold',l:'Idea — not booked'}] }
  ];

  if (type === 'flight') return [...head,
    { key:'title',  label:'Flight', span:true, req:true, ph:'BLR → BKK · IX 882' },
    { key:'from',   label:'From (airport code)', ph:'BLR' },
    { key:'to',     label:'To (airport code)', ph:'BKK' },
    { key:'start',  label:'Departs', type:'datetime-local', req:true },
    { key:'end',    label:'Arrives', type:'datetime-local' },
    { key:'vendor', label:'Airline / booked via', ph:'IndiGo · Cleartrip' },
    { key:'conf',   label:'PNR / confirmation', ph:'K3PXQ2' },
    { key:'place',  label:'Terminals or route notes', span:true, ph:'Bengaluru T2 → Suvarnabhumi' },
    { key:'city',   label:'Arriving in', ph:'Bangkok' },
    ...money];

  if (type === 'hotel') return [...head,
    { key:'title',  label:'Place', span:true, req:true, ph:'Kata Beach Villa' },
    { key:'city',   label:'City / area', ph:'Phuket' },
    { key:'place',  label:'Address or neighbourhood', ph:'Nai Yang, near the airport' },
    { key:'start',  label:'Check-in', type:'datetime-local', req:true },
    { key:'end',    label:'Check-out', type:'datetime-local' },
    { key:'vendor', label:'Booked via', ph:'Airbnb · Booking.com' },
    { key:'conf',   label:'Confirmation', ph:'BK-4471209' },
    { key:'url',    label:'Listing link', span:true, ph:'https://airbnb.co.in/rooms/…' },
    { key:'map',    label:'Map link', span:true, ph:'https://maps.app.goo.gl/…' },
    ...money];

  if (type === 'transport') return [...head,
    { key:'title',  label:'Journey', span:true, req:true, ph:'Koh Samui → Krabi · ferry + van' },
    { key:'place',  label:'From → to', span:true, ph:'Bo Phut → ferry → Ao Nang' },
    { key:'start',  label:'Departs', type:'datetime-local', req:true },
    { key:'end',    label:'Arrives', type:'datetime-local' },
    { key:'vendor', label:'Operator / booked via', ph:'Lomprayah · Grab' },
    { key:'conf',   label:'Confirmation', ph:'' },
    { key:'city',   label:'Arriving in', ph:'Ao Nang' },
    ...money];

  if (type === 'activity') return [...head,
    { key:'title',  label:'Activity', span:true, req:true, ph:'Phi Phi + Maya Bay speedboat' },
    { key:'city',   label:'City / area', ph:'Ao Nang' },
    { key:'place',  label:'Meeting point', span:true, ph:'Pickup from the hotel lobby' },
    { key:'start',  label:'Starts', type:'datetime-local', req:true },
    { key:'end',    label:'Ends', type:'datetime-local' },
    { key:'vendor', label:'Operator / booked via', ph:'Klook · GetYourGuide' },
    { key:'conf',   label:'Confirmation', ph:'KL-772311' },
    { key:'url',    label:'Booking link', span:true, ph:'https://…' },
    { key:'map',    label:'Map link', span:true, ph:'https://maps.app.goo.gl/…' },
    ...money];

  return [...head,
    { key:'title',  label:'What is it', span:true, req:true },
    { key:'city',   label:'City / area' },
    { key:'place',  label:'Where', span:true },
    { key:'start',  label:'Starts', type:'datetime-local', req:true },
    { key:'end',    label:'Ends', type:'datetime-local' },
    { key:'vendor', label:'Booked via' },
    { key:'conf',   label:'Confirmation' },
    ...money];
}

function addBooking() {
  openModal('Add booking', bookFields,
    { type:'flight', status:'hold', start:(S.settings.start||todayISO())+'T09:00' },
    d => {
      if (Array.isArray(d.forWhom) && !d.forWhom.length) delete d.forWhom;
      S.bookings.push({ id:uid(), ...d, cost:Number(d.cost)||0 });
      save(); render(); toast('Booking saved');
    }, 'type');
}
function editBooking(id) {
  const b = S.bookings.find(x => x.id === id); if (!b) return;
  openModal('Edit booking', bookFields, b, d => {
    Object.assign(b, d, { cost:Number(d.cost)||0, edited:new Date().toISOString() });
    save(); render(); toast('Updated');
  }, 'type');
}
function delBooking(id) {
  if (!confirm('Delete this booking?')) return;
  S.removed = [...new Set([...(S.removed||[]), id])];
  S.bookings = S.bookings.filter(x => x.id !== id); save(); render();
}
/* "Who is on it" was free text, which reads well but cannot be filtered.
   forWhom is the structured version; the text is kept for display. */
function parseWho(who) {
  const all = S.settings.people || [];
  const t = String(who || '').trim();
  if (!t) return all.slice();
  if (/\ball\b|everyone|all five/i.test(t)) return all.slice();
  const hit = all.filter(p => new RegExp('\\b' + p + '\\b', 'i').test(t));
  return hit.length ? hit : all.slice();
}
const audience = b => (Array.isArray(b.forWhom) && b.forWhom.length) ? b.forWhom : parseWho(b.who);
const bookingIsMine = b => !meName() || audience(b).includes(meName());

const nowStamp = () => new Date().toISOString().slice(0,16);
const upcoming = () => S.bookings.filter(b => (b.end || b.start) >= nowStamp())
  .sort((a,b) => (a.start||'').localeCompare(b.start||''));

function whenText(b) {
  const s = dOnly(b.start), e = dOnly(b.end);
  let t = prettyDay(s) + (tOnly(b.start) ? ` · ${tOnly(b.start)}` : '');
  if (e && e !== s) t += ` → ${prettyDay(e)}`;
  else if (tOnly(b.end)) t += ` → ${tOnly(b.end)}`;
  return t;
}
function countdownBadge(b) {
  const d = dOnly(b.start) ? daysBetween(todayISO(), dOnly(b.start)) : null;
  if (d === null || d < 0 || d > 2) return '';
  return `<span class="badge soon">${d===0?'today':d===1?'tomorrow':'in 2 days'}</span>`;
}
const STATUS_LABEL = { paid:'Paid', pending:'To pay', hold:'Idea' };

function nightsOf(b) {
  const a = dOnly(b.start), z = dOnly(b.end);
  return (a && z) ? Math.max(0, daysBetween(a, z)) : 0;
}
function thumbInner(b, t) {
  const price = Number(b.cost) ? fmt(b.cost, b.cur) : '';
  if (b.type === 'flight' && b.from && b.to) {
    const dep = tOnly(b.start), arr = tOnly(b.end);
    const mins = flightMins(b);
    const dur = mins ? `${Math.floor(mins/60)}h${mins%60 ? ' '+(mins%60)+'m' : ''}` : '';
    return `<div class="thumb-flight">
      <div class="thumb-row"><span class="tt">${esc(t.label)}${b.city?' · '+esc(b.city):''}</span>
        <span class="pr">${price}</span></div>
      <div class="thumb-route">${esc(b.from)}
        <span class="line">${ico('plane')}</span>${esc(b.to)}</div>
      <div class="thumb-times"><b>${dep || 'time TBD'}</b><span>${dur}</span><b>${arr || ''}</b></div>
    </div>`;
  }
  if (b.type === 'hotel') {
    const n = nightsOf(b);
    return `<div class="thumb-flight">
      <div class="thumb-row"><span class="tt">${esc(t.label)}${b.city?' · '+esc(b.city):''}</span>
        <span class="pr">${price}</span></div>
      <div class="thumb-row"><span class="nights">${
        [...Array(Math.min(n, 10))].map(() => '<i></i>').join('')}</span></div>
      <div class="thumb-times"><b>${n} night${n===1?'':'s'}</b>
        <span>${dOnly(b.start) ? shortDay(dOnly(b.start)) : ''} → ${dOnly(b.end) ? shortDay(dOnly(b.end)) : ''}</span></div>
    </div>`;
  }
  return `<span class="tt">${esc(t.label)}${b.city?' · '+esc(b.city):''}</span>
    <span class="pr">${price}</span>`;
}

function bookingCard(b) {
  const t = TYPES[b.type] || TYPES.other, c = typeColor(b.type);
  const n = nightsOf(b), heads = S.settings.people.length || 1;
  const per = b.type === 'hotel' && Number(b.cost) ? `
    <div class="perline">
      ${n ? `<span>Per night <b>${fmt(Number(b.cost)/n, b.cur)}</b></span>` : ''}
      <span>Each of ${heads} <b>${fmt(Number(b.cost)/heads, b.cur)}</b></span>
      ${b.cur !== base() ? `<span>Total <b>${fmtBase(toBase(b.cost,b.cur))}</b></span>` : ''}
    </div>` : '';
  return `<article class="bcard">
    <div class="thumb" style="background:linear-gradient(135deg,${c},color-mix(in oklab,${c} 55%, #000 45%))">
      <svg class="wm" viewBox="0 0 24 24"><use href="#i-${t.ic}"/></svg>
      ${thumbInner(b, t)}
    </div>
    <div class="body">
      <div class="bt">
        <h3>${esc(b.title)}</h3>
        <span class="badge ${b.status||'hold'}">${STATUS_LABEL[b.status]||'Idea'}</span>
      </div>
      <div class="meta">
        <div>${ico('clock')}<span>${whenText(b)}</span></div>
        ${b.place ? `<div>${ico('pin')}<span>${esc(b.place)}</span></div>` : ''}
        ${b.vendor || b.conf ? `<div>${ico('tag')}<span>${esc(b.vendor||'')}${
          b.conf ? ` · <span class="conf">${esc(b.conf)}</span>` : ''}</span></div>` : ''}
        ${b.who ? `<div>${ico('users')}<span>${esc(b.who)}</span></div>` : ''}
      </div>
      ${per}
      ${b.notes ? `<p class="note">${esc(b.notes)}</p>` : ''}
      ${b.status === 'hold' && Number(b.cost) ? `<p class="note" style="color:var(--p3)">
        Still marked an idea, so this cost is not counted in the ledger. Change the status once it is booked.</p>` : ''}
      ${needsPayer(b) ? `<p class="note" style="color:var(--p3)">
        Set <b>Paid by</b> and <b>Split</b> so this ${fmt(b.cost, b.cur)} counts in everyone's share.</p>` : ''}
      <div class="foot">
        ${countdownBadge(b) || `<span class="hint">${
          Number(b.cost) && b.cur !== base() ? fmtBase(toBase(b.cost,b.cur)) : ''}</span>`}
        <span class="acts">
          ${safeUrl(b.url) ? `<a class="icon-btn" href="${esc(safeUrl(b.url))}" target="_blank"
            rel="noopener noreferrer" title="Open booking">${ico('link')}</a>` : ''}
          ${safeUrl(b.map) ? `<a class="icon-btn" href="${esc(safeUrl(b.map))}" target="_blank"
            rel="noopener noreferrer" title="Open map">${ico('pin')}</a>` : ''}
          <button class="icon-btn" data-edit-book="${b.id}" title="Edit">${ico('pencil')}</button>
          <button class="icon-btn" data-del-book="${b.id}" title="Delete">${ico('trash')}</button>
        </span>
      </div>
    </div></article>`;
}

function bookingRow(b) {
  const t = TYPES[b.type] || TYPES.other, c = typeColor(b.type);
  return `<div class="row">
    <div class="row-ico" style="color:${c};background:color-mix(in oklab,${c} 14%, transparent)">${ico(t.ic)}</div>
    <div class="row-main">
      <div class="row-title"><span class="t">${esc(b.title)}</span>${countdownBadge(b)}</div>
      <div class="row-sub">${whenText(b)}${b.place?' · '+esc(b.place):''}</div>
    </div>
    <div class="row-amt">${Number(b.cost) ? fmt(b.cost,b.cur) : '—'}</div>
  </div>`;
}

/* ============================== render: overview ============================== */
function renderDashboard() {
  const s = S.settings, st = tripStats();
  const mine   = budgetView() === 'mine';
  const rows   = ledger();
  const spent  = rows.reduce((a, e) => a + lensAmount(e), 0);
  const budget = mine ? myBudgetBase() : budgetBase();
  const left   = budget - spent;
  const pct    = budget ? Math.min(100, spent/budget*100) : 0;
  const count  = mine ? rows.filter(e => myShare(e) > 0).length : rows.length;
  const dayOf  = d => rows.filter(e => e.date === d).reduce((a, e) => a + lensAmount(e), 0);

  /* hero */
  const countLabel = st.phase === 'before' ? ['days to go', st.toGo]
    : st.phase === 'during' ? [st.total ? 'of ' + st.total + ' days' : 'since departure', 'Day ' + st.elapsed]
    : st.phase === 'after' ? ['trip complete', '✓'] : ['set your dates', '—'];
  const heroDates = s.start && s.end ? `${shortDay(s.start)} – ${shortDay(s.end)}`
    : s.start ? `${shortDay(s.start)} · return TBD` : 'Dates not set';
  $('#hero').innerHTML = `
    <div class="hero-top">
      <div>
        <span class="hero-eyebrow">${ico('flag')} ${esc(s.name||'Thailand')} trip</span>
        <h2>${heroDates}</h2>
        <div class="hero-meta">
          <span>${ico('plane')} ${S.bookings.length} booking${S.bookings.length===1?'':'s'}</span>
          <span>${ico('wallet')} ${fmtBase(budget)} ${mine ? 'your budget' : 'budget'}</span>
          <span>${ico('users')} ${s.people.length} travelling</span>
          <span class="avatars">${s.people.map(p =>
            `<i class="avatar" style="background:${personColor(p)}">${esc(initials(p))}</i>`).join('')}</span>
        </div>
      </div>
      <div class="hero-count">
        <div class="big">${countLabel[1]}</div>
        <div class="lbl">${countLabel[0]}</div>
      </div>
    </div>
    <div class="hero-bar">
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <div class="labels"><span>${fmtBase(spent)} ${mine ? 'your share' : 'spent'}</span><span>${fmtBase(Math.max(0,left))} left</span></div>
    </div>`;

  /* tiles */
  const days = dateRange(s.start, s.end);
  const cumul = days.length ? days.filter(d => d <= todayISO()).map((d,i,arr) =>
    arr.slice(0,i+1).reduce((a,x) => a + dayOf(x), 0)) : [];
  const last7 = [...Array(7)].map((_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i));
    return dayOf(d.toLocaleDateString('en-CA'));
  });
  const daysCounted = Math.max(1, st.elapsed || st.total || 1);
  const avg = spent / daysCounted;
  const pace = st.remaining > 0 ? Math.max(0,left) / st.remaining : 0;
  const tile = (icName, p, label, val, foot, extra='') => `
    <div class="tile">
      <div class="tile-top">
        <span class="tile-ico" style="color:${cssVar('--p'+p)};background:color-mix(in oklab,${cssVar('--p'+p)} 14%, transparent)">${ico(icName)}</span>
        <span class="tile-label">${label}</span>
      </div>
      <div class="tile-val">${val}</div>
      <div class="tile-foot">${foot}</div>${extra}</div>`;

  $('#tiles').innerHTML =
    tile('wallet', 1, mine ? 'Your share so far' : 'Spent so far', fmtBase(spent), `${fmtOther(spent)} · ${count} entr${count===1?'y':'ies'}`,
      sparkline(cumul.length > 1 ? cumul : last7, cssVar('--p1'))) +
    tile('flag', budget && left < 0 ? 1 : 7, mine ? 'Your budget left' : 'Budget left', fmtBase(left),
      budget ? `${Math.round(pct)}% of ${fmtShort(budget)} used`
             : (mine ? 'set a trip or personal budget' : 'no budget set'),
      sparkline(last7.map(v => -v), cssVar(budget && left<0 ? '--p1' : '--p7'))) +
    tile('sparkle', 3, 'Average a day', fmtBase(avg),
      st.phase==='during' ? `over ${st.elapsed} days so far` : st.total ? `spread over ${st.total} days` : 'no dates set') +
    tile('clock', 6, 'Safe daily spend', st.remaining ? fmtBase(pace) : '—',
      st.remaining ? `for the ${st.remaining} days left` : st.total ? 'trip finished' : 'set trip dates');

  /* budget donut */
  const segs = [
    { v:spent, color:cssVar('--p1'), label:mine ? 'Your share' : 'Spent' },
    { v:Math.max(0,left), color:cssVar('--p2'), label:'Remaining' }
  ];
  const committed = S.bookings.filter(b => b.status !== 'hold')
    .reduce((a,b) => a + (mine ? myShare(bookingAsEntry(b)) : toBase(b.cost,b.cur)), 0);
  $('#cardBudget').innerHTML = `
    <div class="card-head">
      <h2>Budget</h2>
      <div class="segment lens-seg" id="budgetLens" title="Whose money to show">
        <button data-lens="group" class="${mine ? '' : 'on'}">${ico('users')}Everyone</button>
        <button data-lens="mine" class="${mine ? 'on' : ''}">${ico('flag')}Just me</button>
      </div>
    </div>
    <div class="card-sub hint">${
      mine ? `Your share of the trip against ${Number(s.myBudget) ? 'your own budget' : 'an even cut of the trip budget'}`
           : 'Everything the five of you have spent'}${budget ? ` · ${Math.round(pct)}% used` : ' · no budget set'}</div>
    <div class="donut-wrap">
      ${donut(segs, budget ? Math.round(pct)+'%' : '—', budget ? 'of budget' : 'no budget')}
      <div class="legend">
        <div class="legend-row"><i class="sw" style="background:${cssVar('--p1')}"></i>
          <span class="nm">${mine ? 'Your share' : 'Spent'}</span><span class="vl">${fmtBase(spent)}</span></div>
        <div class="legend-row"><i class="sw" style="background:${cssVar('--p2')}"></i>
          <span class="nm">Remaining</span><span class="vl">${fmtBase(Math.max(0,left))}</span></div>
        <div class="legend-row"><i class="sw" style="background:var(--track)"></i>
          <span class="nm">${mine ? 'Your part of bookings' : 'Booked &amp; committed'}</span><span class="vl">${fmtBase(committed)}</span></div>
        <div class="legend-row"><i class="sw" style="background:var(--track)"></i>
          <span class="nm">In ${other()}</span><span class="vl">${fmtOther(spent)}</span></div>
      </div>
    </div>`;

  /* categories */
  const cats = (() => {
    const m = {};
    rows.forEach(e => { const v = lensAmount(e); if (v) m[e.cat] = (m[e.cat]||0) + v; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]);
  })();
  const max = cats.length ? cats[0][1] : 1;
  $('#cardCats').innerHTML = `
    <div class="card-head"><h2>Where it goes</h2><span class="hint">${cats.length} categories</span></div>
    ${cats.length ? `<div class="catlist">${cats.slice(0,7).map(([c,v]) => {
      const col = catColor(c);
      return `<div class="catrow">
        <span class="ct" style="color:${col};background:color-mix(in oklab,${col} 14%, transparent)">${ico(catMeta(c).ic)}</span>
        <span><span class="nm">${esc(c)}</span><span class="bar"><i style="width:${(v/max*100).toFixed(1)}%;background:${col}"></i></span></span>
        <span class="amt">${fmtBase(v)}<small>${(v/(spent||1)*100).toFixed(0)}%</small></span>
      </div>`;
    }).join('')}</div>` : emptyState('wallet','No expenses yet — add one and this fills in.')}`;

  /* daily chart */
  const lastN = n => [...Array(n)].map((_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (n-1-i)); return d.toLocaleDateString('en-CA');
  });
  const asCols = ds => ds.map(d => ({ date:d, v:dayOf(d), today:d === todayISO() }));
  let cols = asCols(days.length ? days : lastN(14)), scope = days.length ? 'across the trip' : 'last 14 days';
  if (!cols.some(c => c.v > 0)) { cols = asCols(lastN(14)); scope = 'last 14 days'; }
  const spentDays = cols.filter(d => d.v > 0).length;
  $('#cardDaily').innerHTML = `
    <div class="card-head"><h2>Daily spend</h2><span class="hint">${scope} · ${
      spentDays} day${spentDays===1?'':'s'} with spend</span></div>
    ${dayBars(cols, st.phase === 'during' ? pace : 0)}`;

  /* next up + recent */
  const next = upcoming().slice(0,5);
  $('#cardNext').innerHTML = `<div class="card-head"><h2>Next up</h2><span class="hint">${next.length} upcoming</span></div>
    ${next.length ? next.map(bookingRow).join('') : emptyState('plane','Nothing booked yet.')}`;

  const recent = [...ledger()].sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,5);
  $('#cardRecent').innerHTML = `<div class="card-head"><h2>Latest expenses</h2><span class="hint">${ledger().length} total</span></div>
    ${recent.length ? recent.map(e => expenseRow(e)).join('') : emptyState('wallet','No expenses yet.')}`;
}

function expenseRow(e, withActions) {
  const col = catColor(e.cat);
  return `<div class="row">
    <div class="row-ico" style="color:${col};background:color-mix(in oklab,${col} 14%, transparent)">${ico(catMeta(e.cat).ic)}</div>
    <div class="row-main">
      <div class="row-title"><span class="t">${esc(e.note || e.cat)}</span></div>
      <div class="row-sub">${prettyDay(e.date)} · ${esc(e.cat)} · ${esc(e.payer)}${
        e.fromBooking ? ' · from a booking' : ''}${
        e.split === 'personal' ? ' · personal'
        : e.split === 'custom' ? ' · split ' + sharers(e).length + ' ways'
        : ''}</div>
    </div>
    <div class="row-amt">${fmt(e.amount,e.cur)}${
      e.cur !== base() ? `<small>${fmtBase(toBase(e.amount,e.cur))}</small>` : ''}</div>
    ${withActions ? (e.fromBooking
      ? `<div class="row-actions"><button class="icon-btn" data-edit-book="${e.fromBooking}"
           title="Edit the booking">${ico('plane')}</button></div>`
      : `<div class="row-actions">
      <button class="icon-btn" data-edit-exp="${e.id}" title="Edit">${ico('pencil')}</button>
      <button class="icon-btn" data-del-exp="${e.id}" title="Delete">${ico('trash')}</button></div>`) : ''}
  </div>`;
}

/* ============================== render: expenses ============================== */
function renderExpenses() {
  const q = $('#expSearch').value.trim().toLowerCase();
  const pf = $('#expPayerFilter').value;
  const sig = `<option value="">Everyone</option>` +
    S.settings.people.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if ($('#expPayerFilter').dataset.sig !== sig) {
    $('#expPayerFilter').innerHTML = sig; $('#expPayerFilter').dataset.sig = sig; $('#expPayerFilter').value = pf;
  }

  /* category strip */
  const counts = {};
  const all = ledger();
  all.forEach(e => counts[e.cat] = (counts[e.cat]||0)+1);
  $('#catStrip').innerHTML =
    `<button class="catpill${expCat===''?' active':''}" data-cat="">${ico('sparkle')}<span>All</span>
      <span class="cnt">${all.length}</span></button>` +
    S.settings.categories.map(c => `<button class="catpill${expCat===c?' active':''}" data-cat="${esc(c)}"
        style="${expCat===c?`color:${catColor(c)};border-bottom-color:${catColor(c)}`:''}">
        ${ico(catMeta(c).ic)}<span>${esc(c)}</span><span class="cnt">${counts[c]||0}</span></button>`).join('');

  const list = ledger()
    .filter(e => !expCat || e.cat === expCat)
    .filter(e => !pf || e.payer === pf)
    .filter(e => !q || `${e.note} ${e.cat} ${e.payer} ${e.method}`.toLowerCase().includes(q))
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const filteredTotal = list.reduce((s,e) => s + toBase(e.amount,e.cur), 0);
  const spent = spentBase();
  const st = tripStats();

  const tile = (icName,p,label,val,foot) => `<div class="tile">
    <div class="tile-top"><span class="tile-ico" style="color:${cssVar('--p'+p)};background:color-mix(in oklab,${cssVar('--p'+p)} 14%, transparent)">${ico(icName)}</span>
    <span class="tile-label">${label}</span></div>
    <div class="tile-val">${val}</div><div class="tile-foot">${foot}</div></div>`;
  $('#expTiles').innerHTML =
    tile('search', 6, 'Showing', fmtBase(filteredTotal), `${list.length} of ${all.length} entries`) +
    tile('wallet', 1, 'Trip total', fmtBase(spent), fmtOther(spent)) +
    tile('clock', 3, 'Today', fmtBase(spentOn(todayISO())),
      st.phase === 'during' ? `day ${st.elapsed} of ${st.total}` : 'trip not running');

  /* cash in hand */
  const cash = cashRows();
  const anyCash = cash.some(c => c.count || c.spent);
  const liveR = rate();
  $('#cardCash').innerHTML = `<div class="card-head"><h2>Cash in hand</h2>
      <span class="hint">baht withdrawn minus baht spent</span></div>
    ${anyCash ? `<div class="cash-grid">${cash.filter(c => c.count || c.spent).map(c => {
      const markup = c.effRate && liveR ? (c.effRate/liveR - 1) * 100 : 0;
      return `<div class="cash-cell${c.held < 500 ? ' low' : ''}">
        <div class="who"><i class="avatar" style="background:${personColor(c.name)}">${esc(initials(c.name))}</i>${esc(c.name)}</div>
        <div class="held">${fmt(c.held, 'THB')}</div>
        <div class="sub">withdrew ${fmt(c.thb,'THB')} · spent ${fmt(c.spent,'THB')} in cash</div>
        ${c.effRate ? `<span class="eff">${ico('tag')} paid ₹${c.effRate.toFixed(3)}/฿${
          Math.abs(markup) > 0.4 ? ` · ${markup > 0 ? '+' : ''}${markup.toFixed(1)}% vs live` : ''}</span>` : ''}
      </div>`;
    }).join('')}</div>` : emptyState('wallet','No withdrawals logged. Add one when you hit an ATM — it keeps cash out of your spending totals.')}
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" id="btnAddCash">${ico('plus')}<span>ATM withdrawal</span></button>
    </div>
    ${(S.cash||[]).length ? [...S.cash].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(w => `
      <div class="row"><div class="row-ico" style="color:${cssVar('--p7')};background:color-mix(in oklab,${cssVar('--p7')} 14%, transparent)">${ico('wallet')}</div>
        <div class="row-main"><div class="row-title"><span class="t">${esc(w.note || 'Withdrawal')}</span></div>
          <div class="row-sub">${prettyDay(w.date)} · ${esc(w.person)} · ${fmt(w.paid, w.paidCur||'INR')} debited</div></div>
        <div class="row-amt">${fmt(w.thb,'THB')}<small>₹${(toBase(w.paid,w.paidCur||'INR')/(Number(w.thb)||1)).toFixed(2)}/฿</small></div>
        <div class="row-actions">
          <button class="icon-btn" data-edit-cash="${w.id}">${ico('pencil')}</button>
          <button class="icon-btn" data-del-cash="${w.id}">${ico('trash')}</button></div>
      </div>`).join('') : ''}`;
  $('#btnAddCash').onclick = addCash;

  /* settle up */
  const people = personTotals();
  const maxPaid = Math.max(...people.map(p => p.paid), 1);
  $('#cardSettle').innerHTML = people.length < 2
    ? `<div class="card-head"><h2>Who paid</h2><span class="hint">add travellers in Settings to split</span></div>
       ${emptyState('users','Only you on this trip — nothing to split.')}`
    : `<div class="card-head"><h2>Who paid what</h2><span class="hint">shared expenses split evenly</span></div>
      <div class="settle">${people.map(p => {
        const owes = p.balance < -1, gets = p.balance > 1;
        return `<div class="person">
          <div class="person-top">
            <i class="avatar" style="background:${personColor(p.name)}">${esc(initials(p.name))}</i>
            <span><span class="nm">${esc(p.name)}</span><br><span class="rl">paid ${fmtBase(p.paid)}</span></span>
          </div>
          <div class="track"><i style="width:${(p.paid/maxPaid*100).toFixed(1)}%"></i></div>
          <div class="bal ${owes?'owe':gets?'get':''}">${
            owes ? `owes ${fmtBase(-p.balance)}` : gets ? `is owed ${fmtBase(p.balance)}` : 'settled up'}</div>
        </div>`;
      }).join('')}</div>`;

  /* grouped list */
  if (!list.length) {
    $('#cardExpList').innerHTML = `<div class="card-head"><h2>Expenses</h2></div>` +
      emptyState('search', all.length ? 'Nothing matches those filters.' : 'No expenses logged yet.');
    return;
  }
  const groups = {};
  list.forEach(e => (groups[e.date] = groups[e.date] || []).push(e));
  $('#cardExpList').innerHTML = `<div class="card-head"><h2>Expenses</h2><span class="hint">${list.length} shown</span></div>` +
    Object.keys(groups).sort().reverse().map(date => {
      const tot = groups[date].reduce((s,e) => s + toBase(e.amount,e.cur), 0);
      return `<div class="day-head"><span>${prettyDay(date)}${date===todayISO()?' · today':''}</span><b>${fmtBase(tot)}</b></div>` +
        groups[date].map(e => expenseRow(e,true)).join('');
    }).join('');
}

/* ============================== render: bookings ============================== */
function renderBookings() {
  $$('#bookTypeChips .chip').forEach(c => c.classList.toggle('active', (c.dataset.type||'') === bookFilter));
  const sum = st => S.bookings.filter(b => b.status === st).reduce((a,b) => a + toBase(b.cost,b.cur), 0);
  const paid = sum('paid'), pend = sum('pending'), idea = sum('hold');
  const tot = paid + pend + idea || 1;
  const tile = (icName,p,label,val,foot,frac) => `<div class="tile">
    <div class="tile-top"><span class="tile-ico" style="color:${cssVar('--p'+p)};background:color-mix(in oklab,${cssVar('--p'+p)} 14%, transparent)">${ico(icName)}</span>
    <span class="tile-label">${label}</span></div>
    <div class="tile-val">${val}</div><div class="tile-foot">${foot}</div>
    <div class="catrow" style="grid-template-columns:1fr;margin-top:9px">
      <span class="bar"><i style="width:${(frac*100).toFixed(1)}%;background:${cssVar('--p'+p)}"></i></span></div></div>`;
  $('#bookTiles').innerHTML =
    tile('flag',   6, 'Committed', fmtBase(paid+pend), `${S.bookings.filter(b=>b.status!=='hold').length} confirmed`, (paid+pend)/tot) +
    tile('check-circle', 7, 'Already paid', fmtBase(paid), `${S.bookings.filter(b=>b.status==='paid').length} bookings`, paid/tot) +
    tile('wallet', 3, 'Still to pay', fmtBase(pend), `${S.bookings.filter(b=>b.status==='pending').length} pending`, pend/tot) +
    tile('sparkle',10,'Ideas', fmtBase(idea), `${S.bookings.filter(b=>b.status==='hold').length} not booked`, idea/tot);

  const mineBtn = $('#btnMineOnly');
  if (mineBtn) {
    mineBtn.classList.toggle('active', mineOnly);
    mineBtn.innerHTML = `${ico('users')}${mineOnly ? 'Just ' + esc(meName()) : 'Just mine'}`;
    mineBtn.onclick = () => { mineOnly = !mineOnly; renderBookings(); };
  }
  const list = S.bookings
    .filter(b => !bookFilter || b.type === bookFilter)
    .filter(b => !mineOnly || bookingIsMine(b))
    .sort((a,b) => (a.start||'').localeCompare(b.start||''));
  if (!list.length) {
    $('#bookList').innerHTML = `<div class="card">${emptyState('plane',
      mineOnly ? `Nothing on this trip is just for ${meName()}.` : 'Nothing here yet — add a booking.')}</div>`;
    return;
  }
  const now = nowStamp();
  const up = list.filter(b => (b.end||b.start) >= now), done = list.filter(b => (b.end||b.start) < now);
  $('#bookList').innerHTML =
    (up.length ? `<div class="day-head"><span>Coming up</span><b>${up.length}</b></div>
      <div class="bcards">${up.map(bookingCard).join('')}</div>` : '') +
    (done.length ? `<div class="day-head"><span>Past</span><b>${done.length}</b></div>
      <div class="bcards">${done.map(bookingCard).join('')}</div>` : '');
}

/* ============================== render: people ============================== */
function renderPeople() {
  const rows = personTotals();
  const plan = settlePlan(rows);
  const total = rows.reduce((a,r) => a + r.cost, 0);
  const unsettled = rows.filter(r => r.balance > 0).reduce((a,r) => a + r.balance, 0);

  const tile = (icName,p,label,val,foot) => `<div class="tile">
    <div class="tile-top"><span class="tile-ico" style="color:${cssVar('--p'+p)};background:color-mix(in oklab,${cssVar('--p'+p)} 14%, transparent)">${ico(icName)}</span>
    <span class="tile-label">${label}</span></div>
    <div class="tile-val">${val}</div><div class="tile-foot">${foot}</div></div>`;
  $('#peopleTiles').innerHTML =
    tile('wallet', 1, 'Trip cost so far', fmtBase(total), `${fmtOther(total)} · everyone combined`) +
    tile('users',  6, 'Average a head', fmtBase(rows.length ? total/rows.length : 0),
      `${rows.length} travelling`) +
    tile('flag',   3, 'Still to settle', fmtBase(unsettled),
      plan.length ? `${plan.length} transfer${plan.length===1?'':'s'} to clear it` : 'everyone is square');

  $('#cardSettlePlan').innerHTML = `<div class="card-head"><h2>Settle up</h2>
      <span class="hint">${plan.length ? 'fewest transfers that clear everyone' : ''}</span></div>` +
    (plan.length ? plan.map(t => `<div class="transfer">
        <span class="who"><i class="avatar" style="background:${personColor(t.from)}">${esc(initials(t.from))}</i>${esc(t.from)}</span>
        <span class="arrow">${ico('arrow')}</span>
        <span class="who"><i class="avatar" style="background:${personColor(t.to)}">${esc(initials(t.to))}</i>${esc(t.to)}</span>
        <span class="amt">${fmtBase(t.amt)}</span>
      </div>`).join('')
      : emptyState('check-circle', S.expenses.length ? 'Nobody owes anybody.' : 'Log an expense and the split appears here.'));

  $('#peopleGrid').innerHTML = rows.map(r => {
    const owe = r.balance < -0.5, get = r.balance > 0.5;
    const cats = Object.entries(r.byCat).sort((a,b) => b[1]-a[1]).slice(0,4);
    return `<div class="pcard">
      <div class="pcard-top">
        <i class="avatar" style="background:${personColor(r.name)}">${esc(initials(r.name))}</i>
        <span><span class="nm">${esc(r.name)}</span><br>
          <span class="ptag">${r.count} expense${r.count===1?'':'s'} · ${
            (r.cost/(total||1)*100).toFixed(0)}% of trip cost</span></span>
      </div>
      <div class="cost">${fmtBase(r.cost)}</div>
      <div class="cost-l">what the trip costs ${esc(r.name)} so far</div>
      <div class="pline"><span class="k">Share of group costs</span><span class="v">${fmtBase(r.shareOfShared)}</span></div>
      <div class="pline"><span class="k">Their own spending</span><span class="v">${fmtBase(r.own)}</span></div>
      <div class="pline"><span class="k">Paid out of pocket</span><span class="v">${fmtBase(r.paid)}</span></div>
      ${(() => { const c = cashRows().find(x => x.name === r.name);
        return c && (c.count || c.spent)
          ? `<div class="pline"><span class="k">Cash in hand</span><span class="v">${fmt(c.held,'THB')}</span></div>` : ''; })()}
      <div class="verdict ${owe?'owe':get?'get':'even'}">
        ${owe ? `${ico('wallet')} Owes ${fmtBase(-r.balance)}`
        : get ? `${ico('check-circle')} Is owed ${fmtBase(r.balance)}`
        : `${ico('check-circle')} Settled up`}</div>
      ${cats.length ? `<div class="pcat">${cats.map(([c,v]) => `
        <div class="pcat-row"><span>${esc(c)}</span><span class="v">${fmtBase(v)}</span>
          <span class="bar"><i style="width:${(v/r.cost*100).toFixed(1)}%;background:${catColor(c)}"></i></span></div>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

/* ============================== render: map ============================== */
const MAP = (typeof window !== 'undefined' && window.TH_MAP) ? window.TH_MAP : null;

function project(lat, lon) {
  const { lonMin, latMax, k } = MAP.proj;
  const rad = d => d * Math.PI / 180;
  const my = l => Math.log(Math.tan(Math.PI/4 + rad(l)/2));
  return { x:(rad(lon) - rad(lonMin)) * k, y:(my(latMax) - my(lat)) * k };
}
/* points beyond the frame (India) are pulled to the edge and drawn as gateways */
function clampToFrame(a, b) {
  const m = 26, fr = { x0:-MAP.pad+m, x1:MAP.w+MAP.pad-m, y0:-MAP.pad+m, y1:MAP.h+MAP.pad-m };
  let t = 1;
  const hit = (lim, from, to) => { const d = to - from; if (Math.abs(d) > 1e-6) t = Math.min(t, (lim - from)/d); };
  if (b.x < fr.x0) hit(fr.x0, a.x, b.x);
  if (b.x > fr.x1) hit(fr.x1, a.x, b.x);
  if (b.y < fr.y0) hit(fr.y0, a.y, b.y);
  if (b.y > fr.y1) hit(fr.y1, a.y, b.y);
  return { x:a.x + (b.x-a.x)*t, y:a.y + (b.y-a.y)*t, off:t < 0.999 };
}
const arc = (a, b, bend = 0.16) => {
  const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
  const dx = b.x-a.x, dy = b.y-a.y;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${(mx - dy*bend).toFixed(1)} ${(my + dx*bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};

/* how far each kind of leg bows off the straight line, and how it reads in the list */
const BEND = { air:0.16, ferry:0.10, road:0.06, ground:0.08, daytrip:0.22 };
const KIND = {
  air:    { ic:'plane', word:'flight' },
  ferry:  { ic:'boat',  word:'ferry' },
  road:   { ic:'car',   word:'road transfer' },
  ground: { ic:'car',   word:'transfer' },
  daytrip:{ ic:'boat',  word:'day trip' }
};

function mapLegs() {
  const flights = S.bookings.filter(b => b.type === 'flight' && PLACES[b.from] && PLACES[b.to])
    .sort((a,b) => (a.start||'').localeCompare(b.start||''));
  const legs = flights.map(b => ({
    kind:'air', booked:b.status !== 'hold', from:b.from, to:b.to, b,
    date:dOnly(b.start), who:b.who || ''
  }));
  /* Stay-to-stay hops with no flight covering them are surface travel. The
     transport booking on that date says how: `via` means it is really two
     legs, a ferry to the mainland and then a road transfer. */
  const stays = S.bookings.filter(b => b.type === 'hotel' && STAY_AT[b.city])
    .sort((a,b) => (a.start||'').localeCompare(b.start||''));
  for (let i = 1; i < stays.length; i++) {
    const from = stays[i-1].city, to = stays[i].city;
    const covered = flights.some(f => (PLACES[f.to]?.n === to) && dOnly(f.start) === dOnly(stays[i].start));
    if (covered) continue;
    const date = dOnly(stays[i].start);
    const trn = S.bookings.find(b => b.type === 'transport' && dOnly(b.start) === date);
    const meta = { date, planned:!!trn, booked:!!trn && trn.status !== 'hold',
                   b:trn || null, who:(trn && trn.who) || 'All five' };
    if (trn && SPOTS[trn.via]) {
      legs.push({ kind:'ferry', from, to:trn.via, ...meta });
      legs.push({ kind:'road', from:trn.via, to, ...meta });
    } else {
      legs.push({ kind:trn ? 'road' : 'ground', from, to, ...meta });
    }
  }
  /* day trips: out from wherever they are staying and back again the same day */
  S.bookings.filter(b => b.type === 'activity' && SPOTS[b.spot] && STAY_AT[b.base]).forEach(b => {
    legs.push({ kind:'daytrip', from:b.base, to:b.spot, b, date:dOnly(b.start),
                booked:b.status !== 'hold', who:b.who || '' });
  });
  return legs.sort((a,b) => (a.date||'').localeCompare(b.date||''));   // stable: same-day order kept
}

function renderMap() {
  if (!MAP) { $('#cardMap').style.display = 'none'; return; }
  const legs = mapLegs();
  const cityOf = key => PLACES[key]?.n || SPOTS[key]?.n || key;
  const at = key => { const p = PLACES[key] || SPOTS[key] || STAY_AT[key];
    return p ? project(p.lat, p.lon) : null; };
  const isSpot = key => !PLACES[key] && !!SPOTS[key];

  /* keep labels from sitting on top of each other */
  const spread = (items, gap) => {
    items.sort((a,b) => a.ly - b.ly);
    for (let i = 1; i < items.length; i++)
      if (items[i].ly - items[i-1].ly < gap) items[i].ly = items[i-1].ly + gap;
    return items;
  };

  const paths = [], gates = [], pins = new Map();     // pins keyed by city, so BKK and the Bangkok stay merge
  legs.forEach(l => {
    const a0 = at(l.from), b0 = at(l.to);
    if (!a0 || !b0) return;
    const a = clampToFrame(b0, a0), b = clampToFrame(a0, b0);
    [[l.from, a, a0], [l.to, b, b0]].forEach(([key, pt, raw]) => {
      if (pt.off) gates.push({ x:pt.x, y:pt.y, ly:pt.y, code:key, name:cityOf(key) });
      else if (!pins.has(cityOf(key)))
        pins.set(cityOf(key), { x:raw.x, y:raw.y, ly:raw.y, name:cityOf(key), spot:isSpot(key) });
    });
    const cls = l.kind === 'air' ? (l.booked ? 'booked' : 'plan') : l.kind;
    paths.push(`<path class="leg ${cls}" d="${arc(a, b, BEND[l.kind] ?? 0.16)}"/>`);
  });
  S.bookings.filter(b => b.type === 'hotel' && STAY_AT[b.city]).forEach(b => {
    if (pins.has(b.city)) return;
    const p = at(b.city);
    pins.set(b.city, { x:p.x, y:p.y, ly:p.y, name:b.city });
  });

  const pinArr = spread([...pins.values()], 30);
  const seen = new Set();
  const gateArr = spread(gates.filter(g => { if (seen.has(g.code)) return false; seen.add(g.code); return true; }), 46);

  const marker = v => {
    const x = v.x.toFixed(1), y = v.y.toFixed(1);
    return v.spot ? `<circle class="spot" cx="${x}" cy="${y}" r="4"/>`
      : `<circle class="pin" cx="${x}" cy="${y}" r="7"/><circle class="pin-core" cx="${x}" cy="${y}" r="3"/>`;
  };
  /* A label normally sits on the roomier side of its point. If that side would
     lay the word across another point it flips instead — a small marker lost
     behind a label is worse than a label on the tighter side. Widths are
     estimated from the character count; SVG text cannot be measured here. */
  const label = v => {
    const off = v.spot ? 12 : 15, w = v.name.length * (v.spot ? 8.4 : 10.5);
    const box = r => r ? [v.x + off, v.x + off + w] : [v.x - off - w, v.x - off];
    const hides = r => { const [x0, x1] = box(r);
      return pinArr.some(p => p !== v && p.x > x0 - 5 && p.x < x1 + 5 && Math.abs(p.y - v.ly) < 12); };
    const fits = r => { const [x0, x1] = box(r);
      return x0 > -MAP.pad + 2 && x1 < MAP.w + MAP.pad - 2; };
    let right = v.x < MAP.w * 0.5;
    if (hides(right) && !hides(!right) && fits(!right)) right = !right;
    const tx = (v.x + (right ? off : -off)).toFixed(1);
    const lead = Math.abs(v.ly - v.y) > 8
      ? `<path class="leader" d="M${v.x.toFixed(1)} ${v.y.toFixed(1)} L${tx} ${v.ly.toFixed(1)}"/>` : '';
    return `<g>${lead}<text class="${v.spot ? 'spot-l' : ''}" x="${tx}" y="${
      (v.ly + (v.spot ? 5 : 6)).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(v.name)}</text></g>`;
  };
  /* Points first — day-trip spots over the city pins they sit beside — then every
     label on top, so no label's halo can swallow a nearby point. */
  const pinSvg = pinArr.filter(v => !v.spot).map(marker).join('')
               + pinArr.filter(v => v.spot).map(marker).join('')
               + pinArr.map(label).join('');

  const gateSvg = gateArr.map(g => `<g>
      <circle class="gate" cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="5"/>
      ${Math.abs(g.ly - g.y) > 8 ? `<path class="leader" d="M${g.x.toFixed(1)} ${g.y.toFixed(1)} L${(g.x+13).toFixed(1)} ${g.ly.toFixed(1)}"/>` : ''}
      <text class="code" x="${(g.x + 15).toFixed(1)}" y="${(g.ly - 3).toFixed(1)}">${esc(g.code)}</text>
      <text class="sub" x="${(g.x + 15).toFixed(1)}" y="${(g.ly + 15).toFixed(1)}">${esc(g.name)}</text></g>`).join('');

  const rows = legs.map(l => {
    const k = KIND[l.kind] || KIND.ground;
    const state = l.kind === 'ground'
      ? (l.planned ? 'transfer planned, not booked' : 'transfer to arrange')
      : (l.booked ? 'booked' : 'not booked yet');
    const what = l.kind === 'air' ? '' : ` · ${k.word}${l.kind === 'daytrip' ? ', back the same day' : ''}`;
    return `<div class="leg-row">
      <span class="pair">${esc(l.from)} ${ico(k.ic)} ${esc(l.to)}</span>
      <span class="det">${l.date ? prettyDay(l.date) : '—'}${what} · ${state}
        <span class="who">${esc(l.who || '')}</span></span>
      ${l.b && Number(l.b.cost) ? `<span class="row-amt">${fmt(l.b.cost, l.b.cur)}</span>` : ''}
    </div>`;
  }).join('');

  $('#cardMap').style.display = '';
  $('#cardMap').innerHTML = `
    <div class="card-head"><h2>Route map</h2>
      <span class="hint">${legs.filter(l=>l.kind==='air').length} flights · ${
        new Set(legs.filter(l=>l.kind!=='air' && l.kind!=='daytrip').map(l=>l.date)).size} transfers · ${
        legs.filter(l=>l.kind==='daytrip').length} day trips</span></div>
    <div class="map-layout">
      <div class="map-wrap">
        <svg class="map-svg" viewBox="${MAP.viewBox}" role="img" aria-label="Map of Thailand with the trip's flights, ferry and road transfers and day trips">
          ${MAP.land.map(d => `<path class="land" d="${d}"/>`).join('')}
          ${paths.join('')}
          ${gateSvg}
          ${pinSvg}
        </svg>
        <div class="map-legend">
          <span><i class="sw-air"></i> flight booked</span>
          <span><i class="sw-plan"></i> flight to book</span>
          <span><i class="sw-ferry"></i> ferry</span>
          <span><i class="sw-road"></i> road</span>
          <span><i class="sw-day"></i> day trip</span>
        </div>
      </div>
      <div class="leg-list">${rows || emptyState('plane','No flights with airports set yet.')}</div>
    </div>`;
}

/* ---------------- editing a day plan ----------------
   A plan is a title plus label/detail pairs. In the editor those are plain
   "Label: detail" lines, which is how people write them anyway. A colon inside
   a time ("9:30") is not a separator — hence the (?!\d). */
const LABEL_MAX = 20;                       // longer than this is prose, not a label
const planToText = p => ((p && p.lines) || []).map(([k, v]) => k ? `${k}: ${v}` : v).join('\n');
function textToPlanLines(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.search(/:(?!\d)/);
    /* Labels render into an 86px column, so a long one is really a sentence
       that happens to contain a colon. Leave those as a single detail line. */
    return (i < 0 || i > LABEL_MAX) ? ['', l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
}

function editDay(iso) {
  const plan = (S.days || {})[iso] || null;
  openModal(prettyLong(iso), [
    { key:'title', label:'What this day is', span:true, ph:'Koh Samui \u2192 Krabi' },
    { key:'lines', label:'Plan \u2014 one "Label: detail" per line', type:'textarea', rows:7, span:true,
      ph:'Morning: ferry from Samui\nAfternoon: check in at Ao Nang\nDinner: night market' }
  ], { title: plan ? plan.title || '' : '', lines: planToText(plan) }, d => {
    const title = String(d.title || '').trim();
    const lines = textToPlanLines(d.lines);
    S.days = S.days || {};
    if (!title && !lines.length) {
      if (!S.days[iso]) return;
      delete S.days[iso];                       // the diff turns this into a DELETE
      save(); render(); toast('Day cleared');
      return;
    }
    S.days[iso] = { title, lines, edited: new Date().toISOString() };
    save(); render(); toast(plan ? 'Day updated' : 'Day planned');
  });
}

/* ============================== render: itinerary ============================== */
function renderItinerary() {
  renderMap();

  const days = dateRange(S.settings.start, S.settings.end);
  if (!days.length) {
    $('#timeline').innerHTML = `<div class="card">${emptyState('calendar', S.settings.start
      ? 'Add your return date in Settings and the day-by-day timeline appears here.'
      : 'Set trip start and end dates in Settings to build the timeline.')}</div>`;
    return;
  }
  $('#timeline').innerHTML = days.map((d,i) => {
    const items = S.bookings.filter(b => dOnly(b.start) === d)
      .sort((a,b) => (a.start||'').localeCompare(b.start||''));
    const staying = S.bookings.find(b => b.type === 'hotel' && b.end && dOnly(b.start) < d && d < dOnly(b.end));
    const spend = spentOn(d);
    const isToday = d === todayISO();
    const plan = (S.days || {})[d];
    return `<div class="tl-day${isToday?' is-today':''}${items.length?' has':''}">
      <span class="tl-dot">${i+1}</span>
      <div class="tl-head">
        <span class="d">${prettyLong(d)}</span>
        ${isToday ? `<span class="badge soon">today</span>` : ''}
        <span class="m">${plan ? esc(plan.title) : ''}${
          plan && items.length ? ' · ' : ''}${items.length ? `${items.length} booked or planned` : (plan ? '' : 'nothing planned')}</span>
        <button type="button" class="icon-btn tl-edit" data-edit-day="${d}"
          title="${plan ? 'Edit this day' : 'Plan this day'}">${ico(plan ? 'pencil' : 'plus')}</button>
      </div>
      <div class="tl-body">
        ${plan ? `<div class="tl-plan">
          <div class="tp-title">${esc(plan.title || '')}</div>
          ${(plan.lines || []).map(([k, v]) => `<div class="tp-line">
            <span class="tp-k">${esc(k)}</span><span class="tp-v">${esc(v)}</span></div>`).join('')}
        </div>` : ''}
        ${staying || spend ? `<div class="tl-chips">
          ${staying ? `<span class="tchip">${ico('bed')}${esc(staying.title)}${staying.city?` · ${esc(staying.city)}`:''}</span>` : ''}
          ${spend ? `<span class="tchip">${ico('wallet')}${fmtBase(spend)} spent</span>` : ''}
        </div>` : ''}
        ${items.length ? `<div class="tl-items">${items.map(bookingRow).join('')}</div>`
          : (plan ? '' : `<p class="tl-free">Free day — nothing booked.</p>`)}
      </div></div>`;
  }).join('');
}

/* ============================== render: checklist ============================== */
function renderChecklist() {
  const groups = {};
  S.checklist.forEach(i => (groups[i.group] = groups[i.group] || []).push(i));
  const names = Object.keys(groups).sort((a,b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  $('#clGroups').innerHTML = names.length ? names.map(g => {
    const items = groups[g], done = items.filter(i => i.done).length;
    const pct = items.length ? done/items.length*100 : 0;
    const col = pct === 100 ? cssVar('--p7') : cssVar('--p1');
    return `<div class="clgroup">
      <div class="clg-head">
        ${miniRing(pct, col)}
        <h3>${esc(g)}</h3>
        <span class="clg-count">${done}/${items.length}</span>
      </div>
      ${items.map(i => `<label class="cl-item">
        <input type="checkbox" data-cl="${i.id}" ${i.done?'checked':''}>
        <span class="cbox">${ico('check')}</span>
        <span class="txt">${esc(i.text)}</span>
        <button type="button" class="icon-btn" data-del-cl="${i.id}">${ico('trash')}</button>
      </label>`).join('')}
    </div>`;
  }).join('') : `<div class="card">${emptyState('check-circle','Nothing on the list.')}</div>`;
}

/* ============================== render: settings ============================== */
function renderSettings() {
  const s = S.settings;
  $('#setName').value = s.name;
  $('#setStart').value = s.start; $('#setEnd').value = s.end;
  $('#setBudget').value = Math.round(budgetBase()) || '';
  $('#setMyBudget').value = Math.round(toBase(Number(s.myBudget)||0, s.budgetCur||base())) || '';
  $('#setMyBudget').placeholder = Math.round(myBudgetBase()) || '';
  $('#setBudgetCur').textContent = `(in ${base()})`;
  $('#setRate').value = s.rate; $('#setRateAuto').value = s.rateAuto ? '1' : '0';
  $('#setPeople').value = s.people.join(', ');
  $('#rateAge').textContent = s.rateLive ? rateAge() : 'no live rate yet';
  $('#rateLine').innerHTML = `<span class="big">1 ฿ = ₹${(Number(s.rate)||0).toFixed(4)}</span>
    <span class="src">${s.rateLive
      ? `live ₹${s.rateLive} from ${esc(s.rateProvider||'—')}, ${rateAge()}${s.rateAuto?'' : ' · auto-update off'}`
      : 'not fetched yet — using your value'}</span>`;
  $('#catEditor').innerHTML = s.categories.map(c =>
    `<span class="tag"><i class="sw" style="background:${catColor(c)}"></i>${esc(c)}
      <button data-del-cat="${esc(c)}" title="Remove">${ico('x')}</button></span>`).join('');
}
/* The Budget card is redrawn on every render, so the switch is delegated
   rather than bound to a button that will not exist a moment later. */
document.addEventListener('click', e => {
  const b = e.target.closest('#budgetLens button');
  if (!b) return;
  S.settings.budgetView = b.dataset.lens;
  save(); render();
});

$('#btnSaveSettings').onclick = () => {
  const s = S.settings;
  s.name = $('#setName').value.trim() || 'Thailand';
  s.start = $('#setStart').value; s.end = $('#setEnd').value;
  s.budget = Number($('#setBudget').value) || 0;
  s.budgetCur = base();                       // anchor it to what the field said
  s.myBudget = Number($('#setMyBudget').value) || 0;
  s.people = $('#setPeople').value.split(',').map(x => x.trim()).filter(Boolean);
  if (!s.people.length) s.people = ['Me'];
  if (!s.people.includes(s.me)) s.me = s.people[0];
  save(); render(); toast('Trip settings saved');
};
$('#catForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#catNew').value.trim();
  if (v && !S.settings.categories.includes(v)) S.settings.categories.push(v);
  $('#catNew').value = ''; save(); render();
});
$('#clForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#clText').value.trim(); if (!text) return;
  S.checklist.push({ id:uid(), text, group:$('#clGroup').value, done:false });
  $('#clText').value = ''; save(); render(); toast('Added to checklist');
});
$('#notes').addEventListener('input', e => { S.notes = e.target.value; save(); });

/* ---------------- import / export ---------------- */
function download(name, text, type='application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#btnExport').onclick = () => { download(`thailand-trip-${todayISO()}.json`, JSON.stringify(S,null,2)); toast('Backup downloaded'); };
$('#btnCSV').onclick = () => {
  const rows = [['Date','Category','Note','Paid by','Method','Split','Amount','Currency',`Amount (${base()})`]];
  [...S.expenses].sort((a,b) => (a.date||'').localeCompare(b.date||''))
    .forEach(e => rows.push([e.date,e.cat,e.note,e.payer,e.method,e.split,e.amount,e.cur,toBase(e.amount,e.cur).toFixed(2)]));
  download(`thailand-expenses-${todayISO()}.csv`,
    rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n'), 'text/csv');
  toast('CSV downloaded');
};
/* merge = union by id, so two people can trade ledgers without losing entries */
function mergeIn(incoming) {
  let added = 0;
  ['expenses','bookings','cash'].forEach(k => {
    const have = new Set((S[k] || []).map(x => x.id));
    (incoming[k] || []).forEach(x => {
      if (x && x.id && !have.has(x.id)) { (S[k] = S[k] || []).push(x); have.add(x.id); added++; }
    });
  });
  return added;
}
$('#btnImport').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || typeof d !== 'object') throw new Error('not a trip file');
      const merge = confirm('Merge this file into what you already have?\n\nOK = merge (nothing lost)\nCancel = replace everything');
      if (merge) {
        const n = mergeIn(d);
        save(); render(); toast(n ? `Merged ${n} new entries` : 'Nothing new to merge');
      } else {
        if (!confirm('Replace all current data with this file?')) return;
        S = Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings||{}) });
        save(); applyTheme(); render(); toast('Imported');
      }
    } catch (err) { alert('Could not read that file: ' + err.message); }
  };
  r.readAsText(f); e.target.value = '';
};
$('#btnReset').onclick = () => {
  if (!confirm('Erase everything and start a clean trip?')) return;
  const theme = S.settings.theme; S = blank(); S.settings.theme = theme;
  save(); render(); toast('Cleared');
};

/* ============================== navigation ============================== */
const VIEWS = {
  dashboard:{ t:'Overview',  s:'Where the money and the plans stand', ic:'grid' },
  expenses: { t:'Expenses',  s:'',                                     ic:'wallet' },
  bookings: { t:'Bookings',  s:'Flights, stays, transport, activities',ic:'plane' },
  people:   { t:'People',    s:'What the trip costs each of you',      ic:'users' },
  itinerary:{ t:'Itinerary', s:'Your trip laid out day by day',        ic:'calendar' },
  checklist:{ t:'Checklist', s:'Nothing forgotten at the airport',     ic:'check-circle' },
  settings: { t:'Settings',  s:'Trip, currency, people and your data', ic:'sliders' }
};
let view = 'dashboard';

$('#bottomnav').innerHTML = Object.entries(VIEWS).map(([k,v]) =>
  `<button data-view="${k}">${ico(v.ic)}<span>${v.t}</span></button>`).join('');

function go(v) {
  if (!VIEWS[v]) v = 'dashboard';
  view = v;
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $('#viewTitle').textContent = VIEWS[v].t;
  $('#viewSub').textContent = v === 'expenses'
    ? `Every ${base() === 'THB' ? 'baht' : 'rupee'}, grouped by day` : VIEWS[v].s;
  /* Only offer "Add booking" where it makes sense. Bookings and Expenses have
     their own add buttons; Checklist, People and Settings have nothing to add
     a booking to. */
  const wantsAddBooking = v === 'dashboard' || v === 'itinerary';
  $('#btnQuickBooking').style.display = wantsAddBooking ? '' : 'none';
  history.replaceState(null,'','#'+v);
  window.scrollTo({top:0});
  render();
}
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view]');
  if (nav) return go(nav.dataset.view);

  const cat = e.target.closest('[data-cat]');
  if (cat) { expCat = cat.dataset.cat; return renderExpenses(); }

  const chip = e.target.closest('#bookTypeChips .chip');
  if (chip) { bookFilter = chip.dataset.type || ''; return renderBookings(); }

  const t = e.target.closest('[data-edit-exp],[data-del-exp],[data-edit-book],[data-del-book],[data-del-cl],[data-del-cat],[data-edit-cash],[data-del-cash],[data-edit-day]');
  if (!t) return;
  const d = t.dataset;
  if (d.editExp)  editExpense(d.editExp);
  if (d.delExp)   delExpense(d.delExp);
  if (d.editBook) editBooking(d.editBook);
  if (d.delBook)  delBooking(d.delBook);
  if (d.delCl)    { e.preventDefault(); S.checklist = S.checklist.filter(i => i.id !== d.delCl); save(); render(); }
  if (d.delCat)   { S.settings.categories = S.settings.categories.filter(c => c !== d.delCat); save(); render(); }
  if (d.editDay)  editDay(d.editDay);
  if (d.editCash) editCash(d.editCash);
  if (d.delCash)  delCash(d.delCash);
});
document.addEventListener('change', e => {
  const id = e.target.dataset.cl; if (!id) return;
  const i = S.checklist.find(x => x.id === id);
  if (i) { i.done = e.target.checked; save(); renderChecklist(); }
});
$('#rateChip').onclick = openRateModal;
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cur]');
  if (!c) return;
  S.settings.base = c.dataset.cur;
  save(); render(); toast(`Showing totals in ${c.dataset.cur}`);
});
$('#btnRateNow').onclick = () => refreshRate(true);
$('#btnSaveRate').onclick = () => {
  const v = Number($('#setRate').value);
  if (v > 0) S.settings.rate = v;
  S.settings.rateAuto = $('#setRateAuto').value === '1';
  save(); render(); toast('Rate settings saved');
  if (S.settings.rateAuto && !rateIsFresh()) refreshRate(false);
};
$('#btnQuickExpense').onclick = $('#btnAddExpense').onclick = openQuick;
$('#btnQuickBooking').onclick = $('#btnAddBooking').onclick = addBooking;

/* Fill a form from a booking PDF or a receipt. The file is read in the browser,
   scraped for text and dropped — it is never saved and never uploaded. */
if (window.TripImport) {
  $('#btnPdfExpense').onclick = () => TripImport.importFrom('expense');
  $('#btnPdfBooking').onclick = () => TripImport.importFrom('booking');
} else {
  $('#btnPdfExpense').hidden = $('#btnPdfBooking').hidden = true;
}
$('#expSearch').oninput = renderExpenses;
$('#expPayerFilter').onchange = renderExpenses;
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/input|select|textarea/i.test(document.activeElement?.tagName || '')) return;
  if (e.key === 'e') { e.preventDefault(); openQuick(); }
  if (e.key === 'E') { e.preventDefault(); addExpense(); }
  if (e.key === 'b') { e.preventDefault(); addBooking(); }
});

/* ---------------- new version available ---------------- */
const BUILD = (() => {
  const src = document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '';
  return (src.split('?v=')[1] || '').trim();
})();
let updateSeen = '';

async function checkForUpdate() {
  if (!BUILD) return;
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();
    if (v && v !== BUILD && v !== updateSeen) { updateSeen = v; showUpdateBanner(); }
  } catch {}
}
function showUpdateBanner() {
  if ($('#newBuild')) return;
  const bar = document.createElement('div');
  bar.id = 'newBuild';
  bar.className = 'updatebar';
  bar.innerHTML = `${ico('download')}
    <span class="msg"><b>A newer version is available</b>
      <small>Reload to pick up the latest fixes. Nothing you have logged is lost.</small></span>
    <span class="acts"><button class="btn brand" id="newBuildGo">Reload</button></span>`;
  $('#updateBar').after(bar);
  $('#newBuildGo').onclick = () => location.reload();
}

/* ---------------- who is this device? ---------------- */
function renderIdentityBar() {
  const el = $('#updateBar');
  const people = S.settings.people || [];
  if (S.settings.me || people.length < 2) return false;
  if (TA && TA.signedIn()) {                       // sign-in tells us who they are
    const nm = nameForEmail(TA.Auth.email);
    if (nm) { S.settings.me = nm; save(); return false; }
  }
  el.innerHTML = `<div class="updatebar">
    ${ico('users')}
    <span class="msg"><b>Who are you on this trip?</b>
      <small>Sets who new expenses are logged as on this device. It stays here — everyone picks their own.</small></span>
    <span class="acts">
      <select id="whoAmI">${people.map(p => `<option>${esc(p)}</option>`).join('')}</select>
      <button class="btn brand" id="whoAmIOk">That's me</button>
    </span></div>`;
  $('#whoAmIOk').onclick = () => {
    S.settings.me = $('#whoAmI').value;
    save(); render(); toast(`Logging as ${S.settings.me}`);
  };
  return true;
}

/* The only bar left here asks who this device belongs to, and even that is
   skipped when sign-in already answers it. The app-version prompt is separate
   and inserts itself after this element. */
function renderUpdateBar() {
  if (DEMO) {
    $('#updateBar').innerHTML = `<div class="updatebar">
      ${ico('sparkle')}
      <span class="msg"><b>Demo mode</b>
        <small>Sample data, kept in this browser only. Nothing is signed in and nothing
        syncs — edit anything you like, no real trip can be affected.</small></span>
      <span class="acts"><a class="btn ghost" href="?nodemo">Leave demo</a></span></div>`;
    return;
  }
  if (!renderIdentityBar()) $('#updateBar').innerHTML = '';
}

/* One-time move to the single ledger: fill in who paid each known booking, and
   remove the five hand-made expense rows that mirrored them. Runs once, on the
   first signed-in load, then records itself so it never repeats. */
const PAID_BY = {
  '35riquq': { bookedBy:'Akshat',   paidBy:'Akshat',   split:'shared'   },  // Bangkok Airbnb
  '3rlbi92': { bookedBy:'Anusheel', paidBy:'Anusheel', split:'shared'   },  // Koh Samui Airbnb
  '51q0sno': { bookedBy:'Bhavesh',  paidBy:'Bhavesh',  split:'shared'   },  // Ao Nang Airbnb
  'zs34pta': { bookedBy:'Akshat',   paidBy:'Akshat',   split:'shared'   },  // Phuket Airbnb
  'c444gvg': { bookedBy:'Bhavesh',  paidBy:'Bhavesh',  split:'personal' }   // BLR → BKK, own ticket
};
const MIRROR_EXPENSES = ['newefnn','bszp73k','iv2962y','t5zp56h','hwrd780'];

function migrateToSingleLedger() {
  S.settings.migrations = S.settings.migrations || {};
  if (S.settings.migrations.singleLedger && S.settings.migrations.audience) return false;
  S.settings.migrations.audience = true;
  if (!S.bookings.length) return false;              // wait until the trip has loaded

  let touched = 0;
  Object.entries(PAID_BY).forEach(([id, v]) => {
    const b = S.bookings.find(x => x.id === id);
    if (!b) return;
    if (!b.paidBy)   { b.paidBy = v.paidBy; touched++; }
    if (!b.bookedBy) { b.bookedBy = v.bookedBy; touched++; }
    if (!b.split)    { b.split = v.split; touched++; }
  });
  const gone = S.expenses.filter(e => MIRROR_EXPENSES.includes(e.id)).length;
  if (gone) {
    S.removed = [...new Set([...(S.removed || []), ...MIRROR_EXPENSES])];
    S.expenses = S.expenses.filter(e => !MIRROR_EXPENSES.includes(e.id));
    touched += gone;
  }
  S.bookings.forEach(b => {
    if (!Array.isArray(b.forWhom) || !b.forWhom.length) { b.forWhom = parseWho(b.who); touched++; }
  });
  S.settings.migrations.singleLedger = true;
  if (touched) { save(); console.info(`[migrate] single ledger: ${touched} change(s)`); }
  return touched > 0;
}

/* ============================== live sync ============================== */
const TS = (typeof window !== 'undefined' && window.TripSync) || null;
const TA = (typeof window !== 'undefined' && window.TripAuth) || null;
const SETS = ['expenses','bookings','cash'];

/* server state arriving as one whole tree: union by id, server wins on ties */
/* Your edit carries an `edited` timestamp. If it is newer than the server's
   copy — or the server's copy has never been edited — yours wins. Without this
   an incoming full-tree message can silently revert what you just typed. */
function localWins(local, incoming) {
  if (!local || !local.edited) return false;
  if (!incoming || !incoming.edited) return true;
  return String(local.edited) > String(incoming.edited);
}

function mergeTree(tree) {
  if (!tree || typeof tree !== 'object') return;
  const pending = TS ? TS.pendingIds() : new Set();
  SETS.forEach(kind => {
    const incoming = tree[kind] ? Object.values(tree[kind]).filter(Boolean) : [];
    const byId = new Map((S[kind] || []).map(x => [x.id, x]));
    /* our own unsent edit outranks the server's older copy */
    incoming.forEach(r => {
      if (!r || !r.id || pending.has(r.id)) return;
      if (localWins(byId.get(r.id), r)) return;
      byId.set(r.id, r);
    });
    S[kind] = [...byId.values()];
  });
  if (tree.checklist) {
    const byId = new Map((S.checklist || []).map(i => [i.id, i]));
    Object.values(tree.checklist).filter(Boolean).forEach(i => i && i.id && byId.set(i.id, i));
    S.checklist = [...byId.values()];
  }
  if (typeof tree.notes === 'string' && tree.notes.trim()) S.notes = tree.notes;
  if (tree.settings && tree.settings.people) {
    const localOnly = ['theme','base','me','lastQuick','rate','rateAuto','rateLive','rateFetched','rateProvider'];
    const keep = {}; localOnly.forEach(k => { if (S.settings[k] !== undefined) keep[k] = S.settings[k]; });
    S.settings = Object.assign({}, S.settings, tree.settings, keep);
  }
  if (tree.days) {
    const pendingDays = TS ? TS.pendingIds('days') : new Set();
    const out = {};
    Object.entries(tree.days).forEach(([iso, plan]) => { if (plan) out[iso] = plan; });
    /* A day we edited more recently than the server's copy stays ours. Any
       other day the server no longer has was deleted by someone else. */
    Object.entries(S.days || {}).forEach(([iso, plan]) => {
      if (pendingDays.has(iso) || localWins(plan, out[iso])) out[iso] = plan;
    });
    S.days = out;
  }
  if (Array.isArray(tree.removed)) S.removed = [...new Set([...(S.removed || []), ...tree.removed])];
  /* honour deletions made on other devices */
  const gone = new Set(S.removed || []);
  if (gone.size) SETS.forEach(k => { S[k] = (S[k] || []).filter(x => !gone.has(x.id)); });
}

/* Joining a trip that already has content: take what the group has rather than
   merging. A fresh device's "content" is only the app's built-in defaults, and
   merging those uploads a duplicate checklist for every person who joins. */
function adoptTree(tree) {
  if (!tree || typeof tree !== 'object') return;
  const pending = TS ? TS.pendingIds() : new Set();
  SETS.forEach(k => {
    const mine = new Map((S[k] || []).map(x => [x.id, x]));
    const server = tree[k] ? Object.values(tree[k]).filter(Boolean) : [];
    const out = new Map();
    server.forEach(r => { if (r && r.id) out.set(r.id, r); });
    mine.forEach((v, id) => { if (pending.has(id) || localWins(v, out.get(id))) out.set(id, v); });
    S[k] = [...out.values()];
  });
  if (tree.checklist) S.checklist = Object.values(tree.checklist).filter(Boolean);
  if (typeof tree.notes === 'string') S.notes = tree.notes;
  if (tree.days) {
    const pendingDays = TS ? TS.pendingIds('days') : new Set();
    const out = Object.assign({}, tree.days);
    Object.entries(S.days || {}).forEach(([iso, plan]) => { if (pendingDays.has(iso)) out[iso] = plan; });
    S.days = out;
  }
  if (Array.isArray(tree.removed)) S.removed = tree.removed;
  if (tree.settings && tree.settings.people) {
    const localOnly = ['theme','base','me','lastQuick','rate','rateAuto','rateLive','rateFetched','rateProvider'];
    const keep = {}; localOnly.forEach(k => { if (S.settings[k] !== undefined) keep[k] = S.settings[k]; });
    S.settings = Object.assign({}, S.settings, tree.settings, keep);
  }
}

/* a single path changing, e.g. /expenses/ab12cd */
function applyPath(path, data) {
  const parts = String(path || '/').split('/').filter(Boolean);
  if (!parts.length) { mergeTree(data); return; }
  const [kind, id] = parts;
  if (SETS.includes(kind)) {
    const list = S[kind] = S[kind] || [];
    if (!id) { mergeTree({ [kind]: data }); return; }
    const i = list.findIndex(x => x.id === id);
    if (data === null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = data; else list.push(data);
  } else if (kind === 'checklist') {
    const list = S.checklist = S.checklist || [];
    if (!id) { mergeTree({ checklist: data }); return; }
    const i = list.findIndex(x => x.id === id);
    if (data === null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = data; else list.push(data);
  } else if (kind === 'notes')    { if (typeof data === 'string') S.notes = data; }
  else if (kind === 'days') {
    S.days = S.days || {};
    if (!id)                { S.days = data || {}; }
    else if (data === null) { delete S.days[id]; }
    else                    { S.days[id] = data; }
  }
  else if (kind === 'removed')    { if (Array.isArray(data)) S.removed = data; }
  else if (kind === 'settings')   { mergeTree({ settings: data }); }
}

let lastTestOut = '';        // survives re-renders; only a new test replaces it
function syncStatusUI(st) {
  const el = $('#syncStatus'); if (!el) return;
  const label = { off:'off', connecting:'connecting…', live:'live', offline:'offline — queued', error:'blocked by rules' };
  el.textContent = label[st] || st;
  el.className = st;
  const q = TS && TS.Sync.outbox.length;
  if (q && st !== 'live') el.textContent += ` (${q} waiting)`;
  const d = $('#syncDiag');
  if (d) d.textContent = lastTestOut ||
    ((st !== 'live' && TS && TS.Sync.lastError) ? TS.Sync.lastError : '');
}

async function syncStart() {
  if (!TS || !TS.syncOn()) { syncStatusUI('off'); return; }
  TS.Sync.onStatus = syncStatusUI;
  TS.Sync.onRemote = (path, data) => {
    applyingRemote = true;
    try { applyPath(path, data); localStorage.setItem(KEY, JSON.stringify(S)); }
    finally { applyingRemote = false; }
    TS.primeSnapshot(S);
    render();
  };
  try {
    await TS.flush();                          // send anything queued before pulling
    const tree = await TS.pullOnce();          // whatever the group already has
    /* Baseline the diff against the SERVER, not against ourselves — otherwise
       the first push finds no difference and nothing is ever uploaded. */
    TS.primeSnapshot({
      expenses:  tree && tree.expenses  ? Object.values(tree.expenses)  : [],
      bookings:  tree && tree.bookings  ? Object.values(tree.bookings)  : [],
      cash:      tree && tree.cash      ? Object.values(tree.cash)      : [],
      checklist: tree && tree.checklist ? Object.values(tree.checklist) : [],
      settings:  (tree && tree.settings) || {},
      notes:     (tree && tree.notes) || '',
      days:      (tree && tree.days) || {},
      removed:   (tree && tree.removed) || []
    });
    const serverHasTrip = Boolean(tree && (tree.expenses || tree.bookings || tree.checklist));
    const firstJoin = !TS.hasSynced();
    TS.markSynced();
    applyingRemote = true;
    try {
      if (firstJoin && serverHasTrip) adoptTree(tree);   // joining an existing trip
      else mergeTree(tree);                              // creating one, or reconnecting
      localStorage.setItem(KEY, JSON.stringify(S));
    } finally { applyingRemote = false; }
    migrateToSingleLedger();
    render();
    TS.pushChanges(S);                          // uploads only what is genuinely ours
    TS.startStream();
  } catch (e) {
    console.warn('[sync] initial pull failed:', e.message);
    syncStatusUI(/permission/i.test(e.message) ? 'error' : 'offline');
    TS.flush();
  }
}

/* email -> traveller name lives in the database, so adding someone later does
   not need a redeploy */
function nameForEmail(email) {
  const m = (S.settings && S.settings.members) || {};
  const key = String(email || '').toLowerCase();
  return m[key.replace(/\./g, ',')] || m[key] || '';
}

/* Signing in is the front door, not a setting. While signed out the app is not
   usable at all — which also removes the trap of logging expenses into a local
   copy that would be wiped the first time the device syncs. */
function onSignedIn(err, email) {
  if (err) { const f = $('#gateFoot'); if (f) f.textContent = 'Sign-in failed: ' + err.message; return; }
  const nm = nameForEmail(email);
  if (nm) S.settings.me = nm;
  save();
  applyGate();
  syncStart();
  render();
  toast(nm ? `Signed in — logging as ${nm}` : `Signed in as ${email}`);
}

function applyGate() {
  if (DEMO) {                                       // nothing to protect, so no door
    const g = $('#gate'); if (g) g.hidden = true;
    document.body.classList.remove('gated');
    return;
  }
  if (!TA) return;
  const locked = !TA.signedIn();
  const gate = $('#gate');
  if (gate) gate.hidden = !locked;
  document.body.classList.toggle('gated', locked);
  if (locked) TA.mountSignIn($('#gateBtn'), onSignedIn);
}

function renderWhoAmI() {
  const box = $('#whoami'), btn = $('#gsiButton');
  if (!TA || !box) return;
  if (TA.signedIn()) {
    const a = TA.Auth;
    box.innerHTML = `${a.picture ? `<img src="${esc(a.picture)}" alt="">` : ico('users')}
      <span><span class="who-n">${esc(a.name || 'Signed in')}</span><br>
        <span class="who-e">${esc(a.email)}</span></span>
      <button class="btn" id="btnSignOut">Sign out</button>`;
    $('#btnSignOut').onclick = () => {
      if (!confirm('Sign out on this device?')) return;
      TA.clearAuth(); TS && TS.stopStream(); applyGate(); render(); toast('Signed out');
    };
    if (btn) btn.innerHTML = '';
  } else {
    box.innerHTML = `<span class="hint">Not signed in.</span>`;
    if (btn) btn.innerHTML = '';
  }
}

function renderSync() {
  if (!TS) return;
  renderWhoAmI();
  const tb = $('#btnSyncTest');
  if (tb) tb.onclick = async () => {
    tb.disabled = true; tb.textContent = 'Checking…';
    let r;
    try { r = await TS.testConnection(); }
    catch (e) { lastTestOut = 'test threw: ' + e.message; tb.disabled = false;
                tb.textContent = 'Test connection'; syncStatusUI(TS.Sync.status); return; }
    tb.disabled = false; tb.textContent = 'Test connection';
    lastTestOut =
      `signed in: ${r.signedIn} · ${r.email || 'no email'} · token: ${r.tokenPresent}\n` +
      `path: ${r.path}\n` +
      `READ  HTTP ${r.status} ${r.body}\n` +
      `WRITE HTTP ${r.writeStatus} ${r.writeBody}\n` +
      `queued: ${r.queued} · last error: ${r.lastError}\n` +
      `server copy of HKT→BLR: ${r.sample}`;
    syncStatusUI(TS.Sync.status);
  };

  /* Who you are: derived from the Google account when we can, and then it is
     not editable — otherwise anyone could log spending as someone else. The
     picker only appears as a fallback for an account we cannot map. */
  const row = $('#meRow');
  if (row) {
    const signedIn = TA && TA.signedIn();
    const mapped = signedIn ? nameForEmail(TA.Auth.email) : '';
    if (mapped) {
      if (S.settings.me !== mapped) { S.settings.me = mapped; save(); }
      row.innerHTML = `<div class="me-fixed">${ico('check-circle')}
        <span>Logging as <b>${esc(mapped)}</b><br>
        <small class="hint">from your Google account — not editable</small></span></div>`;
    } else if (signedIn) {
      row.innerHTML = `<label class="stack"><span>You are
          <i class="hint">${esc(TA.Auth.email)} isn't matched to a traveller yet</i></span>
        <select id="setMe"></select></label>`;
      const sel = $('#setMe');
      sel.innerHTML = ['<option value="">— pick your name —</option>']
        .concat((S.settings.people || []).map(p => `<option${p === S.settings.me ? ' selected' : ''}>${esc(p)}</option>`)).join('');
      sel.value = S.settings.me || '';
      sel.onchange = () => { S.settings.me = sel.value; save(); render(); toast(S.settings.me ? `Logging as ${S.settings.me}` : 'Name cleared'); };
    } else {
      row.innerHTML = '';
    }
  }

  syncStatusUI(TS.Sync.status);
  $('#syncBlurb').textContent = TA && TA.signedIn()
    ? 'You share one live ledger with the group. Anything you log appears on their phones in about a second.'
    : 'Sign in with the Google account you were invited with. Only the five of you can open this trip.';
}
/* ============================== render ============================== */
function render() {
  const s = S.settings, st = tripStats();
  renderUpdateBar();
  $('#tripName').textContent = s.name || 'Thailand';
  $('#tripDates').textContent = (s.start && s.end)
    ? `${shortDay(s.start)} – ${shortDay(s.end)} · ${st.total} days`
    : s.start ? `from ${shortDay(s.start)} · return TBD` : 'dates not set';
  const live = S.settings.rateLive && rateIsFresh() && S.settings.rateAuto;
  $('#rateChip').innerHTML = `<i class="live-dot${live?'':' stale'}"></i><span>1 ฿</span>
    <b>₹${(Number(rate())||0).toFixed(3).replace(/0$/,'')}</b>`;
  $('#rateChip').title = S.settings.rateLive
    ? `Live ₹${S.settings.rateLive} from ${S.settings.rateProvider} · ${rateAge()} — click to change`
    : 'No live rate yet — click to fetch or set one';
  $$('[data-cur]').forEach(b => b.classList.toggle('on', b.dataset.cur === base()));

  if (view === 'dashboard') renderDashboard();
  if (view === 'expenses')  renderExpenses();
  if (view === 'bookings')  renderBookings();
  if (view === 'people')    renderPeople();
  if (view === 'itinerary') renderItinerary();
  if (view === 'checklist') { renderChecklist(); $('#notes').value = S.notes || ''; }
  if (view === 'settings')  { renderSettings(); renderSync(); }
}

applyTheme();
save();
go(location.hash.replace('#','') || 'dashboard');
maybeRefreshRate();

if (TA) TA.loadAuth();
if (TA) TA.Auth.onChange = () => { renderWhoAmI(); applyGate(); };
/* Register the offline shell. updateViaCache:'none' stops the browser caching
   the worker itself, which is the classic way a service worker gets stuck. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => reg.addEventListener('updatefound', () => checkForUpdate()))
      .catch(e => console.warn('[sw] not registered:', e.message));
  });
}

applyGate();
checkForUpdate();
setInterval(checkForUpdate, 10 * 60 * 1000);   // every ten minutes
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
if (TS && !DEMO) { TS.loadOutbox(); TS.primeSnapshot(S); syncStart(); }
