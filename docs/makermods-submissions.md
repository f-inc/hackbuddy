# MakerMods submission form

Participants: https://hackbuddy.f.inc/makermods/submit
Organizers: https://hackbuddy.f.inc/makermods/projects

The event uses Supabase and the original HackBuddy submission and judging routes.
In the Hackathons editor its submission template is **MakerMods Physical AI**.
Changing event settings preserves that template.

The form recreates the previous Night Hack submission questions for this event:
required team number (first input for both tracks), project/team names, builder names, organizer-only contact email, a 50-character
one-liner, description, progress outline, tools, demo video, project link,
team photo link, repository, and optional project image. Team photos use direct
image links rather than the old Tally attachment upload. Videos remain link-only,
with instructions for a Public or Unlisted YouTube video of at most 60 seconds.
Video length and remote-link accessibility cannot be verified automatically.

The same form has a track selector, defaulting to Creative Applications for
compatibility with existing drafts and clients. Creative Applications keeps its
one-liner, project description, hackathon progress and required demo video.

Hill Climb is evaluated in person. It keeps team/project names, team number,
builders, contact email, the same tools and team photo. Its required description
asks how the base model was improved, with episodes collected and training steps
as examples. It hides the one-liner, progress, demo video, website, repository and
project-image inputs. Switching tracks preserves unsent draft answers, but the
server discards creative-only fields when saving a Hill Climb project. No new
Hill Climb evaluation or leaderboard is implemented by this form change.

Tools are multiselect Dream-1, LiveKit and Dimensional, with an optional free-text
list of other tools. Existing project records are unchanged.

Required answers, field lengths, URL protocols, the event track and email syntax are
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
