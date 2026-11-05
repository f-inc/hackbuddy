import type { FinalsState } from "./results";
import type { Submission } from "./submission";

export function finalsForViewer(state: FinalsState, admin: boolean): FinalsState {
  if (admin) return state;
  const clean = (entry: FinalsState["finalists"][number]) => ({
    ...entry,
    finalReviews: [],
  });
  return {
    ...state,
    submittedJudges: undefined,
    standings: state.standings?.map(clean),
    finalists: state.finalists.map(clean),
    topThree: state.topThree.map(clean),
  };
}

export function submissionForViewer(submission: Submission, admin: boolean): Submission {
  if (admin) return submission;
  if (!submission.finalJudging)
    return { ...submission, contactEmail: "", importedFields: undefined };
  return {
    ...submission,
    contactEmail: "",
    importedFields: undefined,
    finalJudging: { ...submission.finalJudging, reviews: [] },
  };
}
