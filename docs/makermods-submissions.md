# MakerMods submission form

Participants: https://hackbuddy.f.inc/makermods/submit
Organizers: https://hackbuddy.f.inc/makermods/projects

The event uses Supabase and the original HackBuddy submission and judging routes.
In the Hackathons editor its submission template is **MakerMods Physical AI**.
Changing event settings preserves that template.

The form recreates the previous Night Hack submission questions for this event:
project/team names, builder names, organizer-only contact email, a 50-character
one-liner, description, progress outline, track, tools, demo video, project link,
team photo link, repository, and optional project image. Team photos use direct
image links rather than the old Tally attachment upload. Videos remain link-only,
with instructions for a Public or Unlisted YouTube video of at most 60 seconds.
Video length and remote-link accessibility cannot be verified automatically.

Tracks are Hill Climb and Creative Applications. The latter requires a demo
video link; Hill Climb does not. Tools are multiselect MakerMods, Dream Labs and
LiveKit, with an optional free-text list of other tools. These are submission
categories; this change does not implement the external Hill Climb evaluation
leaderboard or replace the creative judging rubric.

Required answers, field lengths, URL protocols, track names and email syntax are
validated on the server. Browser drafts recover after reload. A request token is
saved with the draft before sending; a lost response can be retried after reload
without creating another project. Answers are held while receipt is uncertain.
A reused token with different answers is rejected instead of silently discarding
changes. Confirmation displays the persisted submission reference.
Drafts are local to the browser and event, not shared across devices.

## Verification

- `npm test`: isolated domain and application tests, including submission
  mapping, concurrency, idempotence, input validation, editing permissions,
  event isolation, closure and publication locks.
- `npm run test:submissions`: requires the local app on port 3010, configured
  Supabase and local judge/admin credentials. It creates a uniquely named QA
  event, makes real HTTP submissions for both tracks (including concurrent
  writes), queries Supabase to verify every mapped answer, checks contact
  privacy and closure, and deletes only that QA event in a finally block.
  Never targets the public production URL.
- `npm run check:database`: TLS, RLS/private access and atomic revision checks
  with test writes rolled back.
- `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`.

Manual browser verification also covers draft recovery and a deliberately lost
HTTP response after a successful database write: refresh restores Retry
submission, retry returns the original reference, and the database contains
exactly one project. QA submissions in the real MakerMods event are clearly
labeled and removed after verification.
