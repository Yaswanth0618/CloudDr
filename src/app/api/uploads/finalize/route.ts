import { verifyUpload } from "@/lib/s3";
import { finalizePendingUpload, getPendingUpload, storageMode } from "@/lib/shares";
import { clientAddress, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    const mode = storageMode();
    if (mode !== "s3" && mode !== "aws") return Response.json({ error: "S3 mode is not enabled." }, { status: 409 });
    await enforceRateLimit("finalize-ip", clientAddress(request), mode === "aws" ? 12 : 60, 3600);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.uploadId !== "string") return Response.json({ error: "Upload ID is required." }, { status: 400 });
    const pending = await getPendingUpload(body.uploadId);
    if (!pending) return Response.json({ error: "Upload authorization is missing or expired. Start again." }, { status: 404 });
    const verified = await verifyUpload(pending.objectKey, pending.size, pending.contentType);
    if (!verified) return Response.json({ error: "Uploaded file did not match the authorized size or type." }, { status: 409 });
    const share = await finalizePendingUpload(pending);
    return Response.json({ share }, { status: 201 });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    console.error("S3 verification failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Could not verify the S3 object. Check the upload and retry." }, { status: 503 });
  }
}
