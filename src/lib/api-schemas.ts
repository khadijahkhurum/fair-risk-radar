// One strict schema per route boundary (audit S11/E1).
//
// Every mutating endpoint parses its body through exactly one of these before
// any business logic runs. Unknown keys are rejected, numbers are range-checked
// rather than coerced, and threat IDs are deduplicated and capped — which is
// where M5 and M6 are actually fixed, once, instead of per route.
import { NextResponse } from "next/server";
import { scenarios } from "./scenarios";
import { threats } from "./threats";
import { object, str, num, bool, arrayOf, idIn, nullable, optional, oneOf, type Check } from "./validate";

const SCENARIO_IDS = new Set(scenarios.map((s) => s.id));
const THREAT_IDS = new Set(threats.map((t) => t.id));

// A threat set larger than the catalogue is meaningless: each entry is an
// independent threat community and the catalogue is the population.
const MAX_THREATS = THREAT_IDS.size;
// $1T/year. Already absurd for any scenario here, but finite and explicit
// beats 1e308 arriving as a "tolerance".
const MAX_TOLERANCE = 1_000_000_000_000;

const scenarioId = idIn(SCENARIO_IDS, "scenarioId");
const threatIds = optional(arrayOf(idIn(THREAT_IDS, "threatId"), { max: MAX_THREATS, unique: true }));
const riskTolerance = optional(nullable(num({ min: 0, max: MAX_TOLERANCE })));
const coveragePct = num({ min: 0, max: 100 });
const rating = num({ min: 1, max: 5, int: true });

export const RunAssessment = object({ scenarioId, threatIds, riskTolerance });

export const WhatIf = object({
  scenarioId,
  threatIds,
  riskTolerance,
  coveragePct: optional(coveragePct),
  // Common random numbers (audit M3a, M7): the caller passes the baseline
  // run's seed and trial count so the hypothetical is evaluated on the SAME
  // sampled years. The noise then cancels in the difference, which is the
  // only quantity anyone reads off this panel.
  seed: optional(str({ min: 1, max: 64 })),
  trials: optional(num({ min: 500, max: 20000, int: true })),
  // S7: ask for the per-threat leave-one-out weights in the SAME request
  // instead of firing one follow-up request per threat.
  leaveOneOut: optional(bool()),
  // M8: the Risk Transfer page prices a layer from the raw sample rather
  // than by integrating the curve, so it has to ask for the sample. Opt-in,
  // because it is ~30KB and the dashboard's slider panel does not need it.
  includeSample: optional(bool()),
});

export const SuggestRatings = object({ scenarioId, threatIds, riskTolerance });

// G7: the model's suggestion travels with the risk so the server can store it
// beside the human's answer. It is accepted from the client because the client
// is what ran the suggestion — but note that it is only ever used to decide
// whether a justification is REQUIRED, never to relax a check. A caller who
// lies about the suggestion only makes the rule stricter on themselves.
const suggestedRating = optional(nullable(rating));
const justification = optional(nullable(str({ max: 2000 })));

export const CreateRisk = object({
  title: str({ min: 1, max: 200 }),
  description: optional(str({ max: 4000 })),
  ownerName: str({ min: 1, max: 120 }),
  scenarioId,
  threatIds,
  riskTolerance,
  inherentLikelihood: rating,
  inherentImpact: rating,
  residualLikelihood: rating,
  residualImpact: rating,
  latestAssessmentId: optional(nullable(str({ min: 1, max: 64 }))),
  suggestedInherentLikelihood: suggestedRating,
  suggestedInherentImpact: suggestedRating,
  suggestedResidualLikelihood: suggestedRating,
  suggestedResidualImpact: suggestedRating,
  overrideJustification: justification,
});

export const UpdateRisk = object({
  status: optional(oneOf(["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"] as const)),
  ownerName: optional(str({ min: 1, max: 120 })),
  inherentLikelihood: optional(rating),
  inherentImpact: optional(rating),
  residualLikelihood: optional(rating),
  residualImpact: optional(rating),
  latestAssessmentId: optional(nullable(str({ min: 1, max: 64 }))),
  overrideJustification: justification,
});

export const Login = object({
  email: str({ min: 3, max: 200 }),
  password: str({ min: 1, max: 200 }),
});

export const SetCoverage = object({
  controlId: str({ min: 1, max: 100 }),
  coveragePct,
});

/**
 * Sign-off (audit G4). The note is the only thing the caller supplies — WHO
 * approved and WHAT was approved both come from the session and the stored
 * row, never from the request, so neither can be asserted by the client.
 */
export const ApproveAssessment = object({
  note: optional(str({ min: 1, max: 500 })),
});

/**
 * Parse a JSON request body against a schema, or return the 400 to send back.
 * Returns a discriminated union so the caller cannot forget to handle failure.
 */
export async function parseBody<T>(
  req: Request,
  schema: Check<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }),
    };
  }
  const parsed = schema.parse(raw, "");
  if (!parsed.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid request", issues: parsed.issues }, { status: 400 }),
    };
  }
  return { ok: true, data: parsed.value };
}
