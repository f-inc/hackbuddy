import { passwordMatches, setSession } from "@/lib/auth";
import { getHackathon, normalizeHackathonSlug } from "@/lib/hackathons";
import { loginPasswords } from "@/server/config/env";
import {
  errorResponse,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/http/errors";
import {
  parseLoginRequest,
  readJson,
} from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = parseLoginRequest(await readJson(request));
    const passwords = loginPasswords();
    const role = passwordMatches(body.password, passwords.admin)
      ? "admin"
      : passwordMatches(body.password, passwords.judge)
        ? "judge"
        : null;
    if (!role) throw new UnauthorizedError("That password is not valid.");

    const requestedHackathon = body.hackathon
      ? normalizeHackathonSlug(body.hackathon)
      : undefined;
    if (role === "judge" && !requestedHackathon) {
      throw new ValidationError("Use the sign-in link for your hackathon.");
    }
    if (requestedHackathon && !(await getHackathon(requestedHackathon))) {
      throw new NotFoundError("That hackathon is not available.");
    }

    await setSession(body.name, role, requestedHackathon);
    return NextResponse.json({
      ok: true,
      role,
      redirectTo:
        role === "admin" && !requestedHackathon
          ? "/hackathons"
          : `/${requestedHackathon}/dashboard`,
    });
  } catch (error) {
    return errorResponse(error, "Sign in could not be completed.");
  }
}
