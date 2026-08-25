/* =========================================================
   Read a booking or receipt PDF and fill the form from it.

   Two rules shape this file.

   1. The PDF never leaves the phone and is never stored. It is read into
      memory, the text is pulled out, and the file is dropped on the floor.
      Nothing here writes to S, and firebase-sync.js only ever uploads the
      expenses / bookings / cash records — so there is no path by which a
      document reaches the database. That is structural, not a promise.

   2. Nothing saves itself. Everything lands in the normal form, prefilled,
      for a human to confirm. This app has lost data to a silent write once
      already; a parser guessing wrong should cost a glance, not a row.

   The parsing half is pure — no DOM, no globals — so the tests in
   .claude/tests/ exercise the real code rather than a copy of it.
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TripImport = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
'use strict';

/* A confirmation number is the one field deliberately left blank. You asked to
   strip PNRs and anything sensitive, and an e-ticket is full of them — helpfully
   typing one back in would quietly undo that decision. Flip this to true only if
   you change your mind about storing them. */
const PICK_CONF = false;

/* ========================= small text helpers ========================= */

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                 jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

const toLines = text => String(text || '')
  .split(/\r?\n/)
  .map(l => l.replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/* Two-digit years: an e-ticket saying "26" means 2026, never 1926. */
const fullYear = y => {
  const n = Number(y);
  if (!n) return null;
  return n < 100 ? 2000 + n : n;
};

const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;

/* ========================= dates and times ========================= */

/* Every date shape these vendors actually emit. Order matters: ISO and
   "14 Nov 2026" are unambiguous, so they get first refusal on a line. */
function datesIn(line, defYear) {
  const out = [];
  const push = (y, m, d, at) => { if (validDay(y, m, d)) out.push({ iso: iso(y, m, d), at }); };
  let m;

  const reISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = reISO.exec(line))) push(+m[1], +m[2], +m[3], m.index);

  const reDMY = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s.,-]*' + MON + '[\\s.,\'-]*(\\d{2,4})?', 'gi');
  while ((m = reDMY.exec(line)))
    push(fullYear(m[3]) || defYear, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], m.index);

  /* (?!\d) matters more than it looks: without it "Nov 2026" reads as
     month Nov, day 20, and every arrival time lands on the wrong day. */
  const reMDY = new RegExp('\\b' + MON + '[\\s.,-]*(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?[\\s.,\'-]*(\\d{2,4})?', 'gi');
  while ((m = reMDY.exec(line)))
    push(fullYear(m[3]) || defYear, MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], m.index);

  /* 14/11/2026. Indian and Thai vendors write day first, so that is the
     assumption — unless the first number is over 12, which settles it. */
  const reNUM = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g;
  while ((m = reNUM.exec(line))) {
    const a = +m[1], b = +m[2], y = fullYear(m[3]);
    if (b > 12 && a <= 12) push(y, a, b, m.index);
    else push(y, b, a, m.index);
  }

  /* Same date found by two patterns is one date. Keep the earliest position. */
  const seen = new Map();
  out.sort((x, y) => x.at - y.at).forEach(d => { if (!seen.has(d.iso)) seen.set(d.iso, d); });
  return [...seen.values()];
}

function timesIn(line) {
  const out = [];
  const re = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?/gi;
  let m;
  while ((m = re.exec(line))) {
    let h = +m[1];
    const mer = (m[3] || '').replace(/[.\s]/g, '').toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    /* A bare "2.30" inside a price is not a time; require a colon or a meridiem. */
    if (!mer && line[m.index + m[1].length] !== ':') continue;
    out.push({ time: `${pad(h)}:${m[2]}`, at: m.index });
  }
  return out;
}

/* Walk the document line by line, pairing each date with the time sitting
   next to it. E-tickets lay out one leg per row, which is exactly this shape. */
