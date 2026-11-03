/* Day plans: the editor's text round-trip, and per-day syncing.
 *
 * The sync half is the point. Day plans used to ride in one `days` blob, so two
 * people editing two different days in the same sync window meant the later
 * write silently erased the earlier one. These tests drive the REAL module.
 *
 * The parsing half is mirrored from app.js (which cannot be required in node),
 * with a guard below that fails if either function is renamed there. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../app.js', 'utf8');
['function textToPlanLines(', 'const planToText', 'function editDay(', 'data-edit-day']
  .forEach(sig => {
    if (!src.includes(sig)) {
      console.log(`  FAIL app.js no longer contains "${sig}" — update this test`);
      process.exit(1);
    }
  });

let ok = true;
const check = (label, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) ok = false;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${JSON.stringify(got)}${
    pass ? '' : '\n       expected ' + JSON.stringify(want)}`);
};

/* ---------------- the editor's text format ---------------- */
const LABEL_MAX = 20;
const planToText = p => ((p && p.lines) || []).map(([k, v]) => k ? `${k}: ${v}` : v).join('\n');
function textToPlanLines(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.search(/:(?!\d)/);
    return (i < 0 || i > LABEL_MAX) ? ['', l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
}

console.log('\nLabel: detail parsing');
check('a plain pair', textToPlanLines('Morning: ferry to Krabi'), [['Morning', 'ferry to Krabi']]);
check('a time in the detail is left alone',
      textToPlanLines('Morning: ferry at 9:30'), [['Morning', 'ferry at 9:30']]);
check('a bare time is not mistaken for a label',
      textToPlanLines('9:30 ferry to Krabi'), [['', '9:30 ferry to Krabi']]);
check('a line with no label at all', textToPlanLines('Free day'), [['', 'Free day']]);
check('blank lines are dropped', textToPlanLines('A: one\n\n  \nB: two'),
      [['A', 'one'], ['B', 'two']]);
check('prose with a colon stays one value',
      textToPlanLines('Remember the thing we discussed: bring cash'),
      [['', 'Remember the thing we discussed: bring cash']]);
check('a 20-character label still splits',
      textToPlanLines('Afternoon and nights: Ao Nang'), [['Afternoon and nights', 'Ao Nang']]);
check('a 21-character one is prose',
      textToPlanLines('Afternoon and evening: Ao Nang'), [['', 'Afternoon and evening: Ao Nang']]);

console.log('\nRound trip');
const plan = { title: 'Samui → Krabi',
               lines: [['Morning', 'ferry at 9:30'], ['Evening', 'Ao Nang'], ['', 'Free day']] };
check('text survives a trip through the editor',
      textToPlanLines(planToText(plan)), plan.lines);

/* ---------------- per-day syncing, against the real module ---------------- */
global.localStorage = { _d:{}, getItem(k){return this._d[k]||null},
  setItem(k,v){this._d[k]=v}, removeItem(k){delete this._d[k]} };
global.window = { TRIP_DB:'https://x', TRIP_PATH:'p', addEventListener(){},
  TripAuth:{ signedIn:()=>true, authToken:async()=>'t' } };
global.navigator = { onLine:false };          // keep writes queued so we can count them
global.fetch = async () => ({ ok:true, json:async()=>({}), text:async()=>'' });
require(__dirname + '/../../firebase-sync.js');
const TS = global.window.TripSync;

const d14 = { title:'Arrive Bangkok', lines:[['Evening','Khao San']] };
const d17 = { title:'Fly to Samui',   lines:[['11:05','BKK → USM']] };
const S = { expenses:[], bookings:[], cash:[], checklist:[], settings:{people:['A']},
            notes:'', removed:[], days:{ '2026-11-14':d14, '2026-11-17':d17 } };
TS.primeSnapshot(S);
const paths = () => TS.Sync.outbox.map(j => `${j.method} ${j.path}`);

console.log('\nPer-day writes');
TS.Sync.outbox.length = 0;
S.days['2026-11-17'] = { title:'Fly to Samui', lines:[['11:05','BKK → USM']], edited:'2026-11-03T10:00:00Z' };
TS.pushChanges(S);
check('editing one day writes only that day', paths(), ['PUT days/2026-11-17']);
check('the whole blob is never written', paths().includes('PUT days'), false);

TS.Sync.outbox.length = 0;
S.days['2026-11-20'] = { title:'Ferry to Krabi', lines:[], edited:'2026-11-03T10:05:00Z' };
TS.pushChanges(S);
check('a new day is its own write', paths(), ['PUT days/2026-11-20']);

TS.Sync.outbox.length = 0;
delete S.days['2026-11-14'];
TS.pushChanges(S);
check('clearing a day deletes just that key', paths(), ['DELETE days/2026-11-14']);

TS.Sync.outbox.length = 0;
TS.pushChanges(S);
check('an unchanged push writes nothing', paths(), []);

console.log('\nTwo people, two days, one window');
/* Exactly the case the blob lost: each device pushes only the day it touched,
   so neither write carries the other's day and neither can clobber it. */
TS.Sync.outbox.length = 0;
const base = { '2026-11-17': d17, '2026-11-20': { title:'Ferry', lines:[] } };
const mine = { ...base, '2026-11-17': { ...d17, title:'Fly to Samui (changed)', edited:'2026-11-03T11:00:00Z' } };
TS.primeSnapshot({ ...S, days: base });
TS.pushChanges({ ...S, days: mine });
check('my write touches only my day', paths(), ['PUT days/2026-11-17']);
check("and does not carry the other person's day",
      TS.Sync.outbox.every(j => !JSON.stringify(j.body).includes('Ferry')), true);

console.log('\nPending writes are addressable by kind');
TS.Sync.outbox.length = 0;
TS.primeSnapshot({ ...S, days: base });
TS.pushChanges({ ...S, days: mine });
check('pendingIds("days") sees the queued day', [...TS.pendingIds('days')], ['2026-11-17']);
check('pendingIds("bookings") does not',        [...TS.pendingIds('bookings')], []);
check('pendingIds() unfiltered still sees it',  TS.pendingIds().has('2026-11-17'), true);

console.log('\n' + (ok ? '  PASS' : '  FAIL') + '\n');
process.exit(ok ? 0 : 1);
