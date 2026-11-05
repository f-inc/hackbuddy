import { DEFAULT_EVENT_SETTINGS, type EventSettings } from "@/domain/event-settings";
import type { ScoringPolicy } from "@/domain/event-scoring";
import { applyPublishedScores, type PublishedResults } from "@/domain/publication";
import { judgedProjects, reviewedSubmission } from "@/domain/judge-history";
import type { SubmissionRepositoryProvider } from "./ports/submission-repository";

export class JudgedProjectsQuery {
  constructor(
    private readonly repository: SubmissionRepositoryProvider,
    private readonly settings: () => EventSettings = () => DEFAULT_EVENT_SETTINGS,
  ) {}

  async execute(
    judgeName: string,
    id?: string,
    policy: ScoringPolicy = "raw-v1",
    publication: PublishedResults | null = null,
  ) {
    const submissions = (await this.repository().list()).map((submission) =>
      publication ? applyPublishedScores(submission, publication) : submission,
    );
    const projects = judgedProjects(submissions, judgeName, policy, publication, this.settings());
    if (!id) return { projects };
    const project = projects.find((p) => p.id === id);
    const original = submissions.find((s) => s.id === id);
    if (!project || !original) return null;
    return { project, submission: reviewedSubmission(original, judgeName) };
  }
}
