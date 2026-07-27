import { demoSubmissions } from "./demo-data";
import type {
  ActiveSession,
  FinalJudgingState,
  FinalistEntry,
  FinalsState,
  LeaderboardEntry,
  QueueStats,
  QueueStatus,
  ResultEntry,
  ScoreDistributionBucket,
  Submission,
  SubmissionReview,
} from "./types";

type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

const field = {
  teamName: process.env.AIRTABLE_TEAM_NAME_FIELD || "Team Name",
  projectName: process.env.AIRTABLE_PROJECT_NAME_FIELD || "Project Name",
  submitters: process.env.AIRTABLE_SUBMITTERS_FIELD || "Name(s)",
  email: process.env.AIRTABLE_EMAIL_FIELD || "Email",
  attendance:
    process.env.AIRTABLE_ATTENDANCE_FIELD || "Attending In Person",
  oneLiner: process.env.AIRTABLE_ONE_LINER_FIELD || "One Liner",
  description: process.env.AIRTABLE_DESCRIPTION_FIELD || "Description",
  preview: process.env.AIRTABLE_PREVIEW_FIELD || "Progress Preview",
  teamPhoto: process.env.AIRTABLE_TEAM_PHOTO_FIELD || "Team Photo",
  demoUrl: process.env.AIRTABLE_DEMO_FIELD || "Demo",
  repositoryUrl:
    process.env.AIRTABLE_REPOSITORY_URL_FIELD || "Repository URL",
  track: process.env.AIRTABLE_TRACK_FIELD || "Track",
  submittedAt: process.env.AIRTABLE_SUBMITTED_AT_FIELD || "Submitted At",
  status: process.env.AIRTABLE_STATUS_FIELD || "Status",
  claimedBy: process.env.AIRTABLE_CLAIMED_BY_FIELD || "Claimed By",
  claimedAt: process.env.AIRTABLE_CLAIMED_AT_FIELD || "Claimed At",
  claimToken: process.env.AIRTABLE_CLAIM_TOKEN_FIELD || "Claim Token",
  progress: process.env.AIRTABLE_PROGRESS_FIELD || "Progress Score",
  practicality:
    process.env.AIRTABLE_PRACTICALITY_FIELD || "Practicality Score",
  complexity:
    process.env.AIRTABLE_COMPLEXITY_FIELD || "Technical Complexity Score",
  total: process.env.AIRTABLE_SCORE_FIELD || "Score",
  notes: process.env.AIRTABLE_NOTES_FIELD || "Judge Notes",
  completedAt: process.env.AIRTABLE_COMPLETED_AT_FIELD || "Completed At",
  reviews: process.env.AIRTABLE_REVIEWS_FIELD || "Reviews",
  finalJudging:
    process.env.AIRTABLE_FINAL_JUDGING_FIELD || "Final Judging",
};

const statusValue: Record<QueueStatus, string> = {
  available: process.env.AIRTABLE_AVAILABLE_VALUE || "available",
  "in progress": process.env.AIRTABLE_IN_PROGRESS_VALUE || "in progress",
  completed: process.env.AIRTABLE_COMPLETED_VALUE || "completed",
};

function configured() {
  return Boolean(
    process.env.AIRTABLE_API_KEY &&
      process.env.AIRTABLE_BASE_ID &&
      process.env.AIRTABLE_TABLE_NAME,
  );
}

export function isDemoMode() {
  return !configured();
}

