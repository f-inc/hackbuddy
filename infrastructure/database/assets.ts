import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ConfigurationError } from "@/server/http/errors";
export type ImportedAsset = {
  id: string;
  eventId: string;
  submissionId?: string;
  sourceField?: string;
  storageProvider?: "r2";
  bucket: string;
  path: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  sourceAttachmentId: string;
};
let client: S3Client | undefined;
function storageClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)
    throw new ConfigurationError(
      "Configure the server-only R2 account and access keys to serve imported files.",
    );
  return (client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
  }));
}
export async function checkStorageBucket(bucket: string) {
  await storageClient().send(new HeadBucketCommand({ Bucket: bucket }));
}
export async function uploadStoredAsset(
  asset: Pick<ImportedAsset, "bucket" | "path" | "contentType">,
  body: Uint8Array,
  md5: string,
) {
  await storageClient().send(
    new PutObjectCommand({
      Bucket: asset.bucket,
      Key: asset.path,
      Body: body,
      ContentType: asset.contentType,
      ContentMD5: md5,
      IfNoneMatch: "*",
      CacheControl: "private, max-age=3600",
    }),
  );
}
export async function fetchStoredAsset(
  asset: Pick<ImportedAsset, "bucket" | "path">,
  range?: string | null,
  head = false,
) {
  try {
    const input = { Bucket: asset.bucket, Key: asset.path, ...(range ? { Range: range } : {}) };
    const result = head
      ? await storageClient().send(new HeadObjectCommand(input))
      : await storageClient().send(new GetObjectCommand(input));
    const headers = new Headers({ "accept-ranges": "bytes" });
    if (result.ContentType) headers.set("content-type", result.ContentType);
    if (result.ContentLength !== undefined)
      headers.set("content-length", String(result.ContentLength));
    if (result.ContentRange) headers.set("content-range", result.ContentRange);
    if (result.ETag) headers.set("etag", result.ETag);
    if (result.LastModified) headers.set("last-modified", result.LastModified.toUTCString());
    const body = "Body" in result && result.Body ? result.Body.transformToWebStream() : null;
    return new Response(head ? null : body, { status: result.ContentRange ? 206 : 200, headers });
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 416) return new Response(null, { status });
    throw error;
  }
}
