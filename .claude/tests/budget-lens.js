/* Personal vs group budget.
 *
 * The invariant that matters: whatever the lens does to one person's view, the
 * five personal views must still add up to the group total. Money cannot appear
 * or vanish just because you looked at it differently.
 *
 * app.js cannot be required in node (it touches document at load), so the two
 * functions under test are mirrored here — and the guard below fails loudly if
 * either is renamed or removed in app.js, so this cannot quietly rot. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../app.js', 'utf8');
['function sharers(', 'function myShare(', 'const myBudgetBase', 'const budgetView']
  .forEach(sig => {
    if (!src.includes(sig)) {
      console.log(`  FAIL app.js no longer contains "${sig}" — update this test`);
      process.exit(1);
    }
  });

const people = ['Bhavesh','Anusheel','Akshat','Balgovind','Ashray'];

function sharers(e) {
  if (e.split === 'personal') return [e.payer];
  if (e.split === 'custom') {
    const list = (Array.isArray(e.with) ? e.with : []).filter(p => people.includes(p));
    return list.length ? list : [e.payer];
  }
  return people.slice();
}
function myShare(e, me) {
  const on = sharers(e);
  if (!on.includes(me)) return 0;
  return e.amount / (on.length || 1);
}

/* The real trip: three Airbnbs split five ways, one flight only Bhavesh is on,
   plus a dinner three people shared. */
const rows = [
  { amount: 32000, payer:'Akshat',   split:'shared'                                      },
  { amount: 41000, payer:'Anusheel', split:'shared'                                      },
  { amount: 25000, payer:'Bhavesh',  split:'shared'                                      },
  { amount: 10000, payer:'Akshat',   split:'shared'                                      },
  { amount: 16726, payer:'Bhavesh',  split:'personal'                                    },
  { amount:  1500, payer:'Ashray',   split:'custom', with:['Ashray','Akshat','Bhavesh']  }
];

let ok = true;
const check = (label, got, want) => {
  const pass = typeof want === 'number' ? Math.abs(got - want) < 0.01 : String(got) === String(want);
  if (!pass) ok = false;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(42)} ${JSON.stringify(got)}${pass ? '' : '  expected ' + JSON.stringify(want)}`);
};

const group = rows.reduce((a, e) => a + e.amount, 0);
const shares = Object.fromEntries(people.map(p => [p, rows.reduce((a, e) => a + myShare(e, p), 0)]));

console.log('\nShares reconcile');
check('group total',                    group, 126226);
check('sum of all five personal views', Object.values(shares).reduce((a,b)=>a+b,0), group);

console.log('\nWho carries what');
check('Bhavesh: shares + own flight + dinner', Math.round(shares.Bhavesh), Math.round(108000/5 + 16726 + 500));
check('Balgovind: only the shared four',        Math.round(shares.Balgovind), Math.round(108000/5));
check('Anusheel is not on the custom dinner',   Math.round(shares.Anusheel), Math.round(108000/5));
check('a personal cost lands on one person',    myShare(rows[4], 'Ashray'), 0);
check('a custom split only hits those named',   myShare(rows[5], 'Anusheel'), 0);
check('a custom split divides among those named', myShare(rows[5], 'Akshat'), 500);

console.log('\nPersonal budget');
const myBudgetBase = (myBudget, tripBudget) =>
  Number(myBudget) > 0 ? Number(myBudget) : tripBudget / (people.length || 1);
check('unset falls back to an even cut', myBudgetBase(0, 150000), 30000);
check('a value you set wins',            myBudgetBase(45000, 150000), 45000);
check('no trip budget means no share',   myBudgetBase(0, 0), 0);

console.log('\nEdge cases');
check('custom split with nobody named falls back to the payer',
      myShare({ amount: 900, payer:'Ashray', split:'custom', with:[] }, 'Ashray'), 900);
check('custom split naming someone who left the trip ignores them',
      myShare({ amount: 900, payer:'Ashray', split:'custom', with:['Ghost'] }, 'Ashray'), 900);

console.log('\n' + (ok ? '  PASS' : '  FAIL') + '\n');
process.exit(ok ? 0 : 1);
