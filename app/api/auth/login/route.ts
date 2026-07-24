import { passwordMatches, setSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    password?: string;
  };

  const role = body.password
    ? passwordMatches(body.password, process.env.ADMIN_PASSWORD)
      ? "admin"
      : passwordMatches(body.password, process.env.JUDGE_PASSWORD)
        ? "judge"
        : null
    : null;

  if (!role) {
    return NextResponse.json(
      { error: "That password is not valid." },
      { status: 401 },
    );
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Enter your name so submissions can be assigned to you." },
      { status: 400 },
    );
  }

  await setSession(name, role);
  return NextResponse.json({ ok: true, role, redirectTo: "/dashboard" });
}
