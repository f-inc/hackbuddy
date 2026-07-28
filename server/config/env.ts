import { ConfigurationError } from "@/server/http/errors";

function optional(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function airtableCredentials() {
  const apiKey = optional("AIRTABLE_API_KEY");
  const baseId = optional("AIRTABLE_BASE_ID");
  if (Boolean(apiKey) !== Boolean(baseId)) {
    throw new ConfigurationError(
      "AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be configured together.",
    );
  }
  return { apiKey, baseId };
}

export function requireAirtableApiKey() {
  const apiKey = optional("AIRTABLE_API_KEY");
  if (!apiKey) {
    throw new ConfigurationError("AIRTABLE_API_KEY is not configured.");
  }
  return apiKey;
}

export function authSecret() {
  const secret = optional("AUTH_SECRET");
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "development-only-change-me";
  }
  throw new ConfigurationError(
    "AUTH_SECRET must be configured in production.",
  );
}

export function loginPasswords() {
  const admin = optional("ADMIN_PASSWORD");
  const judge = optional("JUDGE_PASSWORD");
  if (!admin || !judge) {
    throw new ConfigurationError(
      "ADMIN_PASSWORD and JUDGE_PASSWORD must both be configured.",
    );
  }
  if (admin === judge) {
    throw new ConfigurationError(
      "ADMIN_PASSWORD and JUDGE_PASSWORD must be different.",
    );
  }
  return { admin, judge };
}
