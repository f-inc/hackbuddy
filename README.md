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
- Personal Projects judged tab with searchable preliminary/final review history,
  saved scores and notes, project results, and a read-only grading workspace
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

## Deploy on Vercel

1. Link this checkout with `npx vercel link` and choose the work team.
2. Add `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`,
   `ADMIN_PASSWORD`, `JUDGE_PASSWORD`, and `AUTH_SECRET` to the production
   environment with `npx vercel env add NAME --environment production`.
   Pipe secret values through stdin rather than passing them as command arguments.
   Add any optional overrides from `.env.example` that your deployment uses.
3. For a new installation, generate `AUTH_SECRET` with a password manager or:

   ```bash
   openssl rand -base64 32
   ```

   When migrating an existing installation, preserve its signing secret and
   passwords instead.
4. Deploy with `npx vercel --prod`. Vercel detects Next.js and builds with
   `npm run build`; API routes run as functions in San Francisco (`sfo1`).
5. Add the production domain with
   `npx vercel domains add hackbuddy.f.inc hackbuddy --scope f-inc`
   and update its DNS to the target reported by Vercel. Complete the TXT
   ownership challenge if Vercel requests one. Set
   `NEXT_PUBLIC_SITE_URL=https://hackbuddy.f.inc` for canonical and social links,
   then redeploy after changing any variables.
6. Connect `f-inc/hackbuddy` using `npx vercel git connect` and use `master`
   as the production branch for automatic deployments.

No database or volume is required because Airtable stores the queue and scores.
Do not run the Airtable setup or migration scripts as a deployment step.
Railway-generated `RAILWAY_*` variables are not needed on Vercel.
The old `railway.json` is retained for rollback; stop the Railway deployment
only after the custom domain and authenticated Airtable reads work on Vercel.

## Queue locking note

Airtable does not provide compare-and-swap transactions. HackBuddy uses a
unique claim token and verifies each claim after writing it, which is suitable
for normal hackathon judging traffic. For very high concurrency, put a small
transactional queue in front of Airtable and continue syncing scores back.
