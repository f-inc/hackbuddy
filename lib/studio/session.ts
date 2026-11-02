import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/server/config/env";
import type { StudioActor } from "@/domain/studio/model";
const NAME = "hackbuddy_studio";
const sign = (p: string) =>
  createHmac("sha256", authSecret()).update(p).digest("base64url");
export async function session(judge = false): Promise<StudioActor | null> {
  const value = (await cookies()).get(judge ? NAME + "_judge" : NAME)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const a = Buffer.from(signature),
    b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      !v ||
      !["organizer", "judge"].includes(v.role) ||
      typeof v.orgId !== "string" ||
      typeof v.name !== "string" ||
      typeof v.expires !== "number" ||
      v.expires < Date.now()
    )
      return null;
    if (
      v.role === "judge" &&
      (typeof v.eventId !== "string" || typeof v.judgeId !== "string")
    )
      return null;
    return v as StudioActor;
  } catch {
    return null;
  }
}
export async function setSession(actor: StudioActor) {
  const expires = Date.now() + 12 * 3600000;
  const p = Buffer.from(JSON.stringify({ ...actor, expires })).toString(
    "base64url",
  );
  (await cookies()).set(
    actor.role === "judge" ? NAME + "_judge" : NAME,
    `${p}.${sign(p)}`,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(expires),
      path: "/",
    },
  );
}
export async function clearSession(judge = false) {
  (await cookies()).delete(judge ? NAME + "_judge" : NAME);
}
