import { judgedProjects, reviewedSubmission } from "@/domain/judge-history";
import type { SubmissionRepositoryProvider } from "./ports/submission-repository";

export class JudgedProjectsQuery {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async execute(judgeName: string, id?: string) {
    const submissions = await this.repository().list();
    const projects = judgedProjects(submissions, judgeName);
    if (!id) return { projects };
    const project = projects.find((p) => p.id === id);
    const original = submissions.find((s) => s.id === id);
    if (!project || !original) return null;
    return { project, submission: reviewedSubmission(original, judgeName) };
  }
}
