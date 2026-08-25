/* =========================================================
   Live sync over Firebase Realtime Database.

   Deliberately no SDK: the database speaks plain REST, and pushes live
   updates over EventSource. That keeps this app dependency-free.

   THE TRUST MODEL, stated plainly:
   Access is controlled by a long random "trip key" that forms part of the
   database path. Anyone holding the key can read and write the trip; anyone
   without it cannot even discover that it exists. The key is NEVER in the
   hosted code — each person pastes it once and it lives in their browser.
   Same trust model as a shared document link. For a five-person expense
   ledger that is proportionate; it is not suitable for anything sensitive.
   ========================================================= */

const SYNC_OUTBOX    = 'th-trip-outbox';
const SYNC_SEEN      = 'th-trip-joined';   // which trips this device has already synced

const Sync = {
  lastError: '',
  db: (typeof window !== 'undefined' && window.TRIP_DB) || '',
  key: (typeof window !== 'undefined' && window.TRIP_PATH) || '',
  status: 'off',            // off | connecting | live | offline | error
  stream: null,
  outbox: [],
  snap: {},                 // last state we pushed, for diffing
  onStatus: () => {},
  onRemote: () => {}
};

/* Nothing talks to the database unless someone is signed in. */
const syncOn = () => Boolean(Sync.db && Sync.key && window.TripAuth && window.TripAuth.signedIn());

/* Auth rides in the query string, not a header — which is precisely why
   EventSource streaming still works while signed in. */
async function tripUrl(path = '') {
  const base = `${Sync.db}/trips/${Sync.key}${path}.json`;
  const t = window.TripAuth ? await window.TripAuth.authToken() : '';
  return t ? `${base}?auth=${encodeURIComponent(t)}` : base;
}

function setStatus(s) {
  if (Sync.status === s) return;
  Sync.status = s;
  Sync.onStatus(s);
}

/* Has this device synced this trip before? A first join adopts what the group
   has; a reconnect merges our own changes in. */
function hasSynced() {
  try { return (JSON.parse(localStorage.getItem(SYNC_SEEN) || '[]')).includes(Sync.key); }
  catch { return false; }
}
function markSynced() {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(SYNC_SEEN) || '[]'); } catch {}
  if (!seen.includes(Sync.key)) { seen.push(Sync.key); localStorage.setItem(SYNC_SEEN, JSON.stringify(seen)); }
}

/* ---------------- outbox: writes survive being offline ---------------- */
function loadOutbox() {
  try { Sync.outbox = JSON.parse(localStorage.getItem(SYNC_OUTBOX) || '[]'); }
  catch { Sync.outbox = []; }
}
function persistOutbox() {
  localStorage.setItem(SYNC_OUTBOX, JSON.stringify(Sync.outbox.slice(-500)));
}
function queue(method, path, body) {
  /* a newer write to the same path replaces an older queued one */
  Sync.outbox = Sync.outbox.filter(o => o.path !== path);
  Sync.outbox.push({ method, path, body, at: Date.now() });
  persistOutbox();
  flush();
}

let flushing = false;
async function flush() {
  if (flushing || !syncOn() || !Sync.outbox.length) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus('offline'); return; }
  flushing = true;
  try {
    while (Sync.outbox.length) {
      const job = Sync.outbox[0];
      const res = await fetch(await tripUrl('/' + job.path), {
        method: job.method,
        headers: { 'Content-Type': 'application/json' },
        body: job.method === 'DELETE' ? undefined : JSON.stringify(job.body ?? null)
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error || ''; } catch {}
        Sync.lastError = `write ${job.path}: ${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`;
        throw new Error(Sync.lastError);
      }
      Sync.outbox.shift();
      persistOutbox();
    }
    if (Sync.status !== 'live') setStatus('live');
  } catch (e) {
    console.warn('[sync] flush failed, will retry:', e.message);
    setStatus('offline');
    setTimeout(flush, 15000);
  } finally { flushing = false; }
}

/* ---------------- push: diff local state against what we last sent ---------------- */
const RECORD_SETS = ['expenses', 'bookings', 'cash'];

/* per-device preferences stay on the device — syncing them would let one
   person's theme or currency choice overwrite everyone else's */
const PERSONAL = ['theme','base','me','lastQuick','rate','rateAuto','rateLive','rateFetched','rateProvider',
                  'budgetView','myBudget'];   // whose money you are looking at, and your own cap — yours alone
const sharedSettings = st => {
  const out = Object.assign({}, st || {});
  PERSONAL.forEach(k => delete out[k]);
  return out;
};

