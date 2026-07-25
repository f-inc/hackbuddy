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

After the first review, the submission returns to `available`. After the second
distinct judge submits a review, it becomes `completed`. The three category
columns contain summed `/20` values and `Score` contains the summed `/60`
total; `Reviews` preserves each judge's individual `/30` score and notes.

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
