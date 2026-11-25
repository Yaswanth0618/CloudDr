import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAddress, enforceRateLimit, RateLimitError } from "../src/lib/rate-limit.ts";

test("local limits reject excess requests and reset in the next window", async () => {
  const first = 1_700_000_000_000;
  await enforceRateLimit("test", "one-visitor", 2, 60, first);
  await enforceRateLimit("test", "one-visitor", 2, 60, first);
  await assert.rejects(enforceRateLimit("test", "one-visitor", 2, 60, first), RateLimitError);
  await enforceRateLimit("test", "one-visitor", 2, 60, first + 60_000);
});

test("client address uses the proxy-appended address", () => {
  const request = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.7, 198.51.100.4" } });
  assert.equal(clientAddress(request), "198.51.100.4");
});