function whenIn(lines, defYear) {
  const out = [];
  lines.forEach((line, i) => {
    const ds = datesIn(line, defYear);
    if (!ds.length) return;
    const ts = timesIn(line);
    ds.forEach(d => {
      const near = ts.filter(t => t.at > d.at).sort((a, b) => a.at - b.at)[0] || ts[0];
      out.push({ iso: d.iso, time: near ? near.time : null, line, lineIdx: i });
    });
  });
  return out;
}

const stamp = w => w ? (w.iso + 'T' + (w.time || '09:00')) : '';

/* ========================= money ========================= */

const CUR_OF = s => /฿|thb|baht/i.test(s) ? 'THB' : 'INR';

function amountsIn(line) {
  const out = [];
  const num = t => Number(String(t).replace(/,/g, ''));
  let m;

  const before = /(₹|Rs\.?|INR|฿|THB|Baht)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  while ((m = before.exec(line))) out.push({ cur: CUR_OF(m[1]), value: num(m[2]), at: m.index });

  const after = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(₹|INR|฿|THB|Baht)\b/gi;
  while ((m = after.exec(line))) out.push({ cur: CUR_OF(m[2]), value: num(m[1]), at: m.index });

  return out.filter(a => a.value > 0 && a.value < 100000000);
}

/* Which of the fifteen numbers on a receipt is the one you actually paid.
   Scored rather than pattern-matched, because "Total" appears on the base
   fare line as often as on the line that matters. */
function pickTotal(lines) {
  let best = null;
  lines.forEach(line => {
    const found = amountsIn(line);
    if (!found.length) return;
    let score = 0;
    if (/grand total|total amount|amount payable|total payable|amount paid|you (?:paid|pay)|total price|total cost|net payable|total fare|order total/i.test(line)) score += 12;
    else if (/\btotal\b/i.test(line)) score += 7;
    if (/per (?:person|night|pax|adult|traveller|traveler|guest)|each\b|x\s*\d+\s*night/i.test(line)) score -= 9;
    /* Only penalise a component line if it is not itself a total —
       "Total (incl. taxes)" is the answer, not a distraction. */
    if (!/\btotal\b/i.test(line) &&
        /base fare|\btax(es)?\b|surcharge|convenience|discount|subtotal|service fee|cleaning fee|refund|due|balance/i.test(line)) score -= 7;
    found.forEach(a => {
      const cand = { ...a, score, line };
      if (!best || cand.score > best.score ||
         (cand.score === best.score && cand.value > best.value)) best = cand;
    });
  });
  return best;
}

/* ========================= flights ========================= */

const AIRPORTS = {
  BLR:'Bengaluru', BOM:'Mumbai', DEL:'Delhi', MAA:'Chennai', HYD:'Hyderabad',
  CCU:'Kolkata', COK:'Kochi', PNQ:'Pune', AMD:'Ahmedabad', GOI:'Goa', GOX:'Goa',
  JAI:'Jaipur', LKO:'Lucknow', TRV:'Thiruvananthapuram', IXC:'Chandigarh',
  BKK:'Bangkok', DMK:'Bangkok', HKT:'Phuket', USM:'Koh Samui', CNX:'Chiang Mai',
  KBV:'Krabi', UTP:'Pattaya', CEI:'Chiang Rai', HDY:'Hat Yai', URT:'Surat Thani',
  SIN:'Singapore', KUL:'Kuala Lumpur', CMB:'Colombo', DXB:'Dubai', AUH:'Abu Dhabi',
  DOH:'Doha', HKG:'Hong Kong', SGN:'Ho Chi Minh City', HAN:'Hanoi'
};

const AIRLINES = '6E|AI|IX|SG|UK|QP|G8|TG|FD|SL|WE|DD|PG|SQ|MH|UL|EK|EY|QR|CX|VJ|VZ|AK|D7';

function airportsIn(text) {
  const hits = [];
  const re = /\b([A-Z]{3})\b/g;
  let m;
  while ((m = re.exec(text))) if (AIRPORTS[m[1]]) hits.push({ code: m[1], at: m.index });
  const seen = new Set();
  return hits.filter(h => (seen.has(h.code) ? false : seen.add(h.code)));
}

