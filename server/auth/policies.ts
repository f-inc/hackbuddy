import { getSession, type Session } from "@/lib/auth";
import { hasAirtableRequestContext } from "@/lib/airtable-context";
import { ForbiddenError, UnauthorizedError } from "@/server/http/errors";

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") throw new ForbiddenError();
  return session;
}

export async function requireHackathonSession(): Promise<Session> {
  const session = await requireSession();
  if (session.role === "judge" && !hasAirtableRequestContext()) {
    throw new ForbiddenError("Use the API path for your hackathon.");
  }
  return session;
}

