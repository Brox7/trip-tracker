/* The PDF parser, run against the text layer that pdf.js produces for the
   kinds of documents this trip actually generates. Loads the real module —
   not a copy — so a regression here is a regression in the app. */
const T = require('../../pdf-import.js');

const CLEARTRIP = `
Cleartrip
E-Ticket / Tax Invoice
Booking ID: CT7739201884
IndiGo 6E 1051
Bengaluru (BLR) 09:20 Sat, 14 Nov 2026
Kempegowda International Airport, Terminal 2
Bangkok (BKK) 14:50 Sat, 14 Nov 2026
Suvarnabhumi Airport
Passenger Bhavesh Agarwal Adult
Base fare INR 12,400
Taxes and fees INR 2,726
Total amount paid INR 15,126
`;

const AIRBNB = `
Airbnb
Your reservation is confirmed
Kata Beach Sunset Villa
Phuket, Thailand
Check-in Mon, 23 Nov 2026 15:00
Checkout Tue, 24 Nov 2026 11:00
2 guests
₹8,400 x 1 night ₹8,400
Cleaning fee ₹1,200
Service fee ₹980
Total (INR) ₹10,580
`;

const KLOOK = `
Klook
Booking confirmed
Phi Phi Islands Speedboat Tour with Maya Bay
Ao Nang, Krabi
Activity date 21 Nov 2026, 08:00
Pickup from hotel lobby
Unit price THB 1,650 x 5
Total THB 8,250
Paid by Visa card ending 4471
`;

const GRAB = `
Grab
Receipt
23 Nov 2026
Patong Beach to Phuket International Airport
Fare THB 720
Platform fee THB 30
Total THB 750
Paid with GrabPay Wallet
`;

const FERRY = `
Lomprayah High Speed Catamaran
Koh Samui to Krabi
Departure 20/11/2026 08:00
Arrival 20/11/2026 14:30
2 passengers
Total 3,600 THB
`;

let ok = true;
const check = (label, got, want) => {
  const pass = String(got) === String(want);
  if (!pass) ok = false;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${JSON.stringify(got)}${pass ? '' : '  expected ' + JSON.stringify(want)}`);
};

console.log('\nCleartrip e-ticket → booking');
{
  const b = T.toBooking(T.parse(CLEARTRIP, { year: 2026 }));
  check('type',        b.type,   'flight');
  check('vendor',      b.vendor, 'Cleartrip');
  check('title',       b.title,  'BLR → BKK · 6E 1051');
  check('from',        b.from,   'BLR');
  check('to',          b.to,     'BKK');
  check('city',        b.city,   'Bangkok');
  check('departs',     b.start,  '2026-11-14T09:20');
  check('arrives',     b.end,    '2026-11-14T14:50');
  check('cost',        b.cost,   15126);
  check('currency',    b.cur,    'INR');
  check('no PNR kept', 'conf' in b, false);
}

console.log('\nAirbnb reservation → booking');
{
  const b = T.toBooking(T.parse(AIRBNB, { year: 2026 }));
  check('type',      b.type,   'hotel');
  check('vendor',    b.vendor, 'Airbnb');
  check('title',     b.title,  'Kata Beach Sunset Villa');
  check('check-in',  b.start,  '2026-11-23T15:00');
  check('check-out', b.end,    '2026-11-24T11:00');
  check('cost',      b.cost,   10580);
  check('currency',  b.cur,    'INR');
}

console.log('\nKlook activity → booking');
{
  const b = T.toBooking(T.parse(KLOOK, { year: 2026 }));
  check('type',     b.type,   'activity');
  check('vendor',   b.vendor, 'Klook');
  check('starts',   b.start,  '2026-11-21T08:00');
  check('cost',     b.cost,   8250);
  check('currency', b.cur,    'THB');
}

console.log('\nFerry → booking');
{
  const b = T.toBooking(T.parse(FERRY, { year: 2026 }));
  check('type',     b.type,  'transport');
  check('departs',  b.start, '2026-11-20T08:00');
  check('arrives',  b.end,   '2026-11-20T14:30');
  check('cost',     b.cost,  3600);
  check('currency', b.cur,   'THB');
}

console.log('\nGrab receipt → expense');
{
  const e = T.toExpense(T.parse(GRAB, { year: 2026 }));
  check('date',     e.date,   '2026-11-23');
  check('amount',   e.amount, 750);
  check('currency', e.cur,    'THB');
  check('category', e.cat,    'Transport');
  check('method',   e.method, 'UPI/Wallet');
}

console.log('\nEdge cases');
{
  check('DD/MM over MM/DD',   T.datesIn('20/11/2026', 2026)[0].iso, '2026-11-20');
  check('MM/DD when day > 12',T.datesIn('11/20/2026', 2026)[0].iso, '2026-11-20');
  check('two-digit year',     T.datesIn('14 Nov 26', 2026)[0].iso,  '2026-11-14');
  check('bare day uses trip year', T.datesIn('14 Nov', 2026)[0].iso, '2026-11-14');
  check('price is not a time', T.timesIn('THB 1,650.00').length,     0);
  check('pm becomes 24h',      T.timesIn('3:40 pm')[0].time,         '15:40');
  check('midnight',            T.timesIn('12:05 am')[0].time,        '00:05');
  check('total beats base fare',
        T.pickTotal(['Base fare INR 12,400', 'Total amount paid INR 15,126']).value, 15126);
  check('per-person line loses',
        T.pickTotal(['Per person ₹21,600', 'Total ₹1,08,000']).value, 108000);
  check('total incl. taxes still wins',
        T.pickTotal(['Taxes ₹2,726', 'Total (incl. taxes) ₹15,126']).value, 15126);
  check('no text at all',      T.parse('').found.length, 0);
  check('junk does not throw', T.toBooking(T.parse('...')).type, 'other');
}

console.log('\n' + (ok ? '  PASS' : '  FAIL') + '\n');
process.exit(ok ? 0 : 1);