function flightNoIn(text) {
  const m = new RegExp('\\b(' + AIRLINES + ')[\\s-]?(\\d{2,4})\\b').exec(text);
  return m ? `${m[1]} ${m[2]}` : '';
}

/* ========================= vendor and type ========================= */

const VENDORS = [
  [/cleartrip/i,                'Cleartrip'],
  [/makemytrip|\bmmt\b/i,       'MakeMyTrip'],
  [/goibibo/i,                  'Goibibo'],
  [/ixigo/i,                    'ixigo'],
  [/easemytrip/i,               'EaseMyTrip'],
  [/yatra/i,                    'Yatra'],
  [/airbnb/i,                   'Airbnb'],
  [/booking\.com/i,             'Booking.com'],
  [/agoda/i,                    'Agoda'],
  [/klook/i,                    'Klook'],
  [/getyourguide/i,             'GetYourGuide'],
  [/viator/i,                   'Viator'],
  [/\bgrab\b/i,                 'Grab'],
  [/indigo|\b6E\b/i,            'IndiGo'],
  [/air\s?india/i,              'Air India'],
  [/akasa/i,                    'Akasa Air'],
  [/spicejet/i,                 'SpiceJet'],
  [/vistara/i,                  'Vistara'],
  [/thai\s?airways/i,           'Thai Airways'],
  [/air\s?asia/i,               'AirAsia'],
  [/bangkok\s?airways/i,        'Bangkok Airways'],
  [/lomprayah|seatran|raja\s?ferry/i, 'Ferry operator']
];

function detectVendor(text) {
  for (const [re, name] of VENDORS) if (re.test(text)) return name;
  return '';
}

function guessType(text, vendor) {
  if (/\be-?ticket\b|boarding|\bpnr\b|passenger name record|flight\s*(no|number)|departure terminal/i.test(text)) return 'flight';
  if (/check[\s-]?in|check[\s-]?out|\bnights?\b|reservation at|your stay|property/i.test(text)) return 'hotel';
  /* Order is the whole trick here. "Phi Phi speedboat tour" is an activity you
     paid for, not a transfer you booked — so the activity words get asked
     first, and each list holds only words that actually settle it. */
  if (/\btours?\b|activity date|admission|entry ticket|\bexperience\b|snorkel|div(?:e|ing)|kayak|zipline|island hopping|day trip/i.test(text)) return 'activity';
  if (/\bferry\b|catamaran|speedboat|\btransfer\b|shuttle|\bvan\b|minibus|\btrain\b|\bbus\b|pick[\s-]?up point|\bpassengers?\b/i.test(text)) return 'transport';
  if (/airbnb|agoda|booking\.com/i.test(vendor + ' ' + text)) return 'hotel';
  if (/klook|getyourguide|viator/i.test(vendor)) return 'activity';
  return 'other';
}

const CAT_HINTS = [
  [/restaurant|cafe|coffee|food|dining|kitchen|pad thai|meal|lunch|dinner|breakfast/i, 'Food'],
  [/bar\b|beer|cocktail|drinks|pub\b/i,                     'Drinks'],
  [/hotel|resort|villa|hostel|airbnb|stay|accommodation/i,  'Stay'],
  [/taxi|grab|transfer|ferry|van\b|shuttle|train|bus\b|fuel|toll/i, 'Transport'],
  [/tour|activity|snorkel|div(?:e|ing)|kayak|admission|entry|ticket|park fee/i, 'Activities'],
  [/massage|spa\b|wellness/i,                               'Spa & Massage'],
  [/sim\b|esim|data pack|internet|mobile top/i,             'SIM/Internet'],
  [/visa|immigration|arrival card|tdac|insurance/i,         'Visa & Fees'],
  [/flight|airline|e-?ticket|airport/i,                     'Flights'],
  [/mall|shop|store|market|souvenir|7-?eleven|boots\b/i,    'Shopping']
];

function guessCat(text) {
  for (const [re, cat] of CAT_HINTS) if (re.test(text)) return cat;
  return 'Misc';
}

