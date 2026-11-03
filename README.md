# Thailand Trip Tracker

A shared expense and booking tracker for five people on one trip. Installs to a
phone home screen, works with no signal, and syncs to everyone else the moment
signal comes back.

Built with no framework, no bundler, no build step and no npm dependencies. The
only third-party code is a vendored copy of Mozilla's pdf.js, and it is loaded
lazily — nothing downloads it unless you actually import a PDF.

## Why it looks like this

Five friends, ten days, one pot of money, and a fortnight of it spent somewhere
with unreliable data. That produced three constraints, and almost every design
decision falls out of them:

**It has to work offline.** Writes queue locally and upload when signal returns.
A service worker keeps the whole app shell cached, so it opens on a boat.

**Nobody can be trusted to refresh.** Assets are stamped with the deploy time,
so a stale copy cannot be served from a URL the browser has never seen. The page
itself is fetched network-first, and a new build raises a prompt rather than
reloading under someone's fingers.

**Nobody should have to think about sync.** There is no merge UI and no
conflict dialog. Records are unioned by id, edits carry a timestamp, and a
diff against a serialised snapshot decides what to upload.

## Running it

```bash
node .claude/serve.js
```

Then open **<http://localhost:8787/?demo>**. That is the whole toolchain —
nothing to install, nothing to compile.

The `?demo` matters. Without it you hit a sign-in gate for a trip you are not
invited to, because `firebase-config.js` points at whichever Firebase project
this copy was deployed from. Demo mode skips all of that: sample data, no
sign-in, no database, stored under its own key in your browser. Click around,
edit anything, break whatever you like — three separate guards stop it from
touching a real trip (its own storage key, sync never starts, and `save()`
refuses to push). Leave it again with `?nodemo`.

Sign-in is a hard gate: signed out, the app is unusable rather than
half-usable. That is deliberate. An earlier version let you log expenses into a
local copy that was wiped the first time the device synced, which is a worse
outcome than being locked out.

To do anything past looking around — real sync, more than one person — you need
your own Firebase project. That is the next section.

## Making it your own trip

Roughly fifteen minutes, most of it clicking through the Firebase console.

1. Create a Firebase project with Realtime Database and Google sign-in enabled.
2. Put your project's values in `firebase-config.js`. These are identifiers, not
   secrets — every Firebase web app ships them, and access is decided by the
   database rules, not by hiding them.
3. `cp database.rules.example.json database.rules.json` and put the real
   addresses in. **That file is gitignored on purpose**: it holds your friends'
   email addresses, and those are not yours to publish.
4. Add the same addresses to `settings/members` in the database, mapping each to
   a traveller name (Firebase keys cannot contain `.`, so store `a@b,com`).
5. Add your origins (`http://localhost:8787` and your hosting domain) to the
   OAuth client's **Authorized JavaScript origins** in the Google Cloud
   console, or sign-in fails with `origin_mismatch`.
6. `./deploy.sh`

## How it fits together

| File | What it does |
| --- | --- |
| `app.js` | State, money maths, rendering, every view |
| `firebase-sync.js` | Diff-based sync over plain REST, plus the offline outbox |
| `firebase-auth.js` | Google sign-in without the Firebase SDK |
| `pdf-import.js` | Reads a booking PDF or receipt and fills the form from it |
| `sw.js` | Offline shell, and the rules that stop it serving stale builds |
| `map-data.js` | Thailand's outline, projected to SVG paths by `.claude/genmap.py` |
| `styles.css` | Design tokens, light and dark, layout, components |

### The bits worth reading

**Sync without a library.** `firebase-sync.js` talks to the Realtime Database
over ordinary REST with `?auth=<token>`, and listens with an `EventSource`. No
SDK. The subtle part is change detection: an earlier version kept object
*references* in its snapshot, so an in-place edit compared equal to itself and
silently never uploaded. It now stores serialised JSON. There is a regression
test for exactly that.

**Auth without a library.** `firebase-auth.js` goes from Google Identity
Services to `accounts:signInWithIdp` to a refresh loop against
`securetoken.googleapis.com`, in about 120 lines.

**One ledger, not two.** A booking that cost money *is* money someone spent, so
the money views read a single combined ledger rather than keeping a shadow
expense beside each booking. A booking still marked "idea" is excluded — an
idea is not yet a cost.

**PDF import that stores nothing.** `pdf-import.js` reads the file in the
browser, scrapes the text and drops it. Nothing is written to state, and the
sync layer only ever uploads expense, booking and cash records, so there is no
path by which a document reaches the database. It also deliberately never
extracts confirmation numbers.

**Personal vs group money.** The same trip read two ways — the group's spend
against the trip budget, or your share against your own. The invariant that
keeps it honest: the five personal views must always sum back to the group
total.

**Day plans sync per day, not in one lump.** The itinerary is editable, and
`days` is keyed by date rather than by a generated id. It used to upload as a
single object, which meant two people editing two different days inside the
same sync window produced one silent overwrite. Each day is now its own write,
so those two edits no longer touch the same path.

## Tests

```bash
for t in .claude/tests/*.js; do node "$t" || break; done
```

Plain node scripts, no runner. They cover the money maths, the sync diff, the
PDF parser, the day-plan editor and the ledger migration — which is to say, the
places where a bug would quietly cost someone real money, or lose something
they typed, rather than throw an error.

## Third-party code

`vendor/pdf.min.js` and `vendor/pdf.worker.min.js` are
[pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174, Apache 2.0, vendored
rather than fetched from a CDN so the app keeps working offline. Their license
headers are intact.

## Privacy

See [PRIVACY.md](PRIVACY.md) for what is public, what is not, and where each
piece of data actually sits.
