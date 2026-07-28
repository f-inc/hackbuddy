import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/server/config/env";

export type Session = {
  role: "judge" | "admin";
  name: string;
  hackathon?: string;
  expiresAt: number;
};

const COOKIE_NAME = "hackbuddy_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function secret() {
  return authSecret();
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string): Session | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("expiresAt" in parsed) ||
      typeof parsed.expiresAt !== "number" ||
      !("name" in parsed) ||
      typeof parsed.name !== "string" ||
      !("role" in parsed) ||
      (parsed.role !== "admin" && parsed.role !== "judge") ||
      ("hackathon" in parsed &&
        parsed.hackathon !== undefined &&
        typeof parsed.hackathon !== "string")
    ) {
      return null;
    }
    if (parsed.expiresAt < Date.now()) return null;
    return {
      role: parsed.role,
      name: parsed.name,
      hackathon:
        "hackathon" in parsed && typeof parsed.hackathon === "string"
          ? parsed.hackathon
          : undefined,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  return value ? decodeSession(value) : null;
}

export async function setSession(
  name: string,
  role: Session["role"],
  hackathon?: string,
) {
  const store = await cookies();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const normalizedName = name.trim().toLowerCase();
  store.set(
    COOKIE_NAME,
    encodeSession({ name: normalizedName, role, hackathon, expiresAt }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(expiresAt),
      path: "/",
    },
  );
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export function passwordMatches(candidate: string, expected?: string) {
  if (!expected) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}
