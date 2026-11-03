/* Picking a person in Expenses.
 *
 * The bug this pins down: the filter matched on `payer`, so choosing yourself
 * showed only what you had fronted. Every group expense somebody else paid for
 * — which is most of them — vanished, and nothing anywhere told you what your
 * share of one was.
 *
 * Mirrored from app.js, with a guard below that fails if the real ones move. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../app.js', 'utf8');
['function shareOf(', 'function myShare(', 'sharers(e).includes(pf)', 'filteredShare', 'filteredPaid']
  .forEach(sig => {
    if (!src.includes(sig)) {
      console.log(`  FAIL app.js no longer contains "${sig}" — update this test`);
      process.exit(1);
    }
  });

const people = ['Bhavesh','Anusheel','Akshat','Balgovind','Ashray'];
const sharers = e =>
  e.split === 'personal' ? [e.payer]
  : e.split === 'custom' ? ((e.with || []).filter(p => people.includes(p)).length
      ? e.with.filter(p => people.includes(p)) : [e.payer])
  : people.slice();
const shareOf = (e, who) => sharers(e).includes(who) ? e.amount / (sharers(e).length || 1) : 0;
const involves = (e, who) => e.payer === who || sharers(e).includes(who);

let ok = true;
const check = (label, got, want) => {
  const pass = typeof want === 'number' ? Math.abs(got - want) < 0.01
             : JSON.stringify(got) === JSON.stringify(want);
  if (!pass) ok = false;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${JSON.stringify(got)}${
    pass ? '' : '  expected ' + JSON.stringify(want)}`);
};

/* The case from the report: one thing Bhavesh booked, and group spending he
   is on but did not pay for. */
const rows = [
  { id:'a', note:'Phi Phi speedboat', amount:12000, payer:'Bhavesh', split:'shared'  },
  { id:'b', note:'Airbnb Bangkok',    amount:32000, payer:'Akshat',  split:'shared'  },
  { id:'c', note:'Dinner',            amount: 1500, payer:'Ashray',  split:'custom', with:['Ashray','Akshat'] },
  { id:'d', note:'His own flight',    amount:16726, payer:'Bhavesh', split:'personal' },
  { id:'e', note:'Massage',           amount:  900, payer:'Akshat',  split:'custom', with:['Bhavesh','Akshat'] }
];

const mine = rows.filter(e => involves(e, 'Bhavesh'));
console.log('\nWhat the filter returns');
check('every row Bhavesh is on, not just his own', mine.map(e => e.id), ['a','b','d','e']);
check("a dinner he is not on stays out",  mine.some(e => e.id === 'c'), false);
check('the old payer-only filter saw just two', rows.filter(e => e.payer === 'Bhavesh').map(e => e.id), ['a','d']);

console.log('\nThe numbers on screen');
const share = mine.reduce((s,e) => s + shareOf(e,'Bhavesh'), 0);
const paid  = mine.reduce((s,e) => s + (e.payer === 'Bhavesh' ? e.amount : 0), 0);
check('his share', share, 12000/5 + 32000/5 + 16726 + 900/2);
check('what he actually paid out', paid, 12000 + 16726);
check('so he is ahead by the difference', paid - share, 2750);
check('a group thing he booked is not all his', shareOf(rows[0], 'Bhavesh'), 2400);
check('his own flight is entirely his',          shareOf(rows[3], 'Bhavesh'), 16726);
check('a two-way split halves',                  shareOf(rows[4], 'Bhavesh'), 450);

console.log('\nPaid for, but not on');
/* He fronts a dinner he is not eating. It must still show — he is owed for it
   — but his share of it is nothing. */
const notOn = { id:'f', amount:800, payer:'Bhavesh', split:'custom', with:['Akshat','Ashray'] };
check('it appears in his list',  involves(notOn, 'Bhavesh'), true);
check('with no share against it', shareOf(notOn, 'Bhavesh'), 0);

console.log('\nShares still reconcile');
check('everyone’s shares sum to the full bill',
      people.reduce((s,p) => s + rows.reduce((t,e) => t + shareOf(e,p), 0), 0),
      rows.reduce((s,e) => s + e.amount, 0));

console.log('\n' + (ok ? '  PASS' : '  FAIL') + '\n');
process.exit(ok ? 0 : 1);
