import type { Submission } from "./submission";

export type PhotonSubmissionEntry = Pick<
  Submission,
  "id" | "projectName" | "teamName" | "submitterNames" | "oneLiner" | "createdAt" | "toolsUsed"
>;

export function usesPhoton(submission: Pick<Submission, "toolsUsed">) {
  return (submission.toolsUsed ?? []).some((tool) =>
    /\bphoton\b/i.test(tool),
  );
}

export function photonEntries(submissions: Submission[]): PhotonSubmissionEntry[] {
  return submissions
    .filter(usesPhoton)
    .map(({ id, projectName, teamName, submitterNames, oneLiner, createdAt, toolsUsed }) => ({
      id, projectName, teamName, submitterNames, oneLiner, createdAt, toolsUsed,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
