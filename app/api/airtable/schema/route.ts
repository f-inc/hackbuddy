import {
  listAirtableBases,
  listAirtableTables,
} from "@/lib/airtable-metadata";
import { requireAdmin } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const baseId = new URL(request.url).searchParams.get("baseId");
    if (baseId) {
      return NextResponse.json({
        tables: await listAirtableTables(baseId),
      });
    }
    return NextResponse.json({
      bases: await listAirtableBases(),
      defaultBaseId: process.env.AIRTABLE_BASE_ID || "",
    });
  } catch (error) {
    return errorResponse(error, "Could not inspect Airtable.");
  }
}