function pushChanges(state) {
  if (!syncOn()) return;

  /* Snapshots are stored SERIALISED, never as references. Editing a record
     mutates the object in place, so a snapshot holding the same reference can
     never differ from it — that silently swallowed every edit after the first. */
  RECORD_SETS.forEach(kind => {
    const before = Sync.snap[kind] || new Map();
    const now = new Map();
    (state[kind] || []).forEach(x => {
      if (!x || !x.id) return;
      const ser = JSON.stringify(x);
      now.set(x.id, ser);
      if (ser !== before.get(x.id)) queue('PUT', `${kind}/${x.id}`, x);
    });
    before.forEach((_, id) => { if (!now.has(id)) queue('DELETE', `${kind}/${id}`); });
    Sync.snap[kind] = now;
  });

  const flat = {
    checklist: (state.checklist || []).reduce((a, i) => (a[i.id] = i, a), {}),
    settings: sharedSettings(state.settings),
    notes: state.notes || '',
    days: state.days || {},
    removed: state.removed || []
  };
  Object.entries(flat).forEach(([k, v]) => {
    const ser = JSON.stringify(v);
    if (ser !== Sync.snap[k]) { queue('PUT', k, v); Sync.snap[k] = ser; }
  });
}

/* seed the diff baseline without sending anything */
function primeSnapshot(state) {
  RECORD_SETS.forEach(kind => {
    Sync.snap[kind] = new Map((state[kind] || [])
      .filter(x => x && x.id).map(x => [x.id, JSON.stringify(x)]));
  });
  Sync.snap.checklist = JSON.stringify((state.checklist || []).reduce((a, i) => (a[i.id] = i, a), {}));
  Sync.snap.settings  = JSON.stringify(sharedSettings(state.settings));
  Sync.snap.notes     = JSON.stringify(state.notes || '');
  Sync.snap.days      = JSON.stringify(state.days || {});
  Sync.snap.removed   = JSON.stringify(state.removed || []);
}

/* Records with writes still queued. A pull must not overwrite these, or an
   edit made just before a reload is lost. */
function pendingIds() {
  const out = new Set();
  Sync.outbox.forEach(j => {
    const parts = String(j.path).split('/');
    if (parts.length === 2) out.add(parts[1]);
  });
  return out;
}

/* ---------------- pull + live stream ---------------- */
async function pullOnce() {
  if (!syncOn()) return null;
  const res = await fetch(await tripUrl(), { cache: 'no-store' });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch {}
    Sync.lastError = `${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`;
    throw new Error(Sync.lastError);
  }
  Sync.lastError = '';
  return await res.json();
}

/* a single plain request, so a phone can report what the database actually says */
async function testConnection() {
  const out = { signedIn: Boolean(window.TripAuth && window.TripAuth.signedIn()),
                email: window.TripAuth ? window.TripAuth.Auth.email : '',
                path: Sync.key, tokenPresent: false, status: 0, body: '' };
  try {
    const t = window.TripAuth ? await window.TripAuth.authToken() : '';
    out.tokenPresent = Boolean(t);
    const res = await fetch(await tripUrl('/settings/people'), { cache: 'no-store' });
    out.status = res.status;
    out.body = (await res.text()).slice(0, 120);

    /* reads working does not prove writes work — the rules validate them separately */
    const probe = await fetch(await tripUrl('/diagnostic'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at: new Date().toISOString(), by: out.email })
    });
    out.writeStatus = probe.status;
    out.writeBody = (await probe.text()).slice(0, 120);
    out.queued = Sync.outbox.length;
    out.lastError = Sync.lastError || 'none';
    const b = await fetch(await tripUrl('/bookings/hktblr1'), { cache: 'no-store' });
    out.sample = (await b.text()).slice(0, 200);
  } catch (e) { out.body = 'request failed: ' + e.message; }
  return out;
}

async function startStream() {
  if (!syncOn() || typeof EventSource === 'undefined') return;
  stopStream();
  setStatus('connecting');
  /* EventSource sends Accept: text/event-stream on its own, which is what
     switches the Firebase REST endpoint into streaming mode */
  const es = new EventSource(await tripUrl());
  Sync.stream = es;

  const apply = e => {
    try {
      const msg = JSON.parse(e.data || 'null');
      if (!msg) return;
      setStatus('live');
      Sync.onRemote(msg.path, msg.data, e.type);
    } catch (err) { console.warn('[sync] bad event', err); }
  };
  es.addEventListener('put', apply);
  es.addEventListener('patch', apply);
  es.addEventListener('keep-alive', () => setStatus('live'));
  es.addEventListener('cancel', () => { setStatus('error'); stopStream(); });
  es.onopen = () => setStatus('live');
  es.onerror = () => {
    setStatus('offline');
    /* EventSource retries on its own; nudge the outbox when we return */
    setTimeout(flush, 5000);
  };
}
function stopStream() {
  if (Sync.stream) { Sync.stream.close(); Sync.stream = null; }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flush(); startStream(); });
  window.addEventListener('offline', () => setStatus('offline'));
  window.TripSync = {
    Sync, syncOn, loadOutbox,
    pushChanges, primeSnapshot, pullOnce, startStream, stopStream, flush,
    hasSynced, markSynced, testConnection, pendingIds
  };
}
