import { readFile } from "node:fs/promises";

const envText = await readFile(
  new URL("../.env.local", import.meta.url),
  "utf8",
).catch((error) => {
  if (error.code === "ENOENT") return "";
  throw error;
});
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

for (const name of ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const registryName = process.env.AIRTABLE_HACKATHONS_TABLE || "Hackathons";
const fieldNames = {
  name: process.env.AIRTABLE_HACKATHON_NAME_FIELD || "Name",
  slug: process.env.AIRTABLE_HACKATHON_SLUG_FIELD || "Slug",
  base: process.env.AIRTABLE_HACKATHON_BASE_ID_FIELD || "Airtable Base ID",
  table:
    process.env.AIRTABLE_HACKATHON_TABLE_NAME_FIELD || "Airtable Table Name",
  reviewsTable:
    process.env.AIRTABLE_HACKATHON_REVIEWS_TABLE_NAME_FIELD ||
    "Airtable Reviews Table Name",
  image: process.env.AIRTABLE_HACKATHON_IMAGE_URL_FIELD || "Image URL",
  squareImage:
    process.env.AIRTABLE_HACKATHON_SQUARE_IMAGE_URL_FIELD || "Square Image URL",
  active: process.env.AIRTABLE_HACKATHON_ACTIVE_FIELD || "Active",
  scoringPolicy:
    process.env.AIRTABLE_HACKATHON_SCORING_POLICY_FIELD || "Scoring Policy",
  publishedResults:
    process.env.AIRTABLE_HACKATHON_PUBLISHED_RESULTS_FIELD ||
    "Published Results",
};
const headers = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
};
const metaUrl = `https://api.airtable.com/v0/meta/bases/${process.env.AIRTABLE_BASE_ID}/tables`;
const response = await fetch(metaUrl, { headers });
if (!response.ok) {
  throw new Error(
    `Could not inspect Airtable schema (${response.status}). The token needs schema.bases:read and schema.bases:write.`,
  );
}

const metadata = await response.json();
let table = metadata.tables.find(
  (candidate) => candidate.name === registryName,
);
if (!table) {
  const createResponse = await fetch(metaUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: registryName,
      description: "HackBuddy event registry",
      fields: [
        { name: fieldNames.name, type: "singleLineText" },
        { name: fieldNames.slug, type: "singleLineText" },
        { name: fieldNames.base, type: "singleLineText" },
        { name: fieldNames.table, type: "singleLineText" },
        { name: fieldNames.reviewsTable, type: "singleLineText" },
        { name: fieldNames.image, type: "url" },
        { name: fieldNames.squareImage, type: "url" },
        { name: fieldNames.scoringPolicy, type: "singleLineText" },
        { name: fieldNames.publishedResults, type: "multilineText" },
        {
          name: fieldNames.active,
          type: "checkbox",
          options: { icon: "check", color: "greenBright" },
        },
      ],
    }),
  });
  if (!createResponse.ok) {
    throw new Error(
      `Could not create "${registryName}" (${createResponse.status}): ${await createResponse.text()}`,
    );
  }
  table = await createResponse.json();
  console.log(`Created "${registryName}".`);
} else {
  console.log(`"${registryName}" already exists.`);
}

for (const missingField of [
  { name: fieldNames.scoringPolicy, type: "singleLineText" },
  { name: fieldNames.publishedResults, type: "multilineText" },
  { name: fieldNames.base, type: "singleLineText" },
  { name: fieldNames.reviewsTable, type: "singleLineText" },
  { name: fieldNames.image, type: "url" },
  { name: fieldNames.squareImage, type: "url" },
]) {
  if (!table.fields.some((field) => field.name === missingField.name)) {
    const fieldResponse = await fetch(`${metaUrl}/${table.id}/fields`, {
      method: "POST",
      headers,
      body: JSON.stringify(missingField),
    });
    if (!fieldResponse.ok) {
      throw new Error(
        `Could not create "${missingField.name}" (${fieldResponse.status}): ${await fieldResponse.text()}`,
      );
    }
    console.log(`Created "${missingField.name}" on "${registryName}".`);
  }
}

const legacyTable = process.env.AIRTABLE_TABLE_NAME?.trim();
const dataUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(registryName)}`;
const listResponse = await fetch(`${dataUrl}?maxRecords=100`, { headers });
if (!listResponse.ok) {
  throw new Error(
    `Could not inspect registry records (${listResponse.status}).`,
  );
}
const records = (await listResponse.json()).records;
const registryMigrations = records
  .map((record) => {
    const fields = {};
    if (!String(record.fields[fieldNames.base] || "").trim()) {
      fields[fieldNames.base] = process.env.AIRTABLE_BASE_ID;
    }
    if (!String(record.fields[fieldNames.reviewsTable] || "").trim()) {
      const eventName = String(
        record.fields[fieldNames.name] || "Hackathon",
      ).trim();
      fields[fieldNames.reviewsTable] = `${eventName} - Reviews`;
    }
    return { id: record.id, fields };
  })
  .filter((record) => Object.keys(record.fields).length);
for (let index = 0; index < registryMigrations.length; index += 10) {
  const migrateResponse = await fetch(dataUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      records: registryMigrations.slice(index, index + 10),
    }),
  });
  if (!migrateResponse.ok) {
    throw new Error(
      `Could not update registry records (${migrateResponse.status}): ${await migrateResponse.text()}`,
    );
  }
}
if (registryMigrations.length) {
  console.log(`Updated ${registryMigrations.length} registry record(s).`);
}

if (legacyTable) {
  const slug = process.env.DEFAULT_HACKATHON_SLUG || "nighthack3";
  const exists = records.some(
    (record) => String(record.fields[fieldNames.slug] || "").trim() === slug,
  );
  if (!exists) {
    const seedResponse = await fetch(dataUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        records: [
          {
            fields: {
              [fieldNames.name]:
                process.env.DEFAULT_HACKATHON_NAME || "Night Hack III",
              [fieldNames.slug]: slug,
              [fieldNames.base]: process.env.AIRTABLE_BASE_ID,
              [fieldNames.table]: legacyTable,
              [fieldNames.reviewsTable]:
                process.env.AIRTABLE_REVIEWS_TABLE_NAME ||
                `${process.env.DEFAULT_HACKATHON_NAME || "Night Hack III"} - Reviews`,
              ...(process.env.DEFAULT_HACKATHON_IMAGE_URL
                ? {
                    [fieldNames.image]: process.env.DEFAULT_HACKATHON_IMAGE_URL,
                  }
                : {}),
              ...(process.env.DEFAULT_HACKATHON_SQUARE_IMAGE_URL
                ? {
                    [fieldNames.squareImage]:
                      process.env.DEFAULT_HACKATHON_SQUARE_IMAGE_URL,
                  }
                : {}),
              [fieldNames.active]: true,
            },
          },
        ],
      }),
    });
    if (!seedResponse.ok) {
      throw new Error(
        `Could not seed the default event (${seedResponse.status}).`,
      );
    }
    console.log(`Added default event "${slug}".`);
  }
}
