# FAIR Risk Radar

**Most risk registers say "High." Nobody can budget against "High."**

A quantitative cyber risk platform that answers the question executives
actually ask — *how much, and is fixing it worth it?* — using Monte Carlo
simulation on the FAIR model, a control catalogue cross-mapped to six
compliance frameworks, and an append-only audit trail.

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

That is a sentence a board can act on.

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
| **Audit Trail** | Prove none of this was invented this morning |
| **Methodology** | The model, the constants, and an honest list of what it gets wrong |

The point isn't any single page — it's that they form a complete risk
management cycle: **simulate → discover you are outside appetite → find the
cheapest coverage that fixes it → discover controls alone cannot → price the
transfer → and log every step.**

### Other capabilities

- **Live what-if panel** — drag control coverage and toggle threats, re-simulated on every change
- **Per-framework coverage sliders** with cross-mapping made explicit
- **Evidence viewer** — attach and parse CSV evidence per control, provenance-tagged
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
quantitative risk loses credibility in a boardroom.

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

Loss magnitude also follows FAIR's real taxonomy — **Primary Loss** (certain,
once a loss event occurs) plus a **Secondary Loss** that only materialises a
fraction of the time — rather than a single flat impact range. A blended range
hides the fat tail, and the fat tail is the entire reason anyone buys
insurance.

---

## Standards covered

Controls are cross-mapped to **NIST CSF 2.0**, **ISO/IEC 27001:2022**,
**SOC 2 (Trust Services Criteria)**, **PCI DSS v4.0**, the **EU AI Act**, and
the **OWASP LLM Top 10**.

Coverage figures carry a provenance tag — `DEMO`, `MANUAL`, or `AWS_CONFIG` —
because a number without a source is an opinion. Coverage records are appended,
never overwritten, so a superseded figure stays in the history.

---

## Tech stack

Next.js 14 (App Router) · TypeScript · PostgreSQL + Prisma · Chart.js ·
Tailwind · pdf-lib · deployed on Vercel.

No simulation library — the Monte Carlo engine, Poisson and triangular
samplers, loss exceedance curve and insurance layer pricing are implemented
directly in `src/lib/`, which is the part of this project worth reading.

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
    api/              route handlers (simulation, controls, evidence, audit, exports)
  lib/
    fair.ts           Monte Carlo engine — the core model
    lec.ts            Loss exceedance curve interpolation, shared by every page
    insurance.ts      Excess-of-loss layer pricing
    coverage.ts       Per-framework coverage roll-up
    report.ts         PDF generation
    aws-config.ts     AWS Config integration
  components/         UI
prisma/               schema + seed
```

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

Push the schema and seed the control catalogue, scenarios and demo evidence:

```bash
npm run db:push
npm run db:seed
```

### 3. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

### 4. Tests

```bash
npm test
```

Covers the FAIR engine, risk-rating bands, and the insurance layer maths —
the last verified against closed-form analytic results for a known
distribution, not just snapshots.

### 5. (Optional) Connect real AWS Config data

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
3. Set `DATABASE_URL` in the Vercel project settings (plus the `AWS_*` vars if
   using real Config data).
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
- **Threat communities are modelled as independent.** Real incidents
  correlate, so independence understates the worst years.
- **Controls are one blended coverage figure**, not individually weighted.
- **The 70% effectiveness cap is a judgement**, chosen for defensibility
  rather than derived from data.
- **The cost curve is a shape, not a budget.** Real remediation spend is lumpy.
- **Monte Carlo output varies between runs.** Each point on the ROI sweep is an
  independent simulation — read the trend, not a single point.
- **Nothing here is actuarial.** The insurance premium loading is illustrative.
  Use it to frame a conversation with a broker, not to replace one.

---

## Licence

MIT — see [LICENSE](LICENSE). Attribution required.
