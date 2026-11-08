# Hill Climb judging

MakerMods events show a Hill Climb navigation entry at /<event>/hill-climb. Each
judge selects a submitted Hill Climb team, records a relay run and saves or updates
their own grade. Team numbers are preserved. This implements per-team scoring,
not a tournament bracket or automatic opponent matching.

The supplied 1v1 Hill Climb Relay tournament rubric determines points:

- First unplugged cable: 10; further unplugged cables: 5 each.
- Loose cables plugged into free hub ports: 20 each, up to four.
- A tower that passes Stage 2: 20, plus 3 per full inch of final height.
- Taller passed tower: 10, only in a head-to-head match; ties earn nothing.
- Golf balls remaining in the bin: 5 each.
- Referee-verified LiveKit: 10; Dimensional: 5.
- A black 8-ball marks an automatic loss and retains points.
- Skipping stages, human touch, or human policy input after go is a DQ: zero
  points and an automatic loss. If both teams have losing events, referees
  compare their points according to the rubric.

The Stage 2 pass checkbox uses the rubric's pass-bar wording: at least four
inches, free-standing for three seconds after release. Final height is separate:
a tower that passed earlier retains its stage bonus if it falls later.

Grades live in the existing Supabase event record, keyed by team and judge.
Optimistic transactions preserve other judges, submissions, drafts and locks.
Updates reject stale revisions. Retried identical saves are safe. Drafts stay on
the judge's device and recover only against the same saved grade revision.

Hill Climb teams stay visible in Projects but do not enter the Creative
Applications queue, counts, rankings, finals or winners. Historical events retain
their existing behavior. Published results also lock Hill Climb grades.

Tests: npm test; npx tsc --noEmit --incremental false; npm run lint.
