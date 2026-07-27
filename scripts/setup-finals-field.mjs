import { readFile } from "node:fs/promises";

const envText = await readFile(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const required = ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "AIRTABLE_TABLE_NAME"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const fieldName = process.env.AIRTABLE_FINAL_JUDGING_FIELD || "Final Judging";
const headers = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
};
const metaUrl = `https://api.airtable.com/v0/meta/bases/${process.env.AIRTABLE_BASE_ID}/tables`;
const response = await fetch(metaUrl, { headers });
if (!response.ok) {
  throw new Error(`Could not inspect Airtable schema (${response.status}).`);
}

const metadata = await response.json();
const table = metadata.tables.find(
  (candidate) => candidate.name === process.env.AIRTABLE_TABLE_NAME,
);
if (!table) throw new Error("Configured Airtable table was not found.");

if (table.fields.some((candidate) => candidate.name === fieldName)) {
  console.log(`"${fieldName}" already exists on "${table.name}".`);
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.log(`"${fieldName}" is missing from "${table.name}".`);
  process.exit(2);
}

const createResponse = await fetch(
  `${metaUrl}/${table.id}/fields`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: fieldName,
      type: "multilineText",
    }),
  },
);
if (!createResponse.ok) {
  throw new Error(`Could not create Airtable field (${createResponse.status}).`);
}

console.log(`Created "${fieldName}" on "${table.name}".`);
