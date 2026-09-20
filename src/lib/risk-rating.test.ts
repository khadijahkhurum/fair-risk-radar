import { test } from "node:test";
import assert from "node:assert/strict";
import { ratingFromAle, ratingFromProbability, riskScoreLabel } from "./risk-rating";

test("ratingFromAle bands are ordered and cover the full range", () => {
  assert.equal(ratingFromAle(0), 1);
  assert.equal(ratingFromAle(99_999), 1);
  assert.equal(ratingFromAle(100_000), 2);
  assert.equal(ratingFromAle(999_999), 2);
  assert.equal(ratingFromAle(1_000_000), 3);
  assert.equal(ratingFromAle(4_999_999), 3);
  assert.equal(ratingFromAle(5_000_000), 4);
  assert.equal(ratingFromAle(19_999_999), 4);
  assert.equal(ratingFromAle(20_000_000), 5);
  assert.equal(ratingFromAle(1_000_000_000), 5);
});

test("ratingFromProbability bands are ordered and cover the full range", () => {
  assert.equal(ratingFromProbability(0), 1);
  assert.equal(ratingFromProbability(0.049), 1);
  assert.equal(ratingFromProbability(0.05), 2);
  assert.equal(ratingFromProbability(0.15), 3);
  assert.equal(ratingFromProbability(0.35), 4);
  assert.equal(ratingFromProbability(0.6), 5);
  assert.equal(ratingFromProbability(1), 5);
});

test("riskScoreLabel escalates with likelihood x impact", () => {
  assert.equal(riskScoreLabel(1, 1).label, "Low");
  assert.equal(riskScoreLabel(3, 3).label, "Moderate");
  assert.equal(riskScoreLabel(4, 4).label, "High");
  assert.equal(riskScoreLabel(5, 5).label, "Critical");
});
