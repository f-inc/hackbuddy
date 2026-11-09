import type { Submission } from "./submission";
export type LiveCreativeScore = {
  id: string; projectName: string; teamNumber?: string;
  reviewCount: number; requiredReviews: number; averageScore: number | null;
};
export function provisionalAverage(submission: Pick<Submission, "reviews">) {
  return submission.reviews.length
    ? submission.reviews.reduce((sum, review) => sum + review.totalScore, 0) / submission.reviews.length
    : null;
}
export function liveCreativeScores(submissions: Submission[], requiredReviews: number): LiveCreativeScore[] {
  return submissions.map(submission => ({
    id: submission.id, projectName: submission.projectName, teamNumber: submission.teamNumber,
    reviewCount: submission.reviews.length, requiredReviews, averageScore: provisionalAverage(submission),
  })).sort((a, b) => a.projectName.localeCompare(b.projectName));
}