function guessMethod(text) {
  if (/upi|gpay|google pay|phonepe|paytm|wallet|promptpay|truemoney/i.test(text)) return 'UPI/Wallet';
  if (/forex card|prepaid card|travel card/i.test(text)) return 'Prepaid/Forex';
  if (/card ending|xxxx|visa\b|master\s?card|amex|debit card|credit card|\*{4}/i.test(text)) return 'Card';
  if (/\bcash\b/i.test(text)) return 'Cash';
  return '';
}

/* The name of the thing. A label, a date or a price is never the answer, so
   those lines are struck out and the most title-shaped survivor wins. */
function guessTitle(lines) {
  const junk = /^(?:tax invoice|invoice|receipt|e-?ticket|itinerary|booking (?:id|reference|confirmation)|confirmation|order|date|total|amount|gst|cgst|sgst|terms|thank you|page \d)/i;
  const scored = lines.slice(0, 20)
    .filter(l => l.length >= 4 && l.length <= 70)
    .filter(l => !junk.test(l))
    .filter(l => !/^https?:|@|^\+?\d[\d\s-]{6,}$/.test(l))
    .filter(l => /[A-Za-z]{3}/.test(l))
    .filter(l => !amountsIn(l).length)
    .filter(l => !datesIn(l, 2026).length)
    .map(l => {
      let s = 0;
      if (/^[A-Z][a-z]/.test(l)) s += 2;
      if ((l.match(/\b[A-Z][a-z]+/g) || []).length >= 2) s += 2;
      if (l.length > 12 && l.length < 45) s += 1;
      if (/^[A-Z\s]+$/.test(l)) s -= 1;
      return { l, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored.length ? scored[0].l : '';
}

/* ========================= the parse ========================= */

function parse(text, opts) {
  opts = opts || {};
  const lines   = toLines(text);
  const flat    = lines.join('\n');
  const defYear = opts.year || new Date().getFullYear();

  const vendor = detectVendor(flat);
  const type   = guessType(flat, vendor);
  const total  = pickTotal(lines);
  const when   = whenIn(lines, defYear);
  const ports  = type === 'flight' ? airportsIn(flat) : [];
  const flight = type === 'flight' ? flightNoIn(flat) : '';

  const found = [];
  if (total)        found.push('amount');
  if (when.length)  found.push('date');
  if (vendor)       found.push('vendor');
  if (ports.length >= 2) found.push('route');

  return { vendor, type, total, when, ports, flight, lines, text: flat, found,
           title: guessTitle(lines) };
}

/* A flight is the one case where the title writes itself. */
function titleFor(p) {
  if (p.type === 'flight' && p.ports.length >= 2)
    return `${p.ports[0].code} → ${p.ports[1].code}` + (p.flight ? ` · ${p.flight}` : '');
  if (p.title) return p.title;
  return p.vendor || '';
}

function toBooking(p) {
  const out = { type: p.type, status: 'paid' };
  const t = titleFor(p);
  if (t) out.title = t;
  if (p.vendor) out.vendor = p.vendor;
  if (p.when[0]) out.start = stamp(p.when[0]);
  if (p.when[1]) out.end   = stamp(p.when[1]);
  if (p.total)   { out.cost = p.total.value; out.cur = p.total.cur; }
  if (p.type === 'flight' && p.ports.length >= 2) {
    out.from = p.ports[0].code;
    out.to   = p.ports[1].code;
    out.city = AIRPORTS[p.ports[1].code] || '';
  }
  if (PICK_CONF) out.conf = '';
  return out;
}

function toExpense(p) {
  const out = {};
  if (p.when[0]) out.date = p.when[0].iso;
  if (p.total)   { out.amount = p.total.value; out.cur = p.total.cur; }
  out.cat  = guessCat(p.text);
  const m  = guessMethod(p.text);
  if (m) out.method = m;
  const note = [titleFor(p), p.vendor].filter(Boolean);
  if (note.length) out.note = note[0] === note[1] ? note[0] : note.join(' · ');
  return out;
}

const core = { parse, toBooking, toExpense, pickTotal, datesIn, timesIn, whenIn,
               amountsIn, detectVendor, guessType, guessCat, guessMethod,
               guessTitle, toLines, AIRPORTS };

/* ========================= reading the file ========================= */
/* Everything below needs a browser. In node the parsing core stands alone. */

if (typeof document === 'undefined') return core;

/* pdf.js is pinned by its own version rather than the build time, so a deploy
   does not make every phone re-download 1.5 MB of library that did not change. */
const PDFJS = '3.11.174';
const vq = '?v=' + PDFJS;

let loading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdf.min.js' + vq;
    s.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) return reject(new Error('the PDF reader did not start'));
      lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js' + vq;
      resolve(lib);
    };
    s.onerror = () => { loading = null; reject(new Error('could not load the PDF reader — you may be offline')); };
    document.head.appendChild(s);
  });
  return loading;
}

