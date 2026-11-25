import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { commitShare, putPending, readPending, readShare } from "./dynamo.ts";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const EXPIRY_SECONDS = { "1m": 60, "1h": 3600, "1d": 86400, "7d": 604800 } as const;
export type ExpiryChoice = keyof typeof EXPIRY_SECONDS;

export type Share = {
  id: string;
  storage?: "local" | "s3";
  objectKey?: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  expiresAt: string;
};

export type PendingUpload = {
  id: string;
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
  expiry: ExpiryChoice;
  createdAt: string;
};

export function storageMode(): "local" | "s3" | "aws" {
  const mode = process.env.STORAGE_MODE || "local";
  if (mode !== "local" && mode !== "s3" && mode !== "aws") throw new Error("STORAGE_MODE must be local, s3, or aws.");
  if (process.env.NODE_ENV === "production" && mode !== "aws") {
    throw new Error("Production requires STORAGE_MODE=aws with durable metadata and rate limits.");
  }
  if (mode === "aws" && (!process.env.CLOUD_DROP_REGION || !process.env.CLOUD_DROP_BUCKET || !process.env.CLOUD_DROP_TABLE)) {
    throw new Error("AWS mode requires CLOUD_DROP_REGION, CLOUD_DROP_BUCKET, and CLOUD_DROP_TABLE.");
  }
  return mode;
}

function storageRoot() {
  if (storageMode() === "aws") throw new Error("Local filesystem storage is unavailable in AWS mode.");
  return path.join(process.cwd(), ".local-data");
}

function paths(id: string) {
  const root = storageRoot();
  return { root, file: path.join(root, "files", id), meta: path.join(root, "shares", `${id}.json`) };
}

export function validShareId(id: string) {
  return /^[a-f0-9]{32}$/.test(id);
}

export function isExpired(share: Share, now = Date.now()) {
  return new Date(share.expiresAt).getTime() <= now;
}

export async function createShare(file: File, expiry: ExpiryChoice): Promise<Share> {
  const id = randomBytes(16).toString("hex");
  const { root, file: filePath, meta } = paths(id);
  await mkdir(path.join(root, "files"), { recursive: true });
  await mkdir(path.join(root, "shares"), { recursive: true });
  const createdAt = new Date();
  const share: Share = {
    id,
    storage: "local",
    filename: file.name.replace(/[\r\n/\\]/g, "_").slice(0, 255) || "download",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + EXPIRY_SECONDS[expiry] * 1000).toISOString(),
  };
  const tempFile = `${filePath}.tmp`;
  try {
    await writeFile(tempFile, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    await rename(tempFile, filePath);
    await writeFile(meta, JSON.stringify(share), { flag: "wx" });
    return share;
  } catch (error) {
    await Promise.allSettled([unlink(tempFile), unlink(filePath)]);
    throw error;
  }
}

export async function createPendingUpload(input: Omit<PendingUpload, "id" | "objectKey" | "createdAt">): Promise<PendingUpload> {
  const pending: PendingUpload = {
    ...input,
    id: randomBytes(16).toString("hex"),
    objectKey: `uploads/${randomBytes(16).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };
  if (storageMode() === "aws") {
    await putPending(pending);
    return pending;
  }
  const root = storageRoot();
  await mkdir(path.join(root, "pending"), { recursive: true });
  await writeFile(path.join(root, "pending", `${pending.id}.json`), JSON.stringify(pending), { flag: "wx" });
  return pending;
}

export async function getPendingUpload(id: string): Promise<PendingUpload | null> {
  if (!validShareId(id)) return null;
  if (storageMode() === "aws") {
    const pending = await readPending(id);
    if (!pending || new Date(pending.createdAt).getTime() + 10 * 60_000 < Date.now()) return null;
    return pending;
  }
  try {
    const data = await readFile(path.join(storageRoot(), "pending", `${id}.json`), "utf8");
    const pending = JSON.parse(data) as PendingUpload;
    if (new Date(pending.createdAt).getTime() + 10 * 60_000 < Date.now()) return null;
    return pending;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function finalizePendingUpload(pending: PendingUpload): Promise<Share> {
  const createdAt = new Date();
  const share: Share = {
    id: randomBytes(16).toString("hex"),
    storage: "s3",
    objectKey: pending.objectKey,
    filename: pending.filename,
    contentType: pending.contentType,
    size: pending.size,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + EXPIRY_SECONDS[pending.expiry] * 1000).toISOString(),
  };
  if (storageMode() === "aws") {
    await commitShare(pending, share);
    return share;
  }
  const root = storageRoot();
  const pendingPath = path.join(root, "pending", `${pending.id}.json`);
  const claimedPath = path.join(root, "pending", `${pending.id}.claimed`);
  await rename(pendingPath, claimedPath);
  try {
    await mkdir(path.join(root, "shares"), { recursive: true });
    await writeFile(path.join(root, "shares", `${share.id}.json`), JSON.stringify(share), { flag: "wx" });
  } catch (error) {
    await rename(claimedPath, pendingPath);
    throw error;
  }
  await unlink(claimedPath).catch(() => {});
  return share;
}

export async function getShare(id: string): Promise<Share | null> {
  if (!validShareId(id)) return null;
  if (storageMode() === "aws") return readShare(id);
  try {
    const data = await readFile(paths(id).meta, "utf8");
    return JSON.parse(data) as Share;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getFile(id: string): Promise<Buffer> {
  return readFile(paths(id).file);
}
