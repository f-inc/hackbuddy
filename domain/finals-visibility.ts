import type { FinalsState } from "./results";
import type { Submission } from "./submission";

export function finalsForViewer(
  state: FinalsState,
  admin: boolean,
): FinalsState {
  if (admin) return state;
  const clean = (entry: FinalsState["finalists"][number]) => ({
    ...entry,
    finalReviews: [],
    votePoints: undefined,
    firstVotes: undefined,
    secondVotes: undefined,
    thirdVotes: undefined,
  });
  return {
    ...state,
    submittedJudges: undefined,
    standings: [],
    completedReviews: state.ownBallot ? 1 : 0,
    requiredReviews: 1,
    allComplete: Boolean(state.ownBallot),
    finalists: state.finalists.map(clean),
    topThree: state.publishedAt ? state.topThree.map(clean) : [],
  };
}

export function submissionForViewer(
  submission: Submission,
  admin: boolean,
): Submission {
  if (admin || !submission.finalJudging) return submission;
  return {
    ...submission,
    finalJudging: { ...submission.finalJudging, reviews: [] },
  };
}
