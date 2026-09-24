# FAIR Risk Radar

**Most risk registers say "High." Nobody can budget against "High."**

A quantitative cyber risk platform that answers the question executives
actually ask — *how much, and is fixing it worth it?* — using Monte Carlo
simulation on the FAIR model, a control catalogue cross-mapped to six
compliance frameworks, role-based access control, and a hash-chained audit
trail that can be re-verified on read.

Live demo: **[fair-risk-radar-3r34.vercel.app](https://fair-risk-radar-3r34.vercel.app)**
· Engine `3.0.0` · parameter set `ibm-2025-r2-partitioned` · 197 unit tests

---

## The problem

Qualitative risk management produces adjectives. A risk is "High", a control
is "Amber", and a heat map turns that into colour. Those labels cannot be
summed, cannot be compared against a budget, and cannot tell you whether a
control investment is worth making.

FAIR (Factor Analysis of Information Risk) replaces the adjectives with
distributions. Instead of "High", you get:

> *A 90th-percentile year costs $14.2M, and we breach our $5M appetite 32% of
> the time. Getting inside that appetite needs 91% control coverage; we are at
> 74%. Closing the gap costs $2.1M/year more than the economically optimal
> spend — that is the price of the appetite itself.*

That is a sentence a board can act on. The rest of this README is about the
second problem: **a number a board can act on is a number somebody has to be
accountable for.** Most of the engineering here is about making that possible.

---

## What it does

Seven pages, one chain of reasoning:

| Page | The question it answers |
| --- | --- |
| **Risk Simulator** | How bad is a bad year? 8,000 simulated years → loss distribution, percentiles, exceedance curve |
| **Control Posture** | What do we actually have in place, cross-mapped to which frameworks, and who says so? |
| **Risk Register** | What are we formally tracking, who owns it, inherent vs. residual? |
| **ROI Analysis** | Where does control spend stop paying for itself — and how much does our appetite cost on top of that? |
| **Risk Transfer** | If controls mathematically cannot get us inside appetite, what does insurance cost? |
| **Audit Trail** | Prove none of this was invented this morning — and prove the record itself has not been edited |
| **Methodology** | The model, every constant with its provenance, and an honest list of what it gets wrong |

They form a complete risk management cycle: **simulate → discover you are
outside appetite → find the cheapest coverage that fixes it → discover
controls alone cannot → price the transfer → and log every step, with an actor
on it.**

### Other capabilities

- **Live what-if panel** — drag control coverage and toggle threat communities, re-simulated on every change
- **Independent per-framework coverage sliders**, selected by checkbox on the framework itself — each records coverage *as that framework scopes it*, so moving one leaves the others where they are
- **Evidence viewer** — attach and parse CSV evidence per control, provenance-tagged
- **AI evidence reconciliation** — reads an uploaded access review or patch report and flags where it contradicts the coverage being claimed (see [Using AI without taking its word for it](#using-ai-without-taking-its-word-for-it))
- **AWS Config integration** — pull real control coverage from Config rule evaluations
- **Custom catalogue upload** — bring your own controls via CSV
- **Board-ready exports** — PDF leading with a plain-language verdict, technical detail in an appendix; CSV for the working
- **Installable** — ships a web manifest, so it runs standalone from a phone home screen

---

## Three decisions worth defending

The interesting part of a risk model is not the code. It is the modelling
choices, and why they were made:

**1. Control effectiveness is capped at a 70% risk reduction.**
Coverage reduces vulnerability linearly, but never to zero. Perfectly
implemented controls still fail — fully patched estates get hit by zero-days,
trained staff still get phished. A model that lets coverage drive risk to zero
produces a business case for infinite security spend, which is precisely how
quantitative risk loses credibility in a boardroom. The cap itself is a
judgement, labelled as one everywhere it appears.

**2. Control cost scales with the square of coverage, not linearly.**
Early coverage is cheap and high-leverage; closing the last gap costs
disproportionately more. This is a *shape*, not a sourced budget curve — but
the shape is load-bearing. A linear cost curve against a roughly linear
risk-reduction curve can only ever optimise at 0% or 100%, never in between.
That is a degenerate result, not a trade-off. Convex cost is what makes an
interior optimum expressible at all. The optimum sits at `c* = A / 2C`, where
`A` is avoided loss at full coverage and `C` the full-remediation estimate.

**3. Economic optimum and compliance minimum are different answers.**
"Where does spend stop paying for itself" and "what does our stated appetite
demand" are two different questions and routinely disagree. The gap between
them has a dollar value, and the tool puts it on screen rather than collapsing
both into one recommendation.

Loss magnitude follows FAIR's real taxonomy — **Primary Loss** (certain, once
a loss event occurs) plus a **Secondary Loss** that only materialises a
fraction of the time — rather than a single flat impact range. A blended range
hides the fat tail, and the fat tail is the entire reason anyone buys
insurance.

**Threat communities partition the sector frequency, they do not add to it.**
Each community's multiplier is a *share* of the sector's all-cause event
frequency: `λᵢ = λ_base × (mᵢ / Σm)`. Selecting the whole catalogue reproduces
the sector baseline exactly; selecting a subset is strictly less than
all-cause, never more. The earlier model multiplied instead of partitioned, so
adding a threat type you were already exposed to invented frequency that did
not exist — and the fix is enforced by a test asserting the monotonicity
property, not by a comment asking you to be careful.

---

## Governance: the half that is not maths

A quantitative figure with no accountable author is a spreadsheet, not a risk
assessment. These are the controls that make a number here defensible, and
each one is a mechanism rather than a claim in a policy document.

**Authentication and RBAC.** Every route is behind a session; nothing is
readable anonymously. Roles are a total order — `VIEWER` → `ANALYST` →
`CONTROL_OWNER` → `ADMIN` — so every authorisation decision is one comparison
(`atLeast(role, required)`) instead of a permission matrix nobody maintains.
Setting control coverage is a `CONTROL_OWNER` action, because coverage is the
input that moves every figure downstream of it. The audit trail splits on the
same principle: every member reads their **own** events, because everyone
should be able to account for what they did, and reading **other people's** —
the whole organisation's trail — is the escalated action and needs `ADMIN`.
Reviewing a colleague is a privilege, not a side effect of having a login.

That split has a consequence worth stating, because getting it wrong would
manufacture a false alarm: **integrity cannot be scoped.** The hash chain links
every event in the organisation in sequence, so a per-user slice of it does not
verify — each surviving row points at a predecessor the filter removed. The
chain is therefore always verified over the full log server-side, and only the
permitted rows are returned. A member is told the record is intact, and how
many events that claim covers, without being shown the records that prove it.
There is a test asserting a filtered chain fails verification, so nobody
"optimises" the route into verifying the slice.

**Segregation of duties, enforced in code.** You cannot approve an assessment
you ran. `canApprove()` returns one of four explicit refusals —
`NOT_APPROVER`, `ALREADY_APPROVED`, `SELF_APPROVAL`, `NOT_REPRODUCIBLE` — and
seniority does not waive any of them. An admin who runs a simulation is, for
that assessment, disqualified as its approver.

**A hash-chained audit trail that is re-verified on read.** Every event stores
the hash of its predecessor. The audit page recomputes the whole chain on load
and states whether it verifies, naming the index where it breaks if it does
not. Append-only is therefore something the page *demonstrates* rather than
something the architecture asserts — including against someone with direct
database access.

**Parameter-set identity, so an old number can be trusted or disowned.** Every
assessment carries a 96-bit content hash of the exact scenario parameters,
threat catalogue and control cap it was computed from. If today's hash differs,
the assessment is flagged **non-reproducible** rather than silently re-derived
against current values — "this can no longer be reproduced" is a true and
useful answer; quietly producing a different number is not. Parameters live in
source code, already immutably versioned by git, rather than in database rows
that can drift from it.

**Reproducibility.** Simulation is seeded (xmur3 + sfc32), so the same inputs
give the same distribution, and what-if comparisons use common random numbers
— a coverage change moves the figure because coverage changed, not because the
sampler wandered. One estimator per quantity, computed once and reused, so two
panels can never disagree about the same number.

**Parameter provenance.** Every constant in the model carries a basis:
`SOURCED` from a named publication and edition, `DERIVED` from a sourced figure
by a stated rule, or `JUDGEMENT` — a modelling assumption with nothing behind
it but reasoning. Of the 13 registered parameters, **1 is sourced, 1 derived,
and 11 are judgement calls.** That ratio is on the Methodology page on
purpose. The register is data (`src/lib/provenance.ts`), so the page cannot
drift from it and a reviewer can diff it between versions.

**Identity by reference, so erasure actually erases.** Risk owners live in a
directory; audit events store an `ownerId`, never a name. Tombstoning an owner
removes their name everywhere it was ever displayed without rewriting a single
hash-chained record — which is what makes an append-only log compatible with a
deletion request instead of in tension with it.

**Retention is stated, per data class**, with the reasoning for each period
(assessments and evidence at 7 years, because an assessment that fed a budget
decision must outlive the budget cycle it justified).

Rate limiting uses a sliding timestamp window with a hard bound on tracked
keys — a fixed-window counter lets a caller fire twice the limit across a
boundary, and an unbounded key map is a memory-exhaustion path rather than a
rate limit.

---

## Using AI without taking its word for it

The product includes one AI feature: an analyst uploads an access review or
patch report as evidence, and a model reads it and reports where the document
**contradicts the coverage being claimed** for that control. Reconciling a
40-page access review against a claimed 95% MFA coverage is exactly the work
that gets skipped, and exactly the work where being wrong matters.

Agentic AI security is a live and unresolved question, so the feature is built
on the assumption that the model will be wrong and may be manipulated:

**1. Capability restriction, first and hardest.** The handler reads evidence
and writes a review row. There is no code path from it to `ControlCoverage`.
A model completely taken in by an instruction hidden inside an uploaded CSV
produces a wrong suggestion on a screen that a human discards. This is the
property that makes prompt injection *low-impact* rather than merely
"mitigated" — the defence is the absence of the capability, not a filter in
front of it. **The model never produces a number that enters the risk model.**

**2. Grounding, verified not requested.** Every finding must carry a verbatim
quote from the evidence. Each quote is checked against the stored file before
anything is persisted; findings that fail verification are **counted and
surfaced**, not silently dropped. An analyst who reads "3 findings shown, 2
discarded as ungrounded" knows how much to trust the 3. Fabrication rate is
the single thing an operator most needs to know, so it is on the screen.

**3. Model output is validated at a trust boundary.** The response goes
through the same schema validators as an untrusted HTTP body — because that is
what it is.

**4. Traceability.** Every run writes an `AI_REVIEW` event into the same
hash-chained trail as everything else: who asked, which model, which prompt
version, how many findings were kept and how many discarded. Reviews are never
overwritten; re-running creates a new row, so last quarter's answer survives.

**5. Honest about reproducibility.** This is the one non-reproducible
component in the product, and the parameter register says so. The model is
pinned to an exact version rather than a floating alias, because a drifting
version on top of non-determinism would mean nobody could say what produced a
stored finding.

**6. Degrades to absent.** With no API key configured the endpoint returns
`503 NOT_CONFIGURED` and the rest of the product works unchanged. The AI is a
feature, not a dependency.

The catalogue carries four AI-governance controls of its own
(`ai-output-grounding`, `ai-prompt-injection-containment`,
`ai-human-oversight`, `ai-traceability`), mapped to EU AI Act Articles 12, 14
and 15 and to OWASP LLM01/05/08/09 — so the AI columns in the framework matrix describe
this application's own controls rather than sitting empty.

---

## Standards covered

Controls are cross-mapped to **NIST CSF 2.0**, **ISO/IEC 27001:2022**,
**SOC 2 (Trust Services Criteria)**, **PCI DSS v4.0**, the **EU AI Act**, and
the **OWASP LLM Top 10**.

Coverage figures carry a provenance tag — `DEMO`, `MANUAL`, or `AWS_CONFIG` —
because a number without a source is an opinion. Coverage records are appended,
never overwritten, so a superseded figure stays in the history.

### One control, two denominators

Coverage is recorded at two levels, and keeping them apart is what lets the
per-framework sliders be independent without publishing contradictory numbers.

**Base coverage** is the deployment: how much of the estate a control is
actually running across. It is the only figure the FAIR engine reads, because an
attacker does not care which framework you were looking at.

**Framework-scoped coverage** is that control *as a given framework scopes it*.
PCI DSS 8.4.2 asks for MFA across the cardholder data environment; ISO/IEC 27001
A.8.5 asks for it everywhere. One MFA rollout can honestly be 100% of the first
and 60% of the second — two denominators, not two truths. A scoped figure is
compliance reporting and never reaches the simulation.

Resolution is "latest row for (control, framework), else latest row for
(control, null)", so a framework starts out agreeing with the deployment and
diverges only where someone says it should, and the append-only coverage history
is untouched. A framework's row in the UI shows `scoped 3/8` when three of its
eight mapped controls carry a figure of its own — so a reader can tell a
framework assessed on its own terms from one merely showing the deployment.

Two further numbers are reported per framework, and conflating them is the most
common way compliance dashboards mislead:

- **Scope** — how much of the framework this catalogue addresses at all
  (distinct references mapped ÷ the framework's requirement population).
- **Implementation** — average coverage across the controls that *are* mapped.
- **Assessed coverage** = scope × implementation. This is the only one of the
  three that can honestly sit next to a framework's name.

A 12-control catalogue against ISO 27001's 93 controls is a starter set, and
the app says so on the page rather than reporting 80% and letting you assume
it means the framework.

---

## Tech stack

Next.js 14 (App Router) · TypeScript (strict) · PostgreSQL + Prisma ·
Chart.js · Tailwind · pdf-lib · Anthropic API · deployed on Vercel.

No simulation library, and no AI SDK — the Monte Carlo engine, the Poisson and
triangular samplers, the seeded PRNG, the loss exceedance curve, insurance
layer pricing, the audit hash chain, the rate limiter and the model client are
all implemented directly in `src/lib/`, which is the part of this project
worth reading.

```
src/
  app/
    page.tsx          Risk Simulator
    controls/         Control Posture
    risks/            Risk Register
    roi/              ROI Analysis
    transfer/         Risk Transfer
    audit/            Audit Trail
    methodology/      Methodology
    login/            Sign-in
    api/              route handlers (simulation, controls, evidence, audit,
                      approval, erasure, AI review, exports)
  lib/
    fair.ts           Monte Carlo engine — the core model
    rng.ts            Seeded PRNG (xmur3 + sfc32) — reproducibility
    stats.ts          Percentiles and standard error, single-estimator
    lec.ts            Loss exceedance curve interpolation
    insurance.ts      Excess-of-loss layer pricing
    coverage.ts       Scoped-coverage resolution + scope/implementation/assessed
    auth.ts, roles.ts Session + role gates
    audit.ts          Audit event writer
    audit-hash.ts     Canonical JSON + chain verification
    audit-kinds.ts    The event taxonomy, in one place
    approval.ts       Segregation of duties
    parameter-set.ts  Parameter-set hash and model stamp
    provenance.ts     Where every constant came from
    risk-governance.ts Overrides, staleness, retention
    rate-limit.ts     Sliding-window limiter, bounded
    upload-guard.ts   Upload inspection before parsing
    ai/
      evidence-review.ts  Prompt, output validation, quote grounding
      client.ts           Anthropic client (fetch, pinned model)
    report.ts         PDF generation
    aws-config.ts     AWS Config integration
  components/         UI
    demo-evidence.ts  The seeded evidence files, and the ratios that make the
                      AI reconciliation checkable by hand
controls/catalog.yaml Compliance-as-code control catalogue (source of truth)
prisma/               schema + seed
```

`controls/catalog.yaml` is the single source of truth for the control
catalogue: change a mapping there, re-run `npm run db:seed`, and it propagates
through the API, the framework selector, the dashboard and the exported
reports. That is what "compliance as code" means here — not a diagram.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Database

Any Postgres works. The fastest free option is [Neon](https://neon.tech) —
create a project and copy the connection string.

```bash
cp .env.example .env
# paste your DATABASE_URL into .env
```

Push the schema and seed the control catalogue, scenarios, demo accounts and
evidence:

```bash
npm run db:push
npm run db:seed
```

### 3. Run

```bash
npm run dev
```

Open `http://localhost:3000`. The seed creates one demo account per role, and
the sign-in page describes what each role can do — the demo explains its own
access model rather than needing a separate page.

### 4. Tests

```bash
npm test        # 197 tests
npm run typecheck
```

Coverage is deliberately concentrated on the parts where being wrong is
expensive and silent: the FAIR engine, the seeded PRNG, percentile and
standard-error estimation, insurance layer maths (verified against closed-form
analytic results for a known distribution, not snapshots), the audit hash
chain, role gates, segregation of duties, the rate limiter's bounded-storage
guarantee, upload inspection, CSV injection escaping, and the AI layer's quote
grounding.

Two tests exist to catch a class of mistake rather than a bug:
`audit-kinds.test.ts` parses `prisma/schema.prisma` and asserts the TypeScript
taxonomy matches the database enum in membership *and* order — because a kind
added to one and not the other is a runtime crash on the audit page that no
ordinary test would catch. The threat-partitioning tests assert the
monotonicity property directly, so the frequency model cannot regress to
multiplying.

### 5. (Optional) AI evidence review

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without it the review endpoint returns `503 NOT_CONFIGURED` and everything
else works normally.

### 6. (Optional) Connect real AWS Config data

Create a read-only IAM user or role with
`config:GetComplianceDetailsByConfigRule`, then set in `.env`:

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

By default the app reads three AWS-managed Config rules:
`iam-user-mfa-enabled`, `ec2-managedinstance-patch-compliance-status` and
`cmk-backing-key-rotation-enabled`. Override via `AWS_CONFIG_RULE_MFA` /
`AWS_CONFIG_RULE_PATCH` / `AWS_CONFIG_RULE_KMS`.

Without these set, every sync returns `"demoMode": true` in its response — the
app never presents demo numbers as if they were live.

---

## Deploy

1. Push to GitHub.
2. Import at [vercel.com/new](https://vercel.com/new) — framework preset
   **Next.js**, auto-detected.
3. Set `DATABASE_URL` and, optionally, `ANTHROPIC_API_KEY` and the `AWS_*`
   vars in the Vercel project settings.
4. Run the schema push and seed once against the production database:

```bash
npx prisma db push
npx tsx prisma/seed.ts
```

Every push to `main` auto-deploys; `postinstall` runs `prisma generate`.

---

## What this model gets wrong

A quantitative model is not valuable because it is right. It is valuable
because every assumption is written down and can be argued with specifically —
which a colour-coded heat map cannot offer. The full list is on the
**Methodology** page in the app; the headlines:

- **Loss ranges are estimates**, anchored to published breach-cost research,
  not to your incident history.
- **Frequency is not sourced at all.** The loss-magnitude research does not
  publish event frequency, so every `tefLambda` is a judgement call that drives
  the frequency side of every figure in the product.
- **Threat communities are modelled as independent.** Real incidents
  correlate, so independence understates the worst years.
- **Controls are one blended coverage figure**, not individually weighted.
- **The 70% effectiveness cap is a judgement**, chosen for defensibility
  rather than derived from data.
- **The cost curve is a shape, not a budget.** Real remediation spend is lumpy.
- **Monte Carlo output carries sampling error.** Runs are seeded and therefore
  repeatable, but a repeatable number is not an exact one: every percentile is
  displayed with its 95% confidence interval, and the ROI sweep should be read
  as a trend rather than point by point.
- **The catalogue is a starter set.** 12 controls against frameworks that run
  to dozens or hundreds of requirements — which is why scope is reported
  separately from implementation.
- **The AI review is not reproducible** and its findings never enter the risk
  model. Treat them as a reading of a document, to be checked.
- **Nothing here is actuarial.** The insurance premium loading is illustrative.
  Use it to frame a conversation with a broker, not to replace one.

---

## Licence

MIT — see [LICENSE](LICENSE). Attribution required.
