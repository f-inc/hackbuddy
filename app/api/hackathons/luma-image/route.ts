import { requireAdmin } from "@/server/auth/policies";
import {
  errorResponse,
  UpstreamError,
  ValidationError,
} from "@/server/http/errors";
import { parseUrlRequest, readJson } from "@/server/http/validation";
import { NextResponse } from "next/server";

const LUMA_HOSTS = new Set(["lu.ma", "www.lu.ma", "luma.com", "www.luma.com"]);
const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 2_000_000;

function parseLumaUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ValidationError("Enter a valid Luma event URL.", { cause });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LUMA_HOSTS.has(url.hostname)
  ) {
    throw new ValidationError("Enter a valid Luma event URL.");
  }
  return url;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function findOpenGraphImage(html: string, pageUrl: URL) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )) {
      attributes.set(
        match[1].toLowerCase(),
        decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""),
      );
    }

    const property = (
      attributes.get("property") ||
      attributes.get("name") ||
      ""
    ).toLowerCase();
    if (property !== "og:image" && property !== "og:image:url") continue;

    const content = attributes.get("content");
    if (!content) continue;
    const imageUrl = new URL(content, pageUrl);
    if (!["http:", "https:"].includes(imageUrl.protocol)) continue;
    return imageUrl.toString();
  }

  throw new Error("This Luma event does not expose a preview image yet.");
}

function findSquareCoverImage(html: string) {
  const normalizedHtml = decodeHtmlAttribute(
    html.replaceAll("\\/", "/").replaceAll("\\u0026", "&"),
  );
  const candidates =
    normalizedHtml.match(
      /https:\/\/images\.lumacdn\.com\/[^\s"'<>]+\/event-covers\/[^\s"'<>]+/gi,
    ) || [];

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      const coverPathIndex = parsed.pathname.indexOf("/event-covers/");
      if (coverPathIndex < 0) continue;
      const coverPath = parsed.pathname.slice(coverPathIndex);
      return `https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=1,anim=false,background=white,quality=85,width=800,height=800${coverPath}`;
    } catch {
      continue;
    }
  }

  throw new Error("This Luma event does not expose square cover artwork.");
}

async function fetchLumaPage(initialUrl: URL) {
  let currentUrl = initialUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(currentUrl, {
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "HackBuddy/1.0 (event artwork preview)",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Luma returned an invalid redirect.");
      currentUrl = parseLumaUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error("Luma could not load that event.");
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) {
      throw new Error("The Luma event page was unexpectedly large.");
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    return { html, url: currentUrl };
  }

  throw new Error("The Luma event redirected too many times.");
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = parseUrlRequest(await readJson(request));
    const requestedUrl = parseLumaUrl(body.url);
    const page = await fetchLumaPage(requestedUrl);
    return NextResponse.json({
      imageUrl: findOpenGraphImage(page.html, page.url),
      squareImageUrl: findSquareCoverImage(page.html),
    });
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError"))
    ) {
      return errorResponse(
        new UpstreamError("Luma could not be reached.", { cause: error }),
      );
    }
    return errorResponse(error, "Could not find the Luma event image.");
  }
}
