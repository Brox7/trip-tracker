/* Demo mode must never be able to touch a real trip.
 *
 * Three independent guards do that, and any one of them going missing is a
 * quiet, expensive bug: sample data pushed into a live shared database. This
 * test reads app.js and fails if a guard is gone, so removing one is loud.
 *
 * It also checks the sample data itself is coherent — a demo whose numbers do
 * not add up teaches a reader the wrong thing about the app. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../app.js', 'utf8');

let ok = true;
const check = (label, cond, detail) => {
  if (!cond) ok = false;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond || !detail ? '' : '  — ' + detail}`);
};

console.log('\nThe three guards');
check('demo uses its own storage key',
      /const KEY = DEMO \? 'th-trip-demo' : 'th-trip-v1'/.test(src),
      'demo would share localStorage with the real trip');
check('save() refuses to push in demo mode',
      /function save\(\)[\s\S]{0,220}?if \(DEMO\) return;/.test(src),
      'demo edits could reach the live database');
check('sync is never started in demo mode',
      /if \(TS && !DEMO\) \{[^}]*syncStart\(\)/.test(src),
      'the sync engine would come up against the real trip');

console.log('\nThe gate');
check('demo skips the sign-in gate', /function applyGate\(\)[\s\S]{0,160}?if \(DEMO\)/.test(src));
check('?nodemo can turn it off',     /q\.has\('nodemo'\)/.test(src));
check('demo state persists a reload', /localStorage\.setItem\('th-trip-demo-on'/.test(src));

console.log('\nThe sample data');
const block = src.slice(src.indexOf('function demoTrip()'), src.indexOf('function load()'));
check('demoTrip exists', block.length > 100);

const people = (block.match(/people: \[([^\]]+)\]/) || [,''])[1]
  .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
check('has a cast of travellers', people.length >= 3, `found ${people.length}`);

const named = [...block.matchAll(/(?:payer|paidBy|bookedBy):\s*'([^']+)'/g)].map(m => m[1]);
const strangers = [...new Set(named)].filter(n => !people.includes(n));
check('nobody pays who is not on the trip', strangers.length === 0, strangers.join(', '));

const withLists = [...block.matchAll(/with:\s*\[([^\]]+)\]/g)]
  .flatMap(m => m[1].split(',').map(s => s.trim().replace(/'/g, '')));
const ghosts = [...new Set(withLists)].filter(n => !people.includes(n));
check('custom splits only name real travellers', ghosts.length === 0, ghosts.join(', '));

/* a booking only counts as spend with cost > 0, a status off "hold", and a payer */
const bookings = [...block.matchAll(/\{ id:'demo\d+', type:'[^']+'[\s\S]*?\}/g)].map(m => m[0]);
const spendable = bookings.filter(b => /status:'(paid|pending)'/.test(b) && /cost:\s*[1-9]/.test(b));
check('every booking with a cost has a payer',
      spendable.every(b => /paidBy:/.test(b)),
      'a costed booking without paidBy is silently excluded from the ledger');
check('the demo shows an unbooked idea too',
      bookings.some(b => /status:'hold'/.test(b)));
check('both currencies appear', /cur:'THB'/.test(block) && /cur:'INR'/.test(block));
check('all three split kinds appear',
      /split:'shared'/.test(block) && /split:'personal'/.test(block) && /split:'custom'/.test(block));

console.log('\n' + (ok ? '  PASS' : '  FAIL') + '\n');
process.exit(ok ? 0 : 1);
