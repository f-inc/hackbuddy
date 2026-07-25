const required = [
  "AIRTABLE_API_KEY",
  "AIRTABLE_BASE_ID",
  "AIRTABLE_TABLE_NAME",
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required.`);
  }
}

const apply = process.argv.includes("--apply");
const tableUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(process.env.AIRTABLE_TABLE_NAME)}`;
const headers = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
};

async function airtable(path = "", init) {
  const response = await fetch(`${tableUrl}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(
      `Airtable request failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json();
}

async function records() {
  const all = [];
  let offset;
  do {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: `{Status}='completed'`,
    });
    if (offset) params.set("offset", offset);
    const page = await airtable(`?${params}`);
    all.push(...page.records);
    offset = page.offset;
  } while (offset);
  return all;
}

function legacyReview(record) {
  const fields = record.fields;
  if (typeof fields.Reviews === "string" && fields.Reviews.trim()) return null;
  const progressScore = fields["Progress Score"];
  const practicalityScore = fields["Practicality Score"];
  const complexityScore = fields["Technical Complexity Score"];
  if (
    !Number.isFinite(progressScore) ||
    !Number.isFinite(practicalityScore) ||
    !Number.isFinite(complexityScore)
  ) {
    return null;
  }
  return {
    judgeName:
      typeof fields["Claimed By"] === "string" && fields["Claimed By"].trim()
        ? fields["Claimed By"].trim().toLowerCase()
        : "legacy judge",
    progressScore,
    practicalityScore,
    complexityScore,
    totalScore:
      Number.isFinite(fields.Score)
        ? fields.Score
        : progressScore + practicalityScore + complexityScore,
    notes:
      typeof fields["Judge Notes"] === "string" ? fields["Judge Notes"] : "",
    completedAt:
      typeof fields["Completed At"] === "string" ? fields["Completed At"] : "",
  };
}

const migrations = (await records())
  .map((record) => ({ record, review: legacyReview(record) }))
  .filter(({ review }) => review !== null);

console.log(
  `${apply ? "Migrating" : "Would migrate"} ${migrations.length} legacy first-review records.`,
);

if (!apply || migrations.length === 0) process.exit(0);

for (let index = 0; index < migrations.length; index += 10) {
  const batch = migrations.slice(index, index + 10);
  await airtable("", {
    method: "PATCH",
    body: JSON.stringify({
      records: batch.map(({ record, review }) => ({
        id: record.id,
        fields: {
          Reviews: JSON.stringify([review]),
          Status: "available",
          "Claimed By": null,
          "Claimed At": null,
          "Claim Token": null,
          "Completed At": null,
        },
      })),
    }),
  });
}

console.log(`Migrated ${migrations.length} records successfully.`);
