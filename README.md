# FAIR Risk Radar

A quantitative cyber risk platform, not a slider demo. It models expected annual
loss using the Open Group's FAIR (Factor Analysis of Information Risk) ontology,
runs the simulation server-side, persists every result to Postgres as an audit
trail, and can pull real control-compliance data from AWS Config instead of
manual input.

## Problem statement

Most portfolio "risk dashboards" are a static page with sliders that reset on
refresh — nothing persists, nothing is auditable, and nothing talks to a real
system. This project is the version a GRC or security-engineering team could
actually adopt as a starting point: a control catalog defined as code, a risk
register that keeps history, and a path from "control coverage" to "what a
cloud API actually reports" instead of a number picked by hand.

## Target standards

Every control in the catalog is cross-mapped to:

- **NIST CSF 2.0**
- **ISO/IEC 27001:2022** (Annex A)
- **SOC 2** (Trust Services Criteria)
- **PCI DSS v4.0**

See `controls/catalog.yaml` — that file is the single source of truth; the
database mirrors it.

## Core features & tech stack

| Feature | Implementation |
|---|---|
| FAIR Monte Carlo engine | `src/lib/fair.ts` — triangular-distribution sampling, Poisson event counts, 8,000 trials, run server-side in a Next.js Route Handler |
| Persistent risk register | Postgres via Prisma (`prisma/schema.prisma`) — every simulation run is written as an immutable `RiskAssessment` row |
| Compliance-as-code | `controls/catalog.yaml` → seeded into the `Control` table (`prisma/seed.ts`) |
| Live cloud integration | `src/lib/aws-config.ts` calls AWS Config's `GetComplianceDetailsByConfigRule` and computes real per-control coverage %, with a labeled demo fallback when no AWS credentials are set |
| Audit evidence export | `src/lib/report.ts` — CSV and PDF export of the current control posture + latest assessment, via `pdf-lib` |
| Frontend | Next.js 14 (App Router), TypeScript, Chart.js, no UI framework dependency |

Stack: **Next.js · TypeScript · PostgreSQL (Prisma) · AWS SDK v3 · Chart.js · pdf-lib**

## GRC technical highlights

- **Sourced vs. modeled, labeled everywhere.** Loss magnitude is calibrated to
  IBM's 2025 Cost of a Data Breach Report; Threat Event Frequency and the
  Vulnerability baseline are explicit modeling assumptions. The UI tags each
  factor `sourced` or `modeled` — nothing pretends to be data it isn't.
- **A real audit trail.** `RiskAssessment` rows are never overwritten. You can
  answer "what did we think our exposure was last quarter, under what control
  posture" — the actual question a GRC program needs to answer.
- **Control coverage has provenance.** Every `ControlCoverage` row is tagged
  `manual`, `aws-config`, or `demo`. A number on the dashboard always tells you
  where it came from.
- **Compliance-as-code, not a hardcoded UI string.** Change a framework mapping
  in `controls/catalog.yaml`, re-run the seed script, and it propagates through
  the API, the dashboard, and the exported reports.

## Portfolio impact

This demonstrates full-stack ownership of a GRC tool end to end: a defensible
quantitative model, a real persistence layer with an audit trail, a live
integration against an actual cloud compliance API, and an exportable
artifact an auditor could actually read — not just a chart.

## Scope tiers

**MVP (this repo, as built)**
Single-tenant, one risk register per industry scenario, manual + AWS Config
control sync, CSV/PDF export, full assessment history.

**Intermediate (natural next step)**
Auth (NextAuth) with role-based access (control owner vs. auditor read-only),
multi-tenant organizations, scheduled AWS Config sync via a cron route,
Slack/email alerting when expected annual loss crosses tolerance.

**Advanced**
Additional connectors (GCP Security Command Center, Azure Policy, a GitHub
Actions-based CI check that fails a PR if a control's mapped coverage drops),
a proper Beta-PERT sampler in place of the triangular approximation, and a
policy-as-code layer (OPA/Rego) that turns control coverage thresholds into
enforceable gates.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Database

Any Postgres works. The fastest free option is [Neon](https://neon.tech) —
create a project, copy the connection string.

```bash
cp .env.example .env
# paste your DATABASE_URL into .env
```

Push the schema and seed the compliance-as-code catalog + scenarios:

```bash
npm run db:push
npm run db:seed
```

### 3. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`. AWS Config isn't configured yet, so "Sync from
AWS Config" will return labeled demo data — that's expected, see below.

### 4. (Optional) Connect real AWS Config data

Create a read-only IAM user or role with `config:GetComplianceDetailsByConfigRule`,
then set in `.env`:

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

By default the app reads three AWS-managed Config rules:
`iam-user-mfa-enabled`, `ec2-managedinstance-patch-compliance-status`, and
`cmk-backing-key-rotation-enabled`. Override any of them via
`AWS_CONFIG_RULE_MFA` / `AWS_CONFIG_RULE_PATCH` / `AWS_CONFIG_RULE_KMS` if your
account uses custom rule names, or if AWS Config isn't already recording those
resource types, enable it first in the AWS Config console.

Without these three env vars set, every sync call clearly returns
`"demoMode": true` in its response — the app never presents demo numbers as if
they were live.

## Deploy to Vercel

1. Push this repo to GitHub (see below).
2. Import it at [vercel.com/new](https://vercel.com/new). Framework preset:
   **Next.js** (auto-detected — no config needed).
3. Add environment variables in the Vercel project settings: `DATABASE_URL`
   at minimum, plus the three `AWS_*` vars if you're connecting real AWS Config
   data.
4. Deploy. Then run the schema push and seed once against your production
   database (from your machine, pointed at the same `DATABASE_URL`):

```bash
npx prisma db push
npx tsx prisma/seed.ts
```

Every future push to `main` auto-deploys; `postinstall` runs `prisma generate`
automatically so the Prisma client is always in sync with the schema.

## Push to GitHub from scratch

```bash
git init
git add .
git commit -m "Initial commit: FAIR Risk Radar"
git branch -M main
git remote add origin https://github.com/<your-username>/fair-risk-radar.git
git push -u origin main
```

## Project structure

```
controls/catalog.yaml          compliance-as-code control catalog (source of truth)
prisma/schema.prisma           Postgres schema
prisma/seed.ts                 seeds Control + Scenario tables from catalog.yaml + scenarios.ts
src/lib/fair.ts                FAIR Monte Carlo engine
src/lib/scenarios.ts           industry loss profiles (IBM 2025-calibrated)
src/lib/aws-config.ts          live AWS Config integration + demo fallback
src/lib/report.ts              CSV / PDF audit-evidence export
src/app/api/scenarios          GET  — list scenarios with current control coverage
src/app/api/risk               GET/POST — read latest assessment / run + persist a new one
src/app/api/controls           PATCH — manual control coverage override
src/app/api/integrations/aws-config   POST — sync coverage from AWS Config
src/app/api/reports/export     GET  — CSV/PDF export
src/app/page.tsx               dashboard UI
```

## Data sources

- IBM Security, *Cost of a Data Breach Report 2025* — industry average breach
  costs and global cost-category breakdown.
- Verizon, *2025 Data Breach Investigations Report* — ransomware prevalence,
  cited for context in the methodology panel.
- Framework: The Open Group, FAIR (Factor Analysis of Information Risk).

Threat Event Frequency and the Vulnerability baseline are not published at
this granularity anywhere and are explicit modeling assumptions — see the
in-app methodology panel and `src/lib/scenarios.ts` for the full breakdown of
what's sourced vs. modeled.
