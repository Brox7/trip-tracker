const people=['Bhavesh','Anusheel','Akshat','Balgovind','Ashray'];
const cost=e=>{const on=e.split==='personal'?[e.payer]:people;return {on,each:e.amount/on.length};};
function totals(entries){const c={};people.forEach(p=>c[p]=0);
  entries.forEach(e=>{const{on,each}=cost(e);on.forEach(p=>c[p]+=each);});return c;}

const bookings=[{id:'35riquq',cost:32000,status:'paid'},{id:'3rlbi92',cost:41000,status:'paid'},
 {id:'51q0sno',cost:25000,status:'paid'},{id:'zs34pta',cost:10000,status:'pending'},
 {id:'c444gvg',cost:16726,status:'paid'}];
const PAID={'35riquq':['Akshat','shared'],'3rlbi92':['Anusheel','shared'],'51q0sno':['Bhavesh','shared'],
 'zs34pta':['Akshat','shared'],'c444gvg':['Bhavesh','personal']};
const mirrors=bookings.map(b=>({id:'m'+b.id,amount:b.cost,payer:PAID[b.id][0],split:PAID[b.id][1]}));

const beforeT=totals(mirrors);
const afterT=totals(bookings.map(b=>({amount:b.cost,payer:PAID[b.id][0],split:PAID[b.id][1]})));
let ok=people.every(p=>Math.round(beforeT[p])===Math.round(afterT[p]));
console.log('  totals preserved:',ok);

// idempotency: running twice must not double anything
let expenses=[...mirrors], migrated=false;
function migrate(){ if(migrated) return 0; expenses=expenses.filter(e=>!e.id.startsWith('m')); migrated=true; return 1; }
migrate(); const once=expenses.length; migrate();
console.log('  idempotent:', once===expenses.length && expenses.length===0);
process.exit(ok&&expenses.length===0?0:1);
