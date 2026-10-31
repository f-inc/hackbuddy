import type { QueueStatus } from "@/domain/submission";

export const submissionField = {
  teamName: process.env.AIRTABLE_TEAM_NAME_FIELD || "Team Name",
  projectName: process.env.AIRTABLE_PROJECT_NAME_FIELD || "Project Name",
  submitters: process.env.AIRTABLE_SUBMITTERS_FIELD || "Name(s)",
  email: process.env.AIRTABLE_EMAIL_FIELD || "Email",
  attendance: process.env.AIRTABLE_ATTENDANCE_FIELD || "Attending In Person",
  oneLiner: process.env.AIRTABLE_ONE_LINER_FIELD || "One Liner",
  description: process.env.AIRTABLE_DESCRIPTION_FIELD || "Description",
  preview: process.env.AIRTABLE_PREVIEW_FIELD || "Progress Preview",
  teamPhoto: process.env.AIRTABLE_TEAM_PHOTO_FIELD || "Team Photo",
  demoUrl: process.env.AIRTABLE_DEMO_FIELD || "Demo",
  demoVideoUrl: process.env.AIRTABLE_DEMO_VIDEO_URL_FIELD || "Demo Video URL",
  repositoryUrl: process.env.AIRTABLE_REPOSITORY_URL_FIELD || "Repository URL",
  track: process.env.AIRTABLE_TRACK_FIELD || "Track",
  submittedAt: process.env.AIRTABLE_SUBMITTED_AT_FIELD || "Submitted At",
  status: process.env.AIRTABLE_STATUS_FIELD || "Status",
  claimedBy: process.env.AIRTABLE_CLAIMED_BY_FIELD || "Claimed By",
  claimedAt: process.env.AIRTABLE_CLAIMED_AT_FIELD || "Claimed At",
  claimToken: process.env.AIRTABLE_CLAIM_TOKEN_FIELD || "Claim Token",
  progress: process.env.AIRTABLE_PROGRESS_FIELD || "Progress Score",
  practicality: process.env.AIRTABLE_PRACTICALITY_FIELD || "Practicality Score",
  complexity:
    process.env.AIRTABLE_COMPLEXITY_FIELD || "Technical Complexity Score",
  total: process.env.AIRTABLE_SCORE_FIELD || "Score",
  notes: process.env.AIRTABLE_NOTES_FIELD || "Judge Notes",
  completedAt: process.env.AIRTABLE_COMPLETED_AT_FIELD || "Completed At",
  finalJudging: process.env.AIRTABLE_FINAL_JUDGING_FIELD || "Final Judging",
} as const;

export const airtableStatus: Record<QueueStatus, string> = {
  available: process.env.AIRTABLE_AVAILABLE_VALUE || "available",
  "in progress": process.env.AIRTABLE_IN_PROGRESS_VALUE || "in progress",
  completed: process.env.AIRTABLE_COMPLETED_VALUE || "completed",
};

export const reviewField = {
  key: process.env.AIRTABLE_REVIEW_KEY_FIELD || "Review Key",
  submissionId:
    process.env.AIRTABLE_REVIEW_SUBMISSION_ID_FIELD || "Submission ID",
  phase: process.env.AIRTABLE_REVIEW_PHASE_FIELD || "Phase",
  judgeName: process.env.AIRTABLE_REVIEW_JUDGE_FIELD || "Judge Name",
  progress: process.env.AIRTABLE_REVIEW_PROGRESS_FIELD || "Progress Score",
  practicality:
    process.env.AIRTABLE_REVIEW_PRACTICALITY_FIELD || "Practicality Score",
  complexity:
    process.env.AIRTABLE_REVIEW_COMPLEXITY_FIELD ||
    "Technical Complexity Score",
  total: process.env.AIRTABLE_REVIEW_TOTAL_FIELD || "Total Score",
  notes: process.env.AIRTABLE_REVIEW_NOTES_FIELD || "Judge Notes",
  completedAt: process.env.AIRTABLE_REVIEW_COMPLETED_AT_FIELD || "Completed At",
} as const;
