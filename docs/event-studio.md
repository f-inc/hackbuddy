# Event studio preview

The `generalize-event-studio` branch introduces a complete event journey alongside the original Airtable-backed hackathon application. Open `/studio` and choose **Explore a sample event**, or create a workspace. Nothing in the studio reads, changes, or migrates existing hackathon records. Original routes and rules continue to work.

## Try it

Use Node 22.13+ (Node 24 recommended), install the existing dependencies, and run `npm run dev`. Visit http://localhost:3000/studio. Each sample button press creates an isolated workspace with a configurable draft, a blank demo day, and a completed event with published winners and an unranked finalist presentation. Sample judge password: `judges`.

For a quick full competition: create a new event with **One scored round**, set reviews per project and winner count to 1, add a project, mark ready, open judging, open the judge link, sign in with a name and the event password, submit a review, and return to the organizer's Results tab to publish. Organizer and judge cookies are separate, so both desks work in the same browser. Public showcase links need neither cookie nor password.

## Included

- Workspace owners and revocable co-organizers, signed sessions, salted password hashes, stable IDs, server-side workspace/event scope, and sign-in throttling. Owners share an initial organizer password directly; this preview does not send email or provide password recovery.
- Judges retain the requested name + shared event password access. A case-insensitive name identifies one judge **within an event**. Use distinct invitation names for different people. Display-name changes preserve the stable judge ID and prior reviews. Roster-only mode prevents uninvited names; revocation is checked on every request.
- Three formats: one scored round, scored preliminaries plus scored finals, scored preliminaries plus ranked finals. Rubrics have 1–12 required criteria with independent integer ranges and positive weights. Review counts, finalists, winners, ballot points, quorum, score visibility, and reservation duration are event-specific.
- Rules freeze when judging begins. Rule version 1 contains the complete calculation contract; publication records snapshot it. Legacy policy and completed hackathons are never reinterpreted.
- CSV parsing and preview with quoted/multiline cells, row validation, stable-ID upsert, manual entry, template download, and formula-safe exports. Airtable is an optional **read-only, one-time import** with field mapping; tokens exist only for the request and are not stored. There is no background synchronization or schema provisioning.
- Active judge reservations are unique per project and per judge in each round. Claims balance review counts before creation time; expertise tracks and conflicts exclude projects. Reservations expire and renew, organizers can release them, drafts persist, and refresh resumes the same assignment. A submitted review has a database uniqueness constraint and identical submit retries are idempotent.
- Weighted average scoring normalizes each criterion to 0–100 before weighting. Optional normalization centers each judge's criterion scores, with small-sample shrinkage and a pooled variance floor. This requires overlapping review coverage to be useful; it is not a substitute for assignment quality.
- Blind, after-own-review, and live aggregate visibility are enforced on the server. Public views omit contact emails, review notes, judge identities, individual reviews, drafts, and ballots. The organizer chooses whether a public gallery and official results are visible.
- Configurable tool/track collections and partner attribution. Optional project artwork, demo and repository links; alphabetical unranked finalists; ranked winners only after publication.
- A viewport-filling TV presentation with equally sized rows, no bottom gap, alphabetical finalists, automatic pages of eight for larger events, and reduced motion support.
- Immutable publication revisions, explicit reasons for overrides/corrections, finalist-cutoff tie checks, archival without breaking the public URL, and configuration-only duplication. Exports cover projects, reviews, aggregate results with official places, and recent activity. Activity UI/export currently contains the latest 200 actions.

## Storage and deployment boundary

This branch uses Node's built-in SQLite driver and a new namespaced transactional store. It adds no dependencies and does not reuse the old Airtable global credentials. Default database: `.data/studio.sqlite`, ignored by git. Configure `HACKBUDDY_STUDIO_DB` to an absolute path on a durable volume for a persistent self-hosted deployment. Back up the SQLite database using SQLite's backup tooling or a consistent volume snapshot (including WAL state); do not copy only the main file while writes are active.

**Do not deploy this storage configuration to Vercel/serverless ephemeral filesystems.** The studio rejects Vercel operation without an explicit database path. A persistent Node server with a durable volume can run this implementation. Broad hosted/serverless release still needs a managed transactional database adapter (for example PostgreSQL), migrations and backups for that provider, production account recovery, operational monitoring, and load/security review. Setting a `/tmp` database path does not make data durable.

The preview reads event-scoped records in aggregate and polls only visible pages (20–30 seconds). There is no pagination or subscription feed yet. It is intended for small and medium events and product evaluation, not an unbounded hosted platform. Import caps are 5 MB / 5,000 projects; very large events need paginated/scoped storage queries. Airtable permission and connection errors are surfaced before import; upstream retries are manual in this preview.

## Validation

`npm test` runs the legacy suites and the studio integration suite. Studio coverage includes tenant and role isolation, organizer revocation, custom rubric shapes, all three formats, one/two-project finals, draft recovery, expiring claims, conflict assignment, visibility, CSV validation/upserts, publication ties/revisions, archive, sample isolation, and idempotent review submission. Also run `npx tsc --noEmit --incremental false`, `npm run lint`, and `npm run build`.
