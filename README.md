# HackBuddy Judging

A minimal Next.js judging queue for hackathons. Tally writes submissions to
Airtable, judges claim the newest submission, score one project at a time, and
share a live view of queue progress, active sessions, and current scores.

## What it does

- Separate judge and administrator passwords with lowercase names and signed sessions
- One active submission per judge
- Two distinct judges required before a submission is completed
- Judges cannot review the same submission twice
- Newest submissions are claimed first
- Queue states: `available`, `in progress`, and `completed`
- Three required 1–10 rubric scores
- Airtable remains the source of truth
- Shared dashboard with queue progress, current scores, and active sessions
- Live results scorecard with each rubric score, judge, team, builders, and
  clickable team photos
- Administrators can inspect any active judge session and release its submission
  back to the available queue
- Administrators can also claim and score submissions through the normal
  judging queue
- Built-in preview data when Airtable credentials are absent
- Path-based event workspaces such as `/nighthack3/dashboard`
- An admin-only hackathon selector with event creation and Airtable table mapping

## Multiple hackathons

HackBuddy uses an Airtable `Hackathons` table as its event registry. Each row
maps a display name and URL slug to an existing submissions base and table:

| Field | Airtable type |
| --- | --- |
| Name | Single line text |
| Slug | Single line text |
| Airtable Base ID | Single line text |
| Airtable Table Name | Single line text |
| Airtable Reviews Table Name | Single line text |
| Image URL | URL or single line text |
| Square Image URL | URL or single line text |
| Active | Checkbox |

Create and seed this table with:

```bash
npm run setup:hackathons
```

Each event also has a dedicated review table named `<Hackathon Name> - Reviews`.
Create the default event's table and migrate existing preliminary and final
review JSON with:

```bash
npm run setup:reviews
```

The migration is idempotent: every row uses
`<phase>:<submission ID>:<judge name>` as its review key, and rerunning it only
inserts missing keys. It never replaces review rows that the application has
subsequently updated. Existing `Reviews` and `Final Judging` JSON is left in
place for rollback, but the application reads and writes review scores only
through the dedicated review table.

The Airtable token needs `schema.bases:read` so the admin editor can list the
bases and tables it can access, `schema.bases:write` so setup and event
creation can provision the dedicated reviews table, and the normal record
read/write scopes used while judging.
After setup, administrators sign in at `/` and land on `/hackathons`, where
they can create events, choose their Airtable base and table, and open an event
workspace.

Judges must use an event link such as `/nighthack3`. Their signed session is
bound to that event and login sends them to `/nighthack3/dashboard`; judges
cannot access the selector or another event's API. The sign-in screen is shared
across events, while the event name and destination come from the URL.

`AIRTABLE_TABLE_NAME`, `DEFAULT_HACKATHON_NAME`, and
`DEFAULT_HACKATHON_SLUG` provide a backwards-compatible default event. It
appears as a legacy entry until it is moved into the registry from the admin
selector.

## Airtable setup

Create a `Submissions` table with these fields:

| Field | Airtable type |
| --- | --- |
| Team Name | Single line text |
| Project Name | Single line text |
| Description | Long text |
| Progress Preview | Attachment |
| Demo | Attachment |
| Repository URL | URL |
| Track | Single line text or single select |
| Status | Single select: `available`, `in progress`, `completed` |
| Claimed By | Single line text |
| Claimed At | Date with time |
| Claim Token | Single line text |
| Progress Score | Number |
| Practicality Score | Number |
| Technical Complexity Score | Number |
| Score | Number |
| Judge Notes | Long text |
| Completed At | Date with time |
| Reviews | Long text containing the JSON review ledger |

`Reviews` is now a legacy migration source and is no longer written by the
application. The event review table contains:

