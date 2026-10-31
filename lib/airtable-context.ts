import { AsyncLocalStorage } from "node:async_hooks";

type AirtableContext = {
  hackathonId?: string;
  baseId: string;
  tableName: string;
  reviewsTableName: string;
};

const airtableContext = new AsyncLocalStorage<AirtableContext>();

export function withAirtableConfig<T>(
  config: AirtableContext,
  operation: () => Promise<T>,
) {
  return airtableContext.run(config, operation);
}

export function currentAirtableBase() {
  return airtableContext.getStore()?.baseId || process.env.AIRTABLE_BASE_ID;
}

export function currentAirtableTable() {
  return (
    airtableContext.getStore()?.tableName || process.env.AIRTABLE_TABLE_NAME
  );
}

export function currentAirtableReviewsTable() {
  const configuredName =
    airtableContext.getStore()?.reviewsTableName ||
    process.env.AIRTABLE_REVIEWS_TABLE_NAME;
  if (configuredName) return configuredName;
  const hackathonName =
    process.env.DEFAULT_HACKATHON_NAME?.trim() || "Night Hack III";
  return `${hackathonName} - Reviews`;
}

export function hasAirtableRequestContext() {
  return Boolean(airtableContext.getStore());
}

export function currentHackathonId() {
  return airtableContext.getStore()?.hackathonId;
}
