import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng, newSeed } from "./rng";

test("M2 — the same seed reproduces the same stream exactly", () => {
  const a = createRng("seed-alpha");
  const b = createRng("seed-alpha");
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});

test("different seeds give different streams", () => {
  const a = createRng("seed-alpha");
  const b = createRng("seed-beta");
  const diffs = Array.from({ length: 100 }, () => a() - b()).filter((d) => d !== 0);
  assert.equal(diffs.length, 100);
});

test("output stays in [0, 1)", () => {
  const rng = createRng("bounds");
  for (let i = 0; i < 100_000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("the distribution is flat enough for Monte Carlo use", () => {
  const rng = createRng("uniformity");
  const buckets = new Array(10).fill(0);
  const n = 200_000;
  for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]++;
  for (const count of buckets) {
    // Each bucket should hold ~n/10; allow 2% relative slack.
    assert.ok(Math.abs(count - n / 10) < (n / 10) * 0.02, `bucket skew: ${count} vs ${n / 10}`);
  }
});

test("mean and variance match a uniform distribution", () => {
  const rng = createRng("moments");
  const n = 200_000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = rng();
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  assert.ok(Math.abs(mean - 0.5) < 0.005, `mean ${mean}`);
  assert.ok(Math.abs(variance - 1 / 12) < 0.005, `variance ${variance}`);
});

test("no short cycle over a long stream", () => {
  const rng = createRng("cycle");
  const seen = new Set<number>();
  for (let i = 0; i < 100_000; i++) seen.add(rng());
  // Collisions are possible at 2^-32 granularity but should be vanishingly rare.
  assert.ok(seen.size > 99_990, `only ${seen.size} distinct values`);
});

test("newSeed produces distinct seeds", () => {
  const seeds = new Set(Array.from({ length: 200 }, () => newSeed()));
  assert.ok(seeds.size > 190, `only ${seeds.size} distinct seeds`);
});
