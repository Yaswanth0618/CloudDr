import { authorizeUpload } from "@/lib/s3";
import { createPendingUpload, EXPIRY_SECONDS, MAX_FILE_BYTES, storageMode, type ExpiryChoice } from "@/lib/shares";
import { clientAddress, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    const mode = storageMode();
    if (mode !== "s3" && mode !== "aws") return Response.json({ error: "S3 mode is not enabled." }, { status: 409 });
    await enforceRateLimit("upload-ip", clientAddress(request), mode === "aws" ? 3 : 30, 3600);
    await enforceRateLimit("upload-global", "all", mode === "aws" ? 100 : 1000, 86400);
    const body = await request.json() as Record<string, unknown>;
    const { filename, contentType, size, expiry } = body;
    if (typeof filename !== "string" || !filename.trim() || typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) {
      return Response.json({ error: "Choose a non-empty file no larger than 10 MiB." }, { status: 400 });
    }
    if (typeof expiry !== "string" || !(expiry in EXPIRY_SECONDS)) {
      return Response.json({ error: "Choose a valid expiration time." }, { status: 400 });
    }
    const pending = await createPendingUpload({
      filename: filename.replace(/[\r\n/\\]/g, "_").slice(0, 255),
      contentType: typeof contentType === "string" && contentType ? contentType.slice(0, 255) : "application/octet-stream",
      size,
      expiry: expiry as ExpiryChoice,
    });
    const post = await authorizeUpload(pending.objectKey, pending.contentType);
    return Response.json({ uploadId: pending.id, url: post.url, fields: post.fields });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    console.error("S3 authorization failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Could not authorize upload. Check server S3 configuration and your AWS profile." }, { status: 503 });
  }
}
