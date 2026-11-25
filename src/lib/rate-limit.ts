import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

type Limit = { count: number; resetsAt: number };
const local = new Map<string, Limit>();

export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("Too many requests. Try again later.");
    this.retryAfter = retryAfter;
  }
}

export function clientAddress(request: Request) {
  // CloudFront appends the viewer address to X-Forwarded-For. A global quota
  // supplements this identifier because proxy chains can vary by deployment.
  const values = request.headers.get("x-forwarded-for")?.split(",") || [];
  const candidate = values.at(-1)?.trim() || "";
  return isIP(candidate) ? candidate : "unknown";
}

export async function enforceRateLimit(scope: string, subject: string, limit: number, windowSeconds: number, now = Date.now()) {
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds;
  const resetsAt = windowStart + windowSeconds;
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  const key = `RATE#${scope}#${subjectHash}#${windowStart}`;

  if (process.env.STORAGE_MODE === "aws") {
    const region = process.env.CLOUD_DROP_REGION;
    const table = process.env.CLOUD_DROP_TABLE;
    if (!region || !table) throw new Error("Production rate limiting requires CLOUD_DROP_REGION and CLOUD_DROP_TABLE.");
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    try {
      await client.send(new UpdateCommand({
        TableName: table,
        Key: { pk: key },
        UpdateExpression: "SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: { "#count": "count", "#ttl": "ttl" },
        ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":ttl": resetsAt + 86400, ":limit": limit },
      }));
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        throw new RateLimitError(Math.max(1, resetsAt - Math.floor(now / 1000)));
      }
      throw error;
    }
    return;
  }

  const current = local.get(key);
  if (current && current.count >= limit) throw new RateLimitError(Math.max(1, resetsAt - Math.floor(now / 1000)));
  local.set(key, { count: (current?.count || 0) + 1, resetsAt });
  if (local.size > 5000) {
    for (const [entry, value] of local) if (value.resetsAt <= Math.floor(now / 1000)) local.delete(entry);
  }
}

export function rateLimitResponse(error: unknown) {
  if (!(error instanceof RateLimitError)) return null;
  return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } });
}
