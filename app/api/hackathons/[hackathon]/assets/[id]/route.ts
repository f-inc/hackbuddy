import { withHackathonRequest } from "@/lib/hackathon-request";
import { currentEventConfig } from "@/lib/event-context";
import { requireDatabasePool } from "@/infrastructure/database/events";
import { fetchStoredAsset, type ImportedAsset } from "@/infrastructure/database/assets";
import { errorResponse, NotFoundError, UpstreamError } from "@/server/http/errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ hackathon: string; id: string }> };
async function serve(request: Request, { params }: Context, head = false) {
  const { hackathon, id } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const event = currentEventConfig();
      if (event?.storage !== "database") throw new NotFoundError("File not found.");
      const row = (
        await requireDatabasePool().query(
          "SELECT * FROM public.hackbuddy_assets WHERE id=$1 AND event_id=$2",
          [id, event.id],
        )
      ).rows[0];
      if (!row) throw new NotFoundError("File not found.");
      const asset: Pick<ImportedAsset, "bucket" | "path"> = {
        bucket: row.bucket,
        path: row.object_path,
      };
      const upstream = await fetchStoredAsset(asset, request.headers.get("range"), head);
      if (!upstream.ok && upstream.status !== 416)
        throw new UpstreamError("The imported file could not be loaded.");
      const headers = new Headers({
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      });
      for (const name of [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
      ]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      const inline =
        /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|ogg))$/i.test(
          row.content_type,
        );
      headers.set(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      );
      if (!inline) headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
      return new Response(head ? null : upstream.body, { status: upstream.status, headers });
    } catch (error) {
      return errorResponse(error, "The file could not be loaded.");
    }
  });
}
export const GET = (request: Request, context: Context) => serve(request, context);
export const HEAD = (request: Request, context: Context) => serve(request, context, true);