/* pdf.js hands back positioned fragments, not lines. Regrouping them by their
   y coordinate is what turns "BLR" "09:20" "BKK" into a row you can read. */
function itemsToLines(items) {
  const rows = new Map();
  items.forEach(it => {
    if (!it.str || !it.str.trim()) return;
    const key = Math.round(it.transform[5] / 3);   // tolerate sub-pixel drift
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ x: it.transform[4], s: it.str });
  });
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])                   // PDF y grows upward
    .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map(c => c.s).join(' '))
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function readPDF(file) {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,        // no reason to let a document run code
    disableFontFace: true          // we want the text layer, not the rendering
  }).promise;
  const pages = [];
  const max = Math.min(doc.numPages, 12);          // guard against a 200-page statement
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    pages.push(itemsToLines((await page.getTextContent()).items));
    page.cleanup();
  }
  await doc.destroy();
  return pages.join('\n');
}

/* ========================= the button ========================= */

let input = null;
function picker() {
  if (input) return input;
  input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.hidden = true;
  document.body.appendChild(input);
  return input;
}

const say = m => (typeof toast === 'function' ? toast(m) : console.log(m));

async function importFrom(kind) {
  const el = picker();
  el.value = '';
  el.onchange = async () => {
    const file = el.files && el.files[0];
    el.onchange = null;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return say('That PDF is over 20 MB — too big to read here');

    say('Reading the PDF…');
    let text;
    try {
      text = await readPDF(file);
    } catch (err) {
      return say('Could not read it: ' + (err && err.message ? err.message : err));
    }

    /* A scan has no text layer, so there is nothing to find. Say so plainly
       rather than opening an empty form and looking broken. */
    if (!text || text.replace(/\s/g, '').length < 20)
      return say('No text in that PDF — it looks like a scan or a photo');

    const year = Number(String((typeof S !== 'undefined' && S.settings && S.settings.start) || '').slice(0, 4)) || undefined;
    const p = parse(text, { year, kind });
    const n = p.found.length;

    if (kind === 'expense') {
      const vals = Object.assign({ date: p.when[0] ? p.when[0].iso : undefined,
                                   payer: (typeof meName === 'function' ? meName() : undefined) },
                                 toExpense(p));
      openModal('Add expense — from PDF', expFields(), vals, d => {
        S.expenses.push({ id: uid(), ...d, amount: Number(d.amount) });
        save(); render(); say('Expense added');
      });
    } else {
      openModal('Add booking — from PDF', bookFields, toBooking(p), d => {
        if (Array.isArray(d.forWhom) && !d.forWhom.length) delete d.forWhom;
        S.bookings.push({ id: uid(), ...d, cost: Number(d.cost) || 0 });
        save(); render(); say('Booking saved');
      }, 'type');
    }

    setTimeout(() => say(n ? `Filled in ${p.found.join(', ')} — check it before saving`
                          : 'Could not find much in that one — fill it in by hand'), 300);
  };
  el.click();
}

return Object.assign(core, { importFrom, readPDF, itemsToLines, loadPdfJs });
});