| Field | Airtable type |
| --- | --- |
| Review Key | Single line text; primary field |
| Submission ID | Single line text |
| Phase | Single line text: `preliminary` or `final` |
| Judge Name | Single line text |
| Progress Score | Number |
| Practicality Score | Number |
| Technical Complexity Score | Number |
| Total Score | Number |
| Judge Notes | Long text |
| Completed At | Single line text containing an ISO timestamp |

After the first review, the submission returns to `available`. After the second
distinct judge submits a review, it becomes `completed`. The three category
columns contain summed `/20` values and `Score` contains the summed `/60`
total; the dedicated review table preserves each judge's individual `/30`
score and notes. Final-round reviews use the same table with `Phase` set to
`final`, which prevents concurrent judges from replacing one another's scores.

Set every Tally-created record's `Status` to `available`. This can be a default
value in Airtable or a simple Airtable automation.

Create an Airtable personal access token with `data.records:read` and
`data.records:write` access to the base. If the Tally columns have different
names, configure the field-name variables in `.env.example`.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If Airtable variables are omitted, the app uses sample submissions so the UI
can be previewed. `JUDGE_PASSWORD` and `ADMIN_PASSWORD` are still required and
must be different.

## Architecture

The server follows dependency inversion around
`application/ports/submission-repository.ts`:

- `domain/` contains the judging policy, submission model, scoring, and ranking.
  These modules are pure and do not read environment variables or call Airtable.
- `application/` contains queue, dashboard, results, finals, and administrative
  use cases. Each use case depends only on the repository interface.
- `infrastructure/airtable/` contains Airtable transport, field mapping, runtime
  record validation, and the Airtable repository implementation.
- `infrastructure/demo/` implements the same repository contract in memory.
- `server/` owns authentication policies, environment validation, request-body
  parsing, typed errors, and the shared HTTP error mapper.
- `lib/airtable.ts` is a small composition and backwards-compatibility facade;
  it selects the Airtable or demo adapter and delegates to application services.

Default rubric and tournament rules live only in
`domain/judging-policy.ts`. UI labels, score bounds, completion status,
finalist selection, and podium selection derive from that policy.

Run the domain policy tests with:

```bash
npm test
```

## Deploy on Railway

1. Push this directory to a GitHub repository.
2. In Railway, create a project from that repository.
3. Add the required variables from `.env.example`.
4. Railway will detect Next.js. The build command is `npm run build` and the
   start command is `npm start`.
5. Generate `AUTH_SECRET` with a password manager or:

   ```bash
   openssl rand -base64 32
   ```

No database or volume is required because Airtable stores the queue and scores.

## Queue locking note

Airtable does not provide compare-and-swap transactions. HackBuddy uses a
unique claim token and verifies each claim after writing it, which is suitable
for normal hackathon judging traffic. For very high concurrency, put a small
transactional queue in front of Airtable and continue syncing scores back.

## Judge score normalization

Each hackathon has a fixed, versioned scoring policy. Existing registry records
without a policy, and legacy environment-configured events, use `raw-v1`: the
original raw sums and original completion-time tie-breaks. Existing final winner
selection keeps its raw sums and alphabetical tie-breaks. Deploying this feature
does not normalize or publish historical events, including Night Hack III.

New events default to `normalized-v1`; organizers can select original raw
scoring when creating an event. The policy is immutable from creation (a
stronger lock than waiting for the first review). The submissions/reviews data
sources are immutable too, so editing an event cannot switch it onto another
scoring history. Normalized event creation rejects nonempty review ledgers and
submission tables already attached to another event. Register an existing event
with raw scoring instead.

For normalized events, preliminary results, the dashboard leaderboard, and
top-ten selection use a relative score calculated from that event's review
ledger. Final winners use a separate calculation over the frozen finalists and
selected final-round judges. Raw scores and notes are preserved.

For each judge and each criterion, compute the mean `m` and population variance
`v` of their submitted scores. Let `n` be their review count, `w = n / (n + 5)`,
and `V` the event/round's review-count-weighted mean of the judges' within-judge
variances for that criterion. A score `x` contributes:

