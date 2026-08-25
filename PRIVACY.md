# Where the data lives, and who can see it

## The short version

The trip lives in a Firebase Realtime Database, reachable only by five named
Google accounts. The website itself contains no personal data at all — it is
generic code that fills itself once you sign in.

## What is public

`https://thailand-trip-2026-81bb0.web.app` serves `index.html`, `app.js`,
`styles.css`, `map-data.js` and the two Firebase files. Anyone can fetch those.
They contain no names, no bookings, no links, no PNRs — deliberately. The
`trip-data.js` served there is a stub that says "the trip lives in the database".

The Firebase API key and OAuth client ID are in that code. They are identifiers,
not secrets; every Firebase web app ships them. Protection comes from the rules.

## What is private

Everything else: bookings, the expense ledger, cash withdrawals, the checklist,
day plans, trip notes. All of it sits at `/trips/thailand-november-2026-trip`
and the rules require a signed-in Google account from an allowlist of five
named addresses.

Those addresses are not in this repo. They live in `database.rules.json`, which
is gitignored precisely so that four other people's inboxes do not end up on a
public GitHub page; the repo carries `database.rules.example.json` with
placeholders instead.

Anyone else gets 401, signed in or not. There is no shared key or link that
grants access — that model was replaced deliberately, because a forwarded key
cannot be taken back.

## Adding or removing someone

Edit the address list in `database.rules.json`, then:

    npx firebase-tools deploy --only database

Removing someone takes effect immediately and disturbs nobody else. To have
their name map automatically, also update `settings/members` in the database
(emails are stored with dots replaced by commas, as dots are illegal in keys).

## On each person's phone

Their browser keeps a local copy so the app works offline, plus their own
preferences — theme, display currency, which traveller they are. Personal
preferences are never synced, so nobody can overwrite anyone else's.

Writes made offline queue locally and upload when signal returns.

## Local files that are NOT public

`trip-data.js` and `trip-backup.json` on the laptop still hold the full trip.
`database.rules.json` holds the five real addresses, and `PARKED.md` holds the
working notes: who owes whom, what is still unbooked. All four are gitignored
and none are deployed. The two data files are the offline backup if the
database is ever lost.
