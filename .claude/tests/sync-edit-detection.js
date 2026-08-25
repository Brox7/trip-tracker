global.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
global.window={TRIP_DB:'https://x',TRIP_PATH:'p',addEventListener(){},
  TripAuth:{signedIn:()=>true,authToken:async()=>'t'}};
global.navigator={onLine:false};        // keep writes queued so we can count them
global.fetch=async()=>({ok:true,json:async()=>({}),text:async()=>''});
const T=require(__dirname+'/../../firebase-sync.js')||global.window.TripSync;
const S={expenses:[],cash:[],checklist:[],settings:{people:['A']},notes:'',days:{},removed:[],
  bookings:[{id:'b1',type:'flight',title:'HKT → BLR',cost:0}]};
const Sync=global.window.TripSync;
Sync.primeSnapshot(S);
const q=()=>Sync.Sync.outbox.filter(j=>j.path==='bookings/b1').length;
S.bookings[0].cost=15126; Sync.pushChanges(S);
const first=q();
S.bookings[0].cost=99999; Sync.pushChanges(S);
const second=q();
S.bookings[0].notes='changed again'; Sync.pushChanges(S);
console.log('  edit #1 queued a write:', first>0);
console.log('  edit #2 still queued after #1:', second>0 && Sync.Sync.outbox.find(j=>j.path==='bookings/b1').body.cost===99999);
console.log('  final queued cost:', Sync.Sync.outbox.find(j=>j.path==='bookings/b1')?.body.cost);
console.log('  EXPECTED final cost: 99999 with notes "changed again"');
console.log('  actual notes:', Sync.Sync.outbox.find(j=>j.path==='bookings/b1')?.body.notes);

// Regression guard: repeated in-place edits must each queue a write.
// This is the bug where only the first edit after a page load ever synced.
