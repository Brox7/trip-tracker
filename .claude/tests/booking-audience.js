/* Turning the free-text "who" field into a real list of people. */
const people = ['Bhavesh','Anusheel','Akshat','Balgovind','Ashray'];

function parseWho(who, all) {
  const t = String(who || '').trim();
  if (!t) return all.slice();
  if (/\ball\b|everyone|all five/i.test(t)) return all.slice();
  const hit = all.filter(p => new RegExp('\\b' + p + '\\b', 'i').test(t));
  return hit.length ? hit : all.slice();
}

const cases = [
  ['All five',                        5],
  ['Bhavesh, Balgovind, Ashray',      3],
  ['Akshat',                          1],
  ['Anusheel',                        1],
  ['',                                5],
  [undefined,                         5],
  ['Everyone',                        5]
];
let ok = true;
cases.forEach(([input, expect]) => {
  const got = parseWho(input, people);
  const pass = got.length === expect;
  if (!pass) ok = false;
  console.log(`  ${String(input).padEnd(28)} → ${got.length} people ${pass ? '' : 'EXPECTED ' + expect}`);
});
console.log(ok ? '  PASS' : '  FAIL');
process.exit(ok ? 0 : 1);
