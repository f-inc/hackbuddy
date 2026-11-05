# One HackBuddy application

Use the original routes and original UI. `/studio` redirects to `/hackathons`;
there is no separate studio interface or API. Existing studio SQLite data is
left untouched for recovery, but is not mixed with original event records.

## New events

Sign in as an administrator at `/`, open `/hackathons`, and create an event.
The editor has the event name/artwork, judges per project (1–20), finalist count
(5–20), scoring scale (1–5 or 1–10), and submission-open switch. The original
three criteria and top-three final ballot remain. Rules lock after judging starts.

Share `/<slug>/submit` with participants and `/<slug>` with judges. Judges still
use a name and the shared judge password. Projects appear immediately in the
original first-pass queue and in `/<slug>/projects`. Organizers can edit project
submissions from their project detail page and edit scores through Results.
No additional readiness workflow is introduced.
TV finalist lists larger than seven paginate using the original row layout,
with previous/next controls and a 12-second automatic rotation (disabled for reduced motion).

Sponsors can be added, edited, or removed independently in the event editor.
They appear on Winners and its TV presentation; new events start with none.
Present on TV shows the complete podium immediately. An optional reveal is
available under Reveal options.

Optional collections filter projects by an exact tool name and/or track. Add a
collection's sponsor, logo and award/prize in the same editor. No default Photon
tab or fixed winner sponsor logos are shown. No collection is required.

## Supabase

Apply `supabase/migrations/202611040001_hackbuddy.sql` to the designated project.
Set `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PORT`,
`SUPABASE_DB_NAME`, and `SUPABASE_PASSWORD` in the **server** environment. Use the
connection parameters shown in Supabase → Connect. Never use a `NEXT_PUBLIC_`
prefix for database credentials. TLS certificate verification stays enabled, using the official public root in
`supabase/certs/prod-ca-2021.crt` (source: the project’s Database → Settings →
Download certificate link). Override its content with `SUPABASE_DB_CA_CERT` when needed.
Run `npm run check:database` to verify TLS, private access and atomic updates;
the check rolls back its test writes. All data access passes
through authenticated HackBuddy routes, except the public create-only submission
form. Database tables have RLS enabled and deny direct anon/authenticated access.
[Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
explains how database access is restricted.
[PostgreSQL connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
covers direct and pooler connections.

The small event record adapter preserves the original submission/review models.
Each event has a JSON record and a revision. Atomic revision checks and retries
prevent concurrent writes from discarding claims, drafts or reviews. This is
intended for small/medium hackathons; larger events need per-project rows and
scoped queries rather than copying a full event record per write.

Without Supabase credentials, development uses `.data/hackbuddy.sqlite` (override
with `HACKBUDDY_DB`). Production requires Supabase. Neither local preview data nor
historical Airtable records are migrated implicitly. Back up before importing.

## Recovery and locking

The original judging screen saves drafts immediately on the device and, for
managed events, after 800 ms to the database. Refresh restores the newer draft.
An online event triggers another sync; active reservations renew every minute
and expire after 15 minutes without renewal. Skip preserves drafts. Scores only
count after submission; identical submission retries count once. A judge cannot
review the same project twice. Other events' records cannot be accessed through
a judge session. Published scores and ballots remain locked.

## Historical events

Existing Airtable-backed events remain accessible through the original adapter,
with the original two-review, Top 7, 1–10 rules and saved publications. The Airtable
creation helper remains only for legacy tooling/tests; the normal editor creates
database events and no longer asks for table mapping. No old event data is deleted.

## Explicit historical imports

See [Night Hack migration](airtable-migration.md) for a resumable, verified import
that preserves published results, source fields, and private media. The original
Airtable source remains intact.

Imported media lives in the private Cloudflare R2 `hackbuddy-media` bucket.
Supabase indexes each file by event, submission, original field, object key,
size, and SHA-256; authenticated event routes stream the files. Server-only
`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`
configure access. Scope the key to this bucket; keep public access disabled.

The managed event catalog is authoritative once database events exist, so the
selector does not wait for Airtable. The legacy registry remains a bootstrap for
installations with no managed events. Night Hack III and IV are explicitly
migrated; their original published results remain unchanged.
