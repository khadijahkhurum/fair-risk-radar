import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PARAMETER_SET_HASH, MODEL_STAMP, isReproducible } from "./parameter-set";
import { canonicalJson } from "./audit-hash";
import { scenarios } from "./scenarios";
import { threats } from "./threats";
import { MAX_CONTROL_RISK_REDUCTION, ENGINE } from "./fair";

test("G4 — the parameter set has a stable, non-empty identity", () => {
  assert.equal(typeof PARAMETER_SET_HASH, "string");
  assert.equal(PARAMETER_SET_HASH.length, 16);
  assert.match(PARAMETER_SET_HASH, /^[A-Za-z0-9_-]+$/, "must be readable off a PDF footer");
  // Importing twice must not produce two identities.
  assert.equal(PARAMETER_SET_HASH, MODEL_STAMP.parameterSetHash);
});

test("G4 — changing ANY model parameter changes the hash", () => {
  const hashOf = (v: unknown) =>
    createHash("sha256").update(canonicalJson(v)).digest("base64url").slice(0, 16);

  const live = { scenarios, threats, maxControlRiskReduction: MAX_CONTROL_RISK_REDUCTION };
  assert.equal(hashOf(live), PARAMETER_SET_HASH, "the test must hash what the module hashes");

  // One dollar on one scenario's loss mode.
  const nudgedScenario = {
    ...live,
    scenarios: scenarios.map((s, i) => (i === 0 ? { ...s, primaryLossMode: s.primaryLossMode + 1 } : s)),
  };
  assert.notEqual(hashOf(nudgedScenario), PARAMETER_SET_HASH);

  // One threat multiplier.
  const nudgedThreat = {
    ...live,
    threats: threats.map((t, i) => (i === 0 ? { ...t, tefMultiplier: t.tefMultiplier + 0.01 } : t)),
  };
  assert.notEqual(hashOf(nudgedThreat), PARAMETER_SET_HASH);

  // The control cap is a modelling assumption that moves every figure on the
  // page, so it belongs inside the identity as much as the distributions do.
  const nudgedCap = { ...live, maxControlRiskReduction: MAX_CONTROL_RISK_REDUCTION - 0.01 };
  assert.notEqual(hashOf(nudgedCap), PARAMETER_SET_HASH);
});

test("G4 — reproducibility is exact: near-misses and legacy rows are not reproducible", () => {
  assert.equal(isReproducible(PARAMETER_SET_HASH), true);
  assert.equal(isReproducible(PARAMETER_SET_HASH.slice(0, 15)), false);
  assert.equal(isReproducible("unknown"), false, "pre-column rows recorded no parameters");
  assert.equal(isReproducible(null), false);
  assert.equal(isReproducible(undefined), false);
  assert.equal(isReproducible(""), false);
});

test("G4 — the stamp carries everything needed to re-derive a run", () => {
  assert.equal(MODEL_STAMP.engineVersion, ENGINE.version);
  assert.equal(MODEL_STAMP.parameterSetVersion, ENGINE.parameterSetVersion);
  assert.ok(MODEL_STAMP.engineVersion.length > 0);
  // Widened through an annotated string deliberately. MODEL_STAMP is `as
  // const`, so comparing the literal type against "unknown" is a compile
  // error (TS2367) rather than a test — and a check the compiler has already
  // made is not evidence of anything at runtime. This version survives
  // someone later setting ENGINE.parameterSetVersion to a placeholder.
  const parameterSetVersion: string = MODEL_STAMP.parameterSetVersion;
  assert.ok(
    parameterSetVersion.length > 0 && parameterSetVersion !== "unknown",
    "a shipped build must name its parameter set"
  );
});
