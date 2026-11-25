import { createShare, EXPIRY_SECONDS, MAX_FILE_BYTES, storageMode, type ExpiryChoice } from "@/lib/shares";
import { clientAddress, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    if (storageMode() !== "local") return Response.json({ error: "Local upload route is unavailable in S3 mode." }, { status: 409 });
    await enforceRateLimit("local-upload-ip", clientAddress(request), 30, 3600);
    const length = Number(request.headers.get("content-length"));
    if (length > MAX_FILE_BYTES + 64 * 1024) {
      return Response.json({ error: "File exceeds the 10 MiB limit." }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    const expiry = form.get("expiry");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Choose a non-empty file to upload." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "File exceeds the 10 MiB limit." }, { status: 413 });
    }
    if (typeof expiry !== "string" || !(expiry in EXPIRY_SECONDS)) {
      return Response.json({ error: "Choose a valid expiration time." }, { status: 400 });
    }
    const share = await createShare(file, expiry as ExpiryChoice);
    return Response.json({ share }, { status: 201 });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    console.error("Local upload failed:", error);
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "Production storage is not configured. Cloud Drop currently supports local development only." }, { status: 503 });
    }
    return Response.json({ error: "Upload failed. Check that local storage is available, then retry." }, { status: 500 });
  }
}
