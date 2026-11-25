import assert from "node:assert/strict";
import { test } from "node:test";
import { createPendingUpload, createShare, finalizePendingUpload, getFile, getPendingUpload, getShare, isExpired } from "../src/lib/shares.ts";

test("local share stores bytes and enforces expiry", async () => {
  const file = new File(["hello, Cloud Drop"], "hello.txt", { type: "text/plain" });
  const share = await createShare(file, "1m");
  assert.match(share.id, /^[a-f0-9]{32}$/);
  assert.equal((await getFile(share.id)).toString(), "hello, Cloud Drop");
  assert.deepEqual(await getShare(share.id), share);
  assert.equal(isExpired(share, new Date(share.expiresAt).getTime() - 1), false);
  assert.equal(isExpired(share, new Date(share.expiresAt).getTime()), true);
  assert.equal(await getShare("../missing"), null);
});

test("S3 pending metadata becomes a share only after finalization", async () => {
  const pending = await createPendingUpload({ filename: "report.pdf", contentType: "application/pdf", size: 100, expiry: "1h" });
  assert.match(pending.objectKey, /^uploads\/[a-f0-9]{32}$/);
  assert.deepEqual(await getPendingUpload(pending.id), pending);
  const share = await finalizePendingUpload(pending);
  assert.equal(share.storage, "s3");
  assert.equal(share.objectKey, pending.objectKey);
  assert.equal(await getPendingUpload(pending.id), null);
  assert.deepEqual(await getShare(share.id), share);
});
