/* The money totals must not move when booking costs replace their mirror rows. */
const A = { people:['Bhavesh','Anusheel','Akshat','Balgovind','Ashray'] };

const before = [                                   // 5 hand-made mirror expenses
  {amount:32000,cur:'INR',payer:'Akshat',   split:'shared'},
  {amount:41000,cur:'INR',payer:'Anusheel', split:'shared'},
  {amount:25000,cur:'INR',payer:'Bhavesh',  split:'shared'},
  {amount:10000,cur:'INR',payer:'Akshat',   split:'shared'},
  {amount:16726,cur:'INR',payer:'Bhavesh',  split:'personal'}
];
const after = [                                    // same money, now from bookings
  {cost:32000,cur:'INR',paidBy:'Akshat',   split:'shared',   status:'paid'},
  {cost:41000,cur:'INR',paidBy:'Anusheel', split:'shared',   status:'paid'},
  {cost:25000,cur:'INR',paidBy:'Bhavesh',  split:'shared',   status:'paid'},
  {cost:10000,cur:'INR',paidBy:'Akshat',   split:'shared',   status:'pending'},
  {cost:16726,cur:'INR',paidBy:'Bhavesh',  split:'personal', status:'paid'}
];

function totals(entries) {
  const cost={}, paid={};
  A.people.forEach(p => { cost[p]=0; paid[p]=0; });
  entries.forEach(e => {
    const on = e.split === 'personal' ? [e.payer] : A.people;
    paid[e.payer] += e.amount;
    on.forEach(p => cost[p] += e.amount / on.length);
  });
  return { cost, paid };
}
const t1 = totals(before);
const t2 = totals(after.map(b => ({ amount:b.cost, payer:b.paidBy, split:b.split })));

let ok = true;
A.people.forEach(p => {
  const c = Math.round(t1.cost[p]) === Math.round(t2.cost[p]);
  const d = Math.round(t1.paid[p]) === Math.round(t2.paid[p]);
  if (!c || !d) ok = false;
  console.log(`  ${p.padEnd(10)} cost ₹${Math.round(t1.cost[p])} → ₹${Math.round(t2.cost[p])}  ${c&&d?'same':'CHANGED'}`);
});
const sum = o => Object.values(o).reduce((a,b)=>a+b,0);
console.log(`  trip total ₹${Math.round(sum(t1.cost))} → ₹${Math.round(sum(t2.cost))}`);
console.log(ok ? '  PASS — nobody\'s position changes' : '  FAIL');
process.exit(ok ? 0 : 1);
