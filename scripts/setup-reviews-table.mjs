import { readFile } from "node:fs/promises";

try {
  const envText = await readFile(
    new URL("../.env.local", import.meta.url),
    "utf8",
  );
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
} catch (error) {
  if (!(error && typeof error === "object" && error.code === "ENOENT")) {
    throw error;
  }
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(
    prefix.length,
  );
}

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = argument("base") || process.env.AIRTABLE_BASE_ID;
const submissionsTable =
  argument("submissions") || process.env.AIRTABLE_TABLE_NAME;
const eventName =
  argument("name") ||
  process.env.DEFAULT_HACKATHON_NAME ||
  "Night Hack III";
const reviewsTable =
  argument("reviews") ||
  process.env.AIRTABLE_REVIEWS_TABLE_NAME ||
  `${eventName} - Reviews`;

for (const [name, value] of Object.entries({
  AIRTABLE_API_KEY: apiKey,
  AIRTABLE_BASE_ID: baseId,
  AIRTABLE_TABLE_NAME: submissionsTable,
})) {
  if (!value) throw new Error(`${name} is required.`);
}

const submissionField = {
  claimedBy: process.env.AIRTABLE_CLAIMED_BY_FIELD || "Claimed By",
  progress: process.env.AIRTABLE_PROGRESS_FIELD || "Progress Score",
  practicality:
    process.env.AIRTABLE_PRACTICALITY_FIELD || "Practicality Score",
  complexity:
    process.env.AIRTABLE_COMPLEXITY_FIELD ||
    "Technical Complexity Score",
  total: process.env.AIRTABLE_SCORE_FIELD || "Score",
  notes: process.env.AIRTABLE_NOTES_FIELD || "Judge Notes",
  completedAt: process.env.AIRTABLE_COMPLETED_AT_FIELD || "Completed At",
  reviews: process.env.AIRTABLE_REVIEWS_FIELD || "Reviews",
  finalJudging:
    process.env.AIRTABLE_FINAL_JUDGING_FIELD || "Final Judging",
};
const reviewField = {
  key: process.env.AIRTABLE_REVIEW_KEY_FIELD || "Review Key",
  submissionId:
    process.env.AIRTABLE_REVIEW_SUBMISSION_ID_FIELD || "Submission ID",
  phase: process.env.AIRTABLE_REVIEW_PHASE_FIELD || "Phase",
  judgeName: process.env.AIRTABLE_REVIEW_JUDGE_FIELD || "Judge Name",
  progress:
    process.env.AIRTABLE_REVIEW_PROGRESS_FIELD || "Progress Score",
  practicality:
    process.env.AIRTABLE_REVIEW_PRACTICALITY_FIELD || "Practicality Score",
  complexity:
    process.env.AIRTABLE_REVIEW_COMPLEXITY_FIELD ||
    "Technical Complexity Score",
  total: process.env.AIRTABLE_REVIEW_TOTAL_FIELD || "Total Score",
  notes: process.env.AIRTABLE_REVIEW_NOTES_FIELD || "Judge Notes",
  completedAt:
    process.env.AIRTABLE_REVIEW_COMPLETED_AT_FIELD || "Completed At",
};

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};
const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;

async function checkedFetch(url, init, message) {
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    throw new Error(
      `${message} (${response.status}): ${await response.text()}`,
    );
  }
  return response;
}

const fieldDefinitions = [
  { name: reviewField.key, type: "singleLineText" },
  { name: reviewField.submissionId, type: "singleLineText" },
  { name: reviewField.phase, type: "singleLineText" },
  { name: reviewField.judgeName, type: "singleLineText" },
  { name: reviewField.progress, type: "number", options: { precision: 0 } },
  {
    name: reviewField.practicality,
    type: "number",
    options: { precision: 0 },
  },
  {
    name: reviewField.complexity,
    type: "number",
    options: { precision: 0 },
  },
  { name: reviewField.total, type: "number", options: { precision: 0 } },
  { name: reviewField.notes, type: "multilineText" },
  { name: reviewField.completedAt, type: "singleLineText" },
];

const metadata = await (
  await checkedFetch(metaUrl, {}, "Could not inspect Airtable schema")
).json();
let table = metadata.tables.find(
  (candidate) => candidate.name === reviewsTable,
);
if (!table) {
  table = await (
    await checkedFetch(
      metaUrl,
      {
        method: "POST",
        body: JSON.stringify({
          name: reviewsTable,
          description:
            "One row per HackBuddy judge review. Review Key is the idempotency key.",
          fields: fieldDefinitions,
        }),
      },
      `Could not create "${reviewsTable}"`,
    )
  ).json();
  console.log(`Created "${reviewsTable}".`);
} else {
  console.log(`"${reviewsTable}" already exists.`);
  for (const definition of fieldDefinitions) {
    if (table.fields.some((field) => field.name === definition.name)) continue;
    await checkedFetch(
      `${metaUrl}/${table.id}/fields`,
      { method: "POST", body: JSON.stringify(definition) },
      `Could not create "${definition.name}"`,
    );
    console.log(`Created "${definition.name}" on "${reviewsTable}".`);
  }
}

const submissionsUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(submissionsTable)}`;
const submissions = [];
let offset;
do {
  const params = new URLSearchParams({ pageSize: "100" });
  if (offset) params.set("offset", offset);
  const page = await (
    await checkedFetch(
      `${submissionsUrl}?${params}`,
      {},
      "Could not load submissions",
    )
  ).json();
  submissions.push(...page.records);
  offset = page.offset;
} while (offset);

function validReview(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.judgeName === "string" &&
    Number.isInteger(value.progressScore) &&
    Number.isInteger(value.practicalityScore) &&
    Number.isInteger(value.complexityScore) &&
    Number.isInteger(value.totalScore) &&
    typeof value.completedAt === "string"
  );
}

function preliminaryReviews(fields) {
  const ledger = fields[submissionField.reviews];
  if (typeof ledger === "string" && ledger.trim()) {
    try {
      const parsed = JSON.parse(ledger);
      if (Array.isArray(parsed)) return parsed.filter(validReview);
    } catch {
      throw new Error("A submission contains invalid Reviews JSON.");
    }
  }
  const progressScore = fields[submissionField.progress];
  const practicalityScore = fields[submissionField.practicality];
  const complexityScore = fields[submissionField.complexity];
  if (
    !Number.isInteger(progressScore) ||
    !Number.isInteger(practicalityScore) ||
    !Number.isInteger(complexityScore)
  ) {
    return [];
  }
  return [
    {
      judgeName:
        String(fields[submissionField.claimedBy] || "").trim().toLowerCase() ||
        "legacy judge",
      progressScore,
      practicalityScore,
      complexityScore,
      totalScore:
        Number.isInteger(fields[submissionField.total])
          ? fields[submissionField.total]
          : progressScore + practicalityScore + complexityScore,
      notes:
        typeof fields[submissionField.notes] === "string"
          ? fields[submissionField.notes]
          : "",
      completedAt:
        typeof fields[submissionField.completedAt] === "string"
          ? fields[submissionField.completedAt]
          : "",
    },
  ];
}

function finalReviews(fields) {
  const value = fields[submissionField.finalJudging];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed.reviews)
      ? parsed.reviews.filter(validReview)
      : [];
  } catch {
    throw new Error("A submission contains invalid Final Judging JSON.");
  }
}

function reviewKey(phase, submissionId, judgeName) {
  return `${phase}:${submissionId}:${judgeName.trim().toLowerCase()}`;
}

const reviewRows = new Map();
for (const submission of submissions) {
  for (const [phase, reviews] of [
    ["preliminary", preliminaryReviews(submission.fields)],
    ["final", finalReviews(submission.fields)],
  ]) {
    for (const review of reviews) {
      const judgeName = review.judgeName.trim().toLowerCase();
      const key = reviewKey(phase, submission.id, judgeName);
      reviewRows.set(key, {
        fields: {
          [reviewField.key]: key,
          [reviewField.submissionId]: submission.id,
          [reviewField.phase]: phase,
          [reviewField.judgeName]: judgeName,
          [reviewField.progress]: review.progressScore,
          [reviewField.practicality]: review.practicalityScore,
          [reviewField.complexity]: review.complexityScore,
          [reviewField.total]: review.totalScore,
          [reviewField.notes]:
            typeof review.notes === "string" ? review.notes : "",
          [reviewField.completedAt]: review.completedAt,
        },
      });
    }
  }
}

const reviewsUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(reviewsTable)}`;
const existingKeys = new Set();
offset = undefined;
do {
  const params = new URLSearchParams({ pageSize: "100" });
  if (offset) params.set("offset", offset);
  const page = await (
    await checkedFetch(
      `${reviewsUrl}?${params}`,
      {},
      "Could not inspect existing reviews",
    )
  ).json();
  for (const record of page.records) {
    existingKeys.add(String(record.fields[reviewField.key] || ""));
  }
  offset = page.offset;
} while (offset);

const rows = [...reviewRows]
  .filter(([key]) => !existingKeys.has(key))
  .map(([, row]) => row);
for (let index = 0; index < rows.length; index += 10) {
  await checkedFetch(
    reviewsUrl,
    {
      method: "PATCH",
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [reviewField.key] },
        records: rows.slice(index, index + 10),
      }),
    },
    "Could not migrate review records",
  );
}

const storedKeys = new Map();
const phaseCounts = { preliminary: 0, final: 0 };
offset = undefined;
do {
  const params = new URLSearchParams({ pageSize: "100" });
  if (offset) params.set("offset", offset);
  const page = await (
    await checkedFetch(
      `${reviewsUrl}?${params}`,
      {},
      "Could not verify migrated reviews",
    )
  ).json();
  for (const record of page.records) {
    const key = String(record.fields[reviewField.key] || "");
    storedKeys.set(key, (storedKeys.get(key) || 0) + 1);
    const phase = record.fields[reviewField.phase];
    if (phase === "preliminary" || phase === "final") {
      phaseCounts[phase] += 1;
    }
  }
  offset = page.offset;
} while (offset);

const missingKeys = [...reviewRows.keys()].filter((key) => !storedKeys.has(key));
const duplicateKeys = [...storedKeys].filter(([, count]) => count > 1);
if (missingKeys.length || duplicateKeys.length) {
  throw new Error(
    `Review migration verification failed: ${missingKeys.length} missing key(s), ${duplicateKeys.length} duplicate key(s).`,
  );
}

console.log(
  `Migrated ${rows.length} new review record(s) from "${submissionsTable}" into "${reviewsTable}".`,
);
console.log(
  `Verified ${phaseCounts.preliminary} preliminary and ${phaseCounts.final} final review record(s), with no duplicate keys.`,
);