function baseUrl() {
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;
  return `https://api.airtable.com/v0/${base}/${encodeURIComponent(table!)}`;
}

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Airtable request failed (${response.status}): ${details}`);
  }
  return response.json() as Promise<T>;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function attachment(value: unknown) {
  if (typeof value === "string") {
    return { url: value, type: "", filename: "" };
  }
  if (!Array.isArray(value)) {
    return { url: "", type: "", filename: "" };
  }
  const first = value[0] as
    | { url?: unknown; type?: unknown; filename?: unknown }
    | undefined;
  return {
    url: typeof first?.url === "string" ? first.url : "",
    type: typeof first?.type === "string" ? first.type : "",
    filename: typeof first?.filename === "string" ? first.filename : "",
  };
}

function number(value: unknown) {
  return typeof value === "number" ? value : null;
}

function normalizeStatus(value: unknown): QueueStatus {
  if (value === statusValue.completed) return "completed";
  if (value === statusValue["in progress"]) return "in progress";
  return "available";
}

function reviewHistory(
  value: unknown,
  fields: Record<string, unknown>,
): SubmissionReview[] {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        const reviews = parsed.filter(
          (review): review is SubmissionReview =>
            typeof review === "object" &&
            review !== null &&
            typeof (review as SubmissionReview).judgeName === "string" &&
            Number.isInteger((review as SubmissionReview).progressScore) &&
            Number.isInteger((review as SubmissionReview).practicalityScore) &&
            Number.isInteger((review as SubmissionReview).complexityScore) &&
            Number.isInteger((review as SubmissionReview).totalScore) &&
            typeof (review as SubmissionReview).completedAt === "string",
        );
        if (reviews.length) {
          return reviews.map((review) => ({
            ...review,
            judgeName: review.judgeName.trim().toLowerCase(),
            notes: typeof review.notes === "string" ? review.notes : "",
          }));
        }
      }
    } catch {
      // Fall through to the legacy single-score migration below.
    }
  }

  const progressScore = number(fields[field.progress]);
  const practicalityScore = number(fields[field.practicality]);
  const complexityScore = number(fields[field.complexity]);
  if (
    progressScore === null ||
    practicalityScore === null ||
    complexityScore === null
  ) {
    return [];
  }

  return [
    {
      judgeName:
        text(fields[field.claimedBy]).trim().toLowerCase() || "legacy judge",
      progressScore,
      practicalityScore,
      complexityScore,
      totalScore:
        number(fields[field.total]) ??
        progressScore + practicalityScore + complexityScore,
      notes: text(fields[field.notes]),
      completedAt: text(fields[field.completedAt]),
    },
  ];
}

function finalJudgingState(value: unknown): FinalJudgingState | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FinalJudgingState>;
    if (
      typeof parsed.startedAt !== "string" ||
      !Array.isArray(parsed.judges) ||
      !Array.isArray(parsed.reviews)
    ) {
      return null;
    }
    return {
      startedAt: parsed.startedAt,
      judges: parsed.judges
        .filter((judge): judge is string => typeof judge === "string")
        .map((judge) => judge.trim().toLowerCase())
        .filter(Boolean),
      reviews: parsed.reviews
        .filter(
          (review): review is SubmissionReview =>
            typeof review === "object" &&
            review !== null &&
            typeof (review as SubmissionReview).judgeName === "string" &&
            Number.isInteger((review as SubmissionReview).progressScore) &&
            Number.isInteger((review as SubmissionReview).practicalityScore) &&
            Number.isInteger((review as SubmissionReview).complexityScore) &&
            Number.isInteger((review as SubmissionReview).totalScore) &&
            typeof (review as SubmissionReview).completedAt === "string",
        )
        .map((review) => ({
          ...review,
          judgeName: review.judgeName.trim().toLowerCase(),
          notes: typeof review.notes === "string" ? review.notes : "",
        })),
    };
  } catch {
    return null;
  }
}

function toSubmission(record: AirtableRecord): Submission {
  const f = record.fields;
  const teamName = text(f[field.teamName]) || "Unnamed team";
  const progressPreview = attachment(f[field.preview]);
  const teamPhoto = attachment(f[field.teamPhoto]);
  const demo = attachment(
    f[field.demoUrl] ?? f["Video Demo"] ?? f.Demo,
  );
  const reviews = reviewHistory(f[field.reviews], f);
  const rawStatus = normalizeStatus(f[field.status]);
  const aggregate = reviews.reduce(
    (total, review) => ({
      progress: total.progress + review.progressScore,
      practicality: total.practicality + review.practicalityScore,
      complexity: total.complexity + review.complexityScore,
      score: total.score + review.totalScore,
    }),
    { progress: 0, practicality: 0, complexity: 0, score: 0 },
  );
  return {
    id: record.id,
    teamName,
    projectName: text(f[field.projectName]) || teamName,
    submitterNames: text(f[field.submitters]),
    contactEmail: text(f[field.email]),
    attendance: text(f[field.attendance]),
    oneLiner: text(f[field.oneLiner]) || text(f[field.description]),
    description: text(f[field.description]),
    previewImageUrl: progressPreview.url,
    teamPhotoUrl: teamPhoto.url,
    demoUrl: demo.url,
    demoType: demo.type,
    demoFilename: demo.filename,
    repositoryUrl: text(f[field.repositoryUrl]),
    track: text(f[field.track]) || "General",
    status:
      rawStatus === "in progress"
        ? "in progress"
        : reviews.length >= 2
          ? "completed"
          : "available",
    createdAt: text(f[field.submittedAt]) || record.createdTime,
    claimedBy: text(f[field.claimedBy]),
    claimedAt: text(f[field.claimedAt]),
    completedAt:
      reviews.length >= 2
        ? text(f[field.completedAt]) ||
          reviews[reviews.length - 1]?.completedAt ||
          ""
        : "",
    progressScore: reviews.length ? aggregate.progress : null,
    practicalityScore: reviews.length ? aggregate.practicality : null,
    complexityScore: reviews.length ? aggregate.complexity : null,
    totalScore: reviews.length ? aggregate.score : null,
    notes: reviews
      .map((review) => review.notes)
      .filter(Boolean)
      .join("\n\n"),
    reviews,
    finalJudging: finalJudgingState(f[field.finalJudging]),
  };
}

function formula(fieldName: string, value: string) {
  const escaped = value.replace(/'/g, "\\'");
  return `{${fieldName}}='${escaped}'`;
}

async function listRecords(filterByFormula?: string) {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filterByFormula) params.set("filterByFormula", filterByFormula);
    if (offset) params.set("offset", offset);
    const page = await request<AirtableListResponse>(`?${params}`);
    records.push(...page.records);
    offset = page.offset;
  } while (offset);

  return records;
}

async function updateRecord(
  id: string,
  fields: Record<string, string | number | null>,
) {
  return request<AirtableRecord>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

type DemoState = {
  submissions: Submission[];
  claims: Map<string, string>;
};

const demoGlobal = globalThis as typeof globalThis & {
  hackbuddyDemoState?: DemoState;
};
const demoState =
  demoGlobal.hackbuddyDemoState ??
  {
    submissions: structuredClone(demoSubmissions),
    claims: new Map<string, string>(),
  };
demoGlobal.hackbuddyDemoState = demoState;

function currentDemoSubmissions() {
  return demoState.submissions.map((submission) => {
    const activeJudge = demoState.claims.get(submission.id);
    return activeJudge
      ? {
          ...submission,
          status: "in progress" as const,
          claimedBy: activeJudge,
          claimedAt: new Date().toISOString(),
        }
      : {
          ...submission,
          status:
            submission.reviews.length >= 2
              ? ("completed" as const)
              : ("available" as const),
          claimedBy: "",
          claimedAt: "",
        };
  });
}

export async function getQueueStats(): Promise<QueueStats> {
  const submissions = configured()
    ? (await listRecords()).map(toSubmission)
    : currentDemoSubmissions();
  return submissions.reduce<QueueStats>(
    (stats, submission) => {
      stats.total += 1;
      if (submission.status === "available") stats.available += 1;
      if (submission.status === "in progress") stats.inProgress += 1;
      if (submission.status === "completed") stats.completed += 1;
      return stats;
    },
    { total: 0, available: 0, inProgress: 0, completed: 0 },
  );
}

export async function claimNextSubmission(
  judgeName: string,
): Promise<Submission | null> {
  if (!configured()) {
    const current = currentDemoSubmissions();
    const existing = current.find(
      (submission) =>
        demoState.claims.get(submission.id) === judgeName &&
        !submission.reviews.some((review) => review.judgeName === judgeName),
    );
    if (existing) return existing;
    const next = [...current]
      .filter(
        (submission) =>
          submission.status === "available" &&
          !demoState.claims.has(submission.id) &&
          !submission.reviews.some((review) => review.judgeName === judgeName),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
    if (!next) return null;
    demoState.claims.set(next.id, judgeName);
    return { ...next, status: "in progress" };
  }

  const existingFormula = `AND(${formula(field.status, statusValue["in progress"])},${formula(field.claimedBy, judgeName)})`;
  const existing = await listRecords(existingFormula);
  if (existing[0]) {
    const submission = toSubmission(existing[0]);
    if (
      !submission.reviews.some((review) => review.judgeName === judgeName)
    ) {
      return submission;
    }
  }

  const available = (await listRecords()).filter((record) => {
    const submission = toSubmission(record);
    return (
      submission.status === "available" &&
      !submission.reviews.some((review) => review.judgeName === judgeName)
    );
  }).sort(
    (a, b) =>
      new Date(text(b.fields[field.submittedAt]) || b.createdTime).getTime() -
      new Date(text(a.fields[field.submittedAt]) || a.createdTime).getTime(),
  );

  for (const candidate of available.slice(0, 10)) {
    const claimToken = crypto.randomUUID();
    const candidateSubmission = toSubmission(candidate);
    const claimFields: Record<string, string | number | null> = {
      [field.status]: statusValue["in progress"],
      [field.claimedBy]: judgeName,
      [field.claimedAt]: new Date().toISOString(),
      [field.claimToken]: claimToken,
    };
    if (
      !text(candidate.fields[field.reviews]) &&
      candidateSubmission.reviews.length
    ) {
      claimFields[field.reviews] = JSON.stringify(candidateSubmission.reviews);
    }
    await updateRecord(candidate.id, claimFields);

    const verified = await request<AirtableRecord>(`/${candidate.id}`);
    if (verified.fields[field.claimToken] === claimToken) {
      return toSubmission(verified);
    }
  }

  return null;
}

export async function completeSubmission(
  id: string,
  judgeName: string,
  scores: {
    progress: number;
    practicality: number;
    complexity: number;
    notes: string;
  },
) {
  const total = scores.progress + scores.practicality + scores.complexity;

  if (!configured()) {
    if (demoState.claims.get(id) !== judgeName) {
      throw new Error("This submission is not assigned to you.");
    }
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("Submission not found.");
    if (submission.reviews.some((review) => review.judgeName === judgeName)) {
      throw new Error("You have already reviewed this submission.");
    }
    const completedAt = new Date().toISOString();
    const reviews = [
      ...submission.reviews,
      {
        judgeName,
        progressScore: scores.progress,
        practicalityScore: scores.practicality,
        complexityScore: scores.complexity,
        totalScore: total,
        notes: scores.notes,
        completedAt,
      },
    ];
    const aggregate = reviews.reduce(
      (sum, review) => ({
        progress: sum.progress + review.progressScore,
        practicality: sum.practicality + review.practicalityScore,
        complexity: sum.complexity + review.complexityScore,
        total: sum.total + review.totalScore,
      }),
      { progress: 0, practicality: 0, complexity: 0, total: 0 },
    );
    Object.assign(submission, {
      status:
        reviews.length >= 2
          ? ("completed" as const)
          : ("available" as const),
      progressScore: aggregate.progress,
      practicalityScore: aggregate.practicality,
      complexityScore: aggregate.complexity,
      totalScore: aggregate.total,
      notes: reviews
        .map((review) => review.notes)
        .filter(Boolean)
        .join("\n\n"),
      claimedBy: "",
      claimedAt: "",
      completedAt: reviews.length >= 2 ? completedAt : "",
      reviews,
    });
    demoState.claims.delete(id);
    return;
  }

  const current = await request<AirtableRecord>(`/${id}`);
  if (
    current.fields[field.claimedBy] !== judgeName ||
    current.fields[field.status] !== statusValue["in progress"]
  ) {
    throw new Error("This submission is not assigned to you.");
  }

  const submission = toSubmission(current);
  if (submission.reviews.some((review) => review.judgeName === judgeName)) {
    throw new Error("You have already reviewed this submission.");
  }

  const completedAt = new Date().toISOString();
  const reviews: SubmissionReview[] = [
    ...submission.reviews,
    {
      judgeName,
      progressScore: scores.progress,
      practicalityScore: scores.practicality,
      complexityScore: scores.complexity,
      totalScore: total,
      notes: scores.notes,
      completedAt,
    },
  ];
  const aggregate = reviews.reduce(
    (sum, review) => ({
      progress: sum.progress + review.progressScore,
      practicality: sum.practicality + review.practicalityScore,
      complexity: sum.complexity + review.complexityScore,
      total: sum.total + review.totalScore,
    }),
    { progress: 0, practicality: 0, complexity: 0, total: 0 },
  );
  const fullyReviewed = reviews.length >= 2;

  await updateRecord(id, {
    [field.progress]: aggregate.progress,
    [field.practicality]: aggregate.practicality,
    [field.complexity]: aggregate.complexity,
    [field.total]: aggregate.total,
    [field.notes]: reviews
      .map((review) =>
        review.notes ? `${review.judgeName}: ${review.notes}` : "",
      )
      .filter(Boolean)
      .join("\n\n"),
    [field.reviews]: JSON.stringify(reviews),
    [field.status]: fullyReviewed
      ? statusValue.completed
      : statusValue.available,
    [field.completedAt]: fullyReviewed ? completedAt : null,
    [field.claimedBy]: null,
    [field.claimedAt]: null,
    [field.claimToken]: null,
  });
}

export async function getDashboard(judgeName: string) {
  const submissions = configured()
    ? (await listRecords()).map(toSubmission)
    : currentDemoSubmissions();
  const stats = submissions.reduce<QueueStats>(
    (result, submission) => {
      result.total += 1;
      if (submission.status === "available") result.available += 1;
      if (submission.status === "in progress") result.inProgress += 1;
      if (submission.status === "completed") result.completed += 1;
      return result;
    },
    { total: 0, available: 0, inProgress: 0, completed: 0 },
  );

  const completed = submissions.filter(
    (submission) => submission.status === "completed",
  );
  const leaderboard: LeaderboardEntry[] = completed
    .filter((submission) => submission.totalScore !== null)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
    .slice(0, 10)
    .map((submission, index) => ({
      id: submission.id,
      rank: index + 1,
      teamName: submission.teamName,
      projectName: submission.projectName,
      track: submission.track,
      score: submission.totalScore ?? 0,
    }));
  const activeSessions: ActiveSession[] = submissions
    .filter((submission) => submission.status === "in progress")
    .sort(
      (a, b) =>
        new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime(),
    )
    .map((submission) => ({
      id: submission.id,
      projectName: submission.projectName,
      teamName: submission.teamName,
      judgeName: submission.claimedBy,
      claimedAt: submission.claimedAt,
    }));
  const yourReviews = submissions
    .flatMap((submission) => submission.reviews)
    .filter((review) => review.judgeName === judgeName);
  const allScoreTotal = completed.reduce(
    (sum, submission) => sum + (submission.totalScore ?? 0),
    0,
  );
  const yourScoreTotal = yourReviews.reduce(
    (sum, review) => sum + review.totalScore,
    0,
  );
  const scoredSubmissions = completed.filter(
    (submission) => submission.totalScore !== null,
  );
  const eligibleAvailable = submissions.filter(
    (submission) =>
      submission.status === "available" &&
      !submission.reviews.some((review) => review.judgeName === judgeName),
  ).length;
  const hasActiveReview = submissions.some(
    (submission) =>
      submission.status === "in progress" &&
      submission.claimedBy === judgeName,
  );
  const scoreDistribution: ScoreDistributionBucket[] = Array.from(
    { length: 14 },
    (_, index) => {
      const min = 3 + index * 2;
      const max = min + 1;
      return { label: `${min}–${max}`, min, max, count: 0 };
    },
  );
  for (const submission of scoredSubmissions) {
    const score = Math.max(
      3,
      Math.min(30, (submission.totalScore ?? 6) / 2),
    );
    const bucketIndex = Math.min(
      scoreDistribution.length - 1,
      Math.max(0, Math.floor((score - 3) / 2)),
    );
    scoreDistribution[bucketIndex].count += 1;
  }

  return {
    stats,
    leaderboard,
    activeSessions,
    scoreDistribution,
    eligibleAvailable,
    hasActiveReview,
    averageScore: scoredSubmissions.length
      ? Math.round((allScoreTotal / scoredSubmissions.length / 2) * 10) / 10
      : 0,
    yourCompleted: yourReviews.length,
    yourAverageScore: yourReviews.length
      ? Math.round((yourScoreTotal / yourReviews.length) * 10) / 10
      : 0,
  };
}

export async function getCompletedResults(): Promise<ResultEntry[]> {
  const submissions = configured()
    ? (await listRecords(formula(field.status, statusValue.completed))).map(
        toSubmission,
      )
    : currentDemoSubmissions().filter(
        (submission) => submission.status === "completed",
      );

  return submissions
    .filter((submission) => submission.status === "completed")
    .filter(
      (
        submission,
      ): submission is Submission & {
        progressScore: number;
        practicalityScore: number;
        complexityScore: number;
        totalScore: number;
      } =>
        submission.progressScore !== null &&
        submission.practicalityScore !== null &&
        submission.complexityScore !== null &&
        submission.totalScore !== null,
    )
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return (
        new Date(b.completedAt || b.createdAt).getTime() -
        new Date(a.completedAt || a.createdAt).getTime()
      );
    })
    .map((submission) => ({
      id: submission.id,
      teamName: submission.teamName,
      projectName: submission.projectName,
      submitterNames: submission.submitterNames,
      teamPhotoUrl: submission.teamPhotoUrl,
      track: submission.track,
      reviews: submission.reviews,
      progressScore: submission.progressScore,
      practicalityScore: submission.practicalityScore,
      complexityScore: submission.complexityScore,
      totalScore: submission.totalScore,
      completedAt: submission.completedAt,
    }));
}

function finalistEntry(
  submission: Submission & {
    progressScore: number;
    practicalityScore: number;
    complexityScore: number;
    totalScore: number;
  },
  judgeName: string,
  judges: string[],
): FinalistEntry {
  const finalReviews = submission.finalJudging?.reviews ?? [];
  return {
    id: submission.id,
    teamName: submission.teamName,
    projectName: submission.projectName,
    submitterNames: submission.submitterNames,
    teamPhotoUrl: submission.teamPhotoUrl,
    track: submission.track,
    reviews: submission.reviews,
    progressScore: submission.progressScore,
    practicalityScore: submission.practicalityScore,
    complexityScore: submission.complexityScore,
    totalScore: submission.totalScore,
    completedAt: submission.completedAt,
    finalReviews,
    reviewedByYou: finalReviews.some(
      (review) => review.judgeName === judgeName,
    ),
    fullyReviewed:
      judges.length > 0 &&
      judges.every((judge) =>
        finalReviews.some((review) => review.judgeName === judge),
      ),
  };
}

function scoredCompleted(submissions: Submission[]) {
  return submissions.filter(
    (
      submission,
    ): submission is Submission & {
      progressScore: number;
      practicalityScore: number;
      complexityScore: number;
      totalScore: number;
    } =>
      submission.status === "completed" &&
      submission.progressScore !== null &&
      submission.practicalityScore !== null &&
      submission.complexityScore !== null &&
      submission.totalScore !== null,
  );
}

export async function getFinalsState(
  judgeName: string,
): Promise<FinalsState> {
  const submissions = configured()
    ? (await listRecords()).map(toSubmission)
    : currentDemoSubmissions();
  const frozen = scoredCompleted(submissions).filter(
    (submission) => submission.finalJudging,
  );
  const canStart = scoredCompleted(submissions).length >= 10;

  if (!frozen.length) {
    const preview = scoredCompleted(submissions)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    const judges = Array.from(
      new Set(
        scoredCompleted(submissions)
          .flatMap((submission) => submission.reviews)
          .map((review) => review.judgeName)
          .filter(Boolean),
      ),
    ).sort();
    return {
      started: false,
      canStart,
      startedAt: "",
      judges,
      eligibleJudge: judges.includes(judgeName),
      finalists: preview.map((submission) =>
        finalistEntry(submission, judgeName, judges),
      ),
      completedReviews: 0,
      requiredReviews: preview.length * judges.length,
      allComplete: false,
      topThree: [],
    };
  }

  const judges = frozen[0].finalJudging?.judges ?? [];
  const finalists = frozen
    .map((submission) => finalistEntry(submission, judgeName, judges))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
  const completedReviews = finalists.reduce(
    (total, finalist) =>
      total +
      finalist.finalReviews.filter((review) =>
        judges.includes(review.judgeName),
      ).length,
    0,
  );
  const requiredReviews = finalists.length * judges.length;
  const allComplete =
    requiredReviews > 0 && completedReviews >= requiredReviews;
  const topThree = allComplete
    ? [...finalists]
        .sort((a, b) => {
          const aFinal = a.finalReviews.reduce(
            (total, review) => total + review.totalScore,
            0,
          );
          const bFinal = b.finalReviews.reduce(
            (total, review) => total + review.totalScore,
            0,
          );
          if (bFinal !== aFinal) return bFinal - aFinal;
          return a.projectName.localeCompare(b.projectName);
        })
        .slice(0, 3)
    : [];

  return {
    started: true,
    canStart,
    startedAt: frozen[0].finalJudging?.startedAt ?? "",
    judges,
    eligibleJudge: judges.includes(judgeName),
    finalists,
    completedReviews,
    requiredReviews,
    allComplete,
    topThree,
  };
}

export async function startFinalRound(adminName: string) {
  const existing = await getFinalsState(adminName);
  if (existing.started) return existing;
  if (!existing.canStart || existing.finalists.length < 10) {
    throw new Error("At least 10 completed projects are required for finals.");
  }
  if (!existing.finalists.length) {
    throw new Error("There are no completed projects to advance.");
  }
  if (!existing.judges.length) {
    throw new Error("No preliminary judges were found.");
  }

  const startedAt = new Date().toISOString();
  const initialState: FinalJudgingState = {
    startedAt,
    judges: existing.judges,
    reviews: [],
  };

  if (!configured()) {
    for (const finalist of existing.finalists) {
      const submission = demoState.submissions.find(
        (item) => item.id === finalist.id,
      );
      if (submission) submission.finalJudging = structuredClone(initialState);
    }
  } else {
    for (const finalist of existing.finalists) {
      await updateRecord(finalist.id, {
        [field.finalJudging]: JSON.stringify(initialState),
      });
    }
  }

  return getFinalsState(adminName);
}

export async function getFinalistSubmission(
  id: string,
  judgeName: string,
) {
  const submission = await getSubmissionById(id);
  if (!submission?.finalJudging) {
    throw new Error("This project is not in the final round.");
  }
  if (!submission.finalJudging.judges.includes(judgeName)) {
    throw new Error("You are not part of the final-round judge roster.");
  }
  return submission;
}

export async function submitFinalReview(
  id: string,
  judgeName: string,
  scores: {
    progress: number;
    practicality: number;
    complexity: number;
    notes: string;
  },
) {
  const submission = await getFinalistSubmission(id, judgeName);
  const finalJudging = submission.finalJudging!;
  const completedAt = new Date().toISOString();
  const review: SubmissionReview = {
    judgeName,
    progressScore: scores.progress,
    practicalityScore: scores.practicality,
    complexityScore: scores.complexity,
    totalScore: scores.progress + scores.practicality + scores.complexity,
    notes: scores.notes,
    completedAt,
  };
  const existingIndex = finalJudging.reviews.findIndex(
    (item) => item.judgeName === judgeName,
  );
  const reviews =
    existingIndex >= 0
      ? finalJudging.reviews.map((item, index) =>
          index === existingIndex ? review : item,
        )
      : [...finalJudging.reviews, review];
  const nextState: FinalJudgingState = { ...finalJudging, reviews };

  if (!configured()) {
    const target = demoState.submissions.find((item) => item.id === id);
    if (!target) throw new Error("Submission not found.");
    target.finalJudging = nextState;
  } else {
    await updateRecord(id, {
      [field.finalJudging]: JSON.stringify(nextState),
    });
  }

  return nextState;
}

export async function getSubmissionById(id: string) {
  if (!configured()) {
    return (
      currentDemoSubmissions().find((submission) => submission.id === id) ??
      null
    );
  }

  try {
    return toSubmission(await request<AirtableRecord>(`/${id}`));
  } catch {
    return null;
  }
}

export async function updateSubmissionReview(
  id: string,
  reviewIndex: number,
  scores: {
    progress: number;
    practicality: number;
    complexity: number;
    notes: string;
  },
) {
  const totalScore =
    scores.progress + scores.practicality + scores.complexity;

  if (!configured()) {
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("Submission not found.");
    if (submission.status === "in progress") {
      throw new Error("Release the active session before editing its score.");
    }
    if (!submission.reviews[reviewIndex]) {
      throw new Error("This submission does not have a review to edit.");
    }

    const reviews: SubmissionReview[] = submission.reviews.map(
      (review, index) =>
        index === reviewIndex
          ? {
              ...review,
              progressScore: scores.progress,
              practicalityScore: scores.practicality,
              complexityScore: scores.complexity,
              totalScore,
              notes: scores.notes,
            }
          : review,
    );
    const aggregate = reviews.reduce(
      (sum, review) => ({
        progress: sum.progress + review.progressScore,
        practicality: sum.practicality + review.practicalityScore,
        complexity: sum.complexity + review.complexityScore,
        total: sum.total + review.totalScore,
      }),
      { progress: 0, practicality: 0, complexity: 0, total: 0 },
    );

    Object.assign(submission, {
      status:
        reviews.length >= 2
          ? ("completed" as const)
          : ("available" as const),
      progressScore: aggregate.progress,
      practicalityScore: aggregate.practicality,
      complexityScore: aggregate.complexity,
      totalScore: aggregate.total,
      notes: reviews
        .map((review) =>
          review.notes ? `${review.judgeName}: ${review.notes}` : "",
        )
        .filter(Boolean)
        .join("\n\n"),
      reviews,
    });
    return submission;
  }

  const current = await request<AirtableRecord>(`/${id}`);
  const submission = toSubmission(current);
  if (submission.status === "in progress") {
    throw new Error("Release the active session before editing its score.");
  }
  if (!submission.reviews[reviewIndex]) {
    throw new Error("This submission does not have a review to edit.");
  }

  const reviews: SubmissionReview[] = submission.reviews.map((review, index) =>
    index === reviewIndex
      ? {
          ...review,
          progressScore: scores.progress,
          practicalityScore: scores.practicality,
          complexityScore: scores.complexity,
          totalScore,
          notes: scores.notes,
        }
      : review,
  );
  const aggregate = reviews.reduce(
    (sum, review) => ({
      progress: sum.progress + review.progressScore,
      practicality: sum.practicality + review.practicalityScore,
      complexity: sum.complexity + review.complexityScore,
      total: sum.total + review.totalScore,
    }),
    { progress: 0, practicality: 0, complexity: 0, total: 0 },
  );

  await updateRecord(id, {
    [field.progress]: aggregate.progress,
    [field.practicality]: aggregate.practicality,
    [field.complexity]: aggregate.complexity,
    [field.total]: aggregate.total,
    [field.notes]: reviews
      .map((review) =>
        review.notes ? `${review.judgeName}: ${review.notes}` : "",
      )
      .filter(Boolean)
      .join("\n\n"),
    [field.reviews]: JSON.stringify(reviews),
    [field.status]:
      reviews.length >= 2 ? statusValue.completed : statusValue.available,
  });

  return toSubmission(await request<AirtableRecord>(`/${id}`));
}

export async function releaseSubmission(id: string) {
  if (!configured()) {
    demoState.claims.delete(id);
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("Submission not found.");
    submission.status = "available";
    submission.claimedBy = "";
    submission.claimedAt = "";
    return;
  }

  const current = await request<AirtableRecord>(`/${id}`);
  if (current.fields[field.status] !== statusValue["in progress"]) {
    throw new Error("Only an active judging session can be released.");
  }

  await updateRecord(id, {
    [field.status]: statusValue.available,
    [field.claimedBy]: null,
    [field.claimedAt]: null,
    [field.claimToken]: null,
  });
}
