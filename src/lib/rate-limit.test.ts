import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./rate-limit";

// Time is injected on every call, so these are deterministic — no sleeping,
// no flake, and the window-boundary case below is actually testable.
test("S7 — requests inside the limit are allowed, and remaining counts down", () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
  assert.deepEqual(rl.check("k", 0), { allowed: true, remaining: 2, retryAfterSeconds: 0 });
  assert.deepEqual(rl.check("k", 10), { allowed: true, remaining: 1, retryAfterSeconds: 0 });
  assert.deepEqual(rl.check("k", 20), { allowed: true, remaining: 0, retryAfterSeconds: 0 });
});

test("S7 — the request over the limit is refused", () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
  for (const t of [0, 10, 20]) rl.check("k", t);
  const over = rl.check("k", 30);
  assert.equal(over.allowed, false);
  assert.equal(over.remaining, 0);
  assert.ok(over.retryAfterSeconds >= 1);
});

test("S7 — a refused request does not extend the window", () => {
  // A limiter that records rejections pushes its own window forward and can
  // lock a client out indefinitely under sustained load.
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  rl.check("k", 0);
  rl.check("k", 100);
  for (let t = 200; t < 900; t += 100) assert.equal(rl.check("k", t).allowed, false);
  // The first two still age out on their original schedule.
  assert.equal(rl.check("k", 1001).allowed, true);
});

test("S7 — the window SLIDES, so a boundary cannot be used to fire 2x the limit", () => {
  // This is the whole reason for a timestamp log over a fixed counter: with
  // fixed buckets, 3 requests at the end of one window plus 3 at the start of
  // the next is 6 in a fraction of the window length.
  const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
  for (const t of [900, 950, 990]) assert.equal(rl.check("k", t).allowed, true);
  for (const t of [1010, 1050, 1090]) {
    assert.equal(rl.check("k", t).allowed, false, `t=${t} should be refused`);
  }
  // Only once the first one is genuinely a second old does capacity return.
  assert.equal(rl.check("k", 1901).allowed, true);
});

test("S7 — keys are independent, so one user cannot exhaust another's budget", () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  rl.check("user-a", 0);
  rl.check("user-a", 1);
  assert.equal(rl.check("user-a", 2).allowed, false);
  assert.equal(rl.check("user-b", 2).allowed, true);
});

test("S7 — retryAfter is when capacity actually returns, rounded up", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 10_000 });
  rl.check("k", 0);
  const refused = rl.check("k", 2_500);
  assert.equal(refused.allowed, false);
  // 7.5s remain; a client that waits 7s would be refused again, so it ceils.
  assert.equal(refused.retryAfterSeconds, 8);
  assert.equal(rl.check("k", 2_500 + 8_000).allowed, true);
});

test("S7 — retryAfter is never 0 on a refusal", () => {
  // A Retry-After of 0 invites an immediate retry, which is a hot loop.
  const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
  rl.check("k", 0);
  assert.ok(rl.check("k", 999).retryAfterSeconds >= 1);
});

test("S7 — key storage is bounded, so a spray of keys cannot grow it without end", () => {
  const rl = createRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 50 });
  for (let i = 0; i < 500; i++) rl.check(`key-${i}`, i);
  // A hard bound, not just expiry: every one of these 500 keys is still
  // inside the window, so expiry alone would prune nothing and the map would
  // hold all 500. maxKeys + 1 allows for the between-sweep overshoot.
  assert.ok(rl.size() <= 51, `expected bounded storage, got ${rl.size()}`);
});

test("S7 — an idle key is forgotten and starts fresh", () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  rl.check("k", 0);
  rl.check("k", 1);
  assert.equal(rl.check("k", 5000).allowed, true);
  assert.equal(rl.check("k", 5001).allowed, true);
  assert.equal(rl.check("k", 5002).allowed, false);
});