```text
relative = w * (x - m) / max(1, sqrt(w * v + (1 - w) * V))
```

This is a regularized z-score: judge means remove generosity/strictness,
pooled variance stabilizes scoring ranges, the one-point spread floor avoids
amplifying tiny differences, and `w` shrinks small histories toward neutral.
A judge with fewer than two reviews, or a criterion with zero variance,
contributes zero for that criterion. Average the three criterion contributions,
then average the project's reviews equally. More reviews do not increase a
project's score just by increasing the sum. Higher is better; zero is neutral.
Scores are displayed to three decimal places but ranked at full precision
(with a `1e-10` tolerance for numerical ties). Ties sort by project name then
record ID; completion time and inflated raw totals do not break ties.

All saved preliminary reviews, including those on projects awaiting another
review, contribute to calibration. Only completed, scored projects enter
rankings. Rankings recalculate after reviews arrive or change. Finalist cohorts
already stored in Airtable remain fixed; the existing sync action can update a
cohort before final reviews start. Starting or syncing a round selects the
normalized top ten. Final winners appear only once every selected judge has
reviewed every finalist.

Results retain raw rubric scores and raw ranks, with a comparison control.
Administrator calibration details show each judge's sample count, criterion
means/spreads, low-sample and flat-criterion indicators, disconnected judge
comparison groups, and projects with no individual review history. Such legacy
projects get a neutral normalized score; restore their review ledger before
relying on their ranks.

Calibration assumes comparable project mixes across judges. The newest-first
claim queue does not guarantee this, and two reviews per project cannot always
separate project quality from judge generosity. Disconnected judge groups are
flagged, but connected groups can still have uneven assignments. Organizers
should review assignment overlap and raw-versus-normalized rankings before
starting finals. No data from another hackathon or judging phase is pooled.

Run `npm test` for scoring/ranking simulations, `npm run lint`, and
`npx tsc --noEmit` for static checks. Test compilation uses a unique temporary
directory per run so parallel checkouts cannot pick up stale test files.


## Publishing and preserving official results

Before deploying, run `npm run setup:hackathons` with the normal Airtable
configuration to add two registry fields (the worktree does not run this against
live Airtable automatically):

| Field | Airtable type | Meaning |
| --- | --- | --- |
| Scoring Policy | Single line text | `raw-v1` or `normalized-v1`; blank means legacy raw scoring |
| Published Results | Long text | Compressed, versioned snapshot of official results |

The setup script leaves historical policy fields blank, preserving raw scoring;
it does not publish snapshots or alter scores. Missing fields fail writes
explicitly rather than silently opting an event into normalization.

Once every selected final judge has reviewed every finalist, an administrator
can choose **Publish and lock results** on the leaderboard. Until then,
rankings are provisional. Publication reads the event ledger once and saves
its preliminary ranking, raw and normalized score values, final rankings,
individual scorecards, judge roster, scoring version, publisher and timestamp.
The snapshot is compressed to fit the registry long-text field; an oversized
snapshot is rejected before writing. Publication is idempotent and the app
never intentionally replaces an existing snapshot.

Results and finals pages read published snapshots rather than recomputing
scores. A later score-ledger edit or a new normalization implementation cannot
change those official rankings. The snapshot pins its own scoring version.
Unknown/corrupt snapshot formats fail closed with an error, never a recalculated
ranking. Queue claims, review edits/submissions, final-round start/sync/reset,
and session releases are rejected after publication. UI edit controls are hidden.
There is no unpublish/reset action for a published event. Corrections require a
separately managed replacement event; they cannot silently replace the record.

Legacy environment-only events must first be registered with raw scoring before
a permanent snapshot can be published. A historical comparison report remains a
simulation and does not set the event's scoring policy or official results.
`DEMO_SCORING_POLICY=normalized-v1` opts local preview data into normalization;
the default preview policy is raw, just like an existing event.
