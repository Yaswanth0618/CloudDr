import { getFile, getShare, isExpired } from "@/lib/shares";
import { authorizeDownload } from "@/lib/s3";
import { clientAddress, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const share = await getShare(id);
    if (!share) return new Response("Share not found.", { status: 404 });
    if (isExpired(share)) return new Response("This share has expired.", { status: 410 });
    await enforceRateLimit("download-ip-share", `${clientAddress(request)}:${id}`, 60, 60);
    await enforceRateLimit("download-share", id, 300, 60);
    if (share.storage === "s3") {
      if (!share.objectKey) return new Response("Share data is incomplete.", { status: 500 });
      const remaining = Math.floor((new Date(share.expiresAt).getTime() - Date.now()) / 1000);
      if (remaining < 1) return new Response("This share has expired.", { status: 410 });
      const url = await authorizeDownload(share.objectKey, share.filename, Math.min(60, remaining));
      return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
    }
    const file = await getFile(id);
    const encodedName = encodeURIComponent(share.filename);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": share.contentType,
        "Content-Length": String(file.length),
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const limited = rateLimitResponse(error);
    if (limited) return limited;
    console.error("Local download failed:", error);
    return new Response("Download is unavailable.", { status: 500 });
  }
}
