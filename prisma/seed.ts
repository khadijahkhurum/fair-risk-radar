// Seeds the Control table from controls/catalog.yaml (the source of truth)
// and the Scenario table from src/lib/scenarios.ts, then writes one demo
// ControlCoverage row per control so the dashboard isn't empty on first load.
//
// Run directly via tsx (see package.json's db:seed script), not through the
// `prisma` CLI, so — unlike `prisma db push`/`prisma generate` — nothing
// loads .env automatically. This does that explicitly.
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { PrismaClient } from "@prisma/client";
import { scenarios } from "../src/lib/scenarios";
import { hashPassword } from "../src/lib/password";
import { buildDemoEvidence } from "../src/lib/demo-evidence";

const prisma = new PrismaClient();

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  mappings: {
    nist_csf: string;
    iso27001: string;
    soc2: string;
    pci_dss: string | number;
    eu_ai_act: string;
    owasp_llm: string;
  };
  awsConfigRule: string | null;
}

// Representative starting coverage so the demo isn't a wall of zeros.
// Marked DEMO — never presented as measured data.
const DEMO_STARTING_COVERAGE: Record<string, number> = {
  "mfa-enforcement": 87,
  "patch-management": 74,
  "key-rotation": 95,
  "access-review": 62,
  "logging-monitoring": 81,
  "vendor-risk-assessment": 55,
  "incident-response-plan": 70,
  "data-encryption-at-rest": 90,
};


function parseCsvToRows(csv: string): Record<string, string>[] {
  const [headerLine, ...lines] = csv.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

// The demo organisation and its four accounts (audit S1, S2).
//
// Credentials are published on the sign-in page on purpose: this is a public
// portfolio deployment and a login wall with no way through is not a demo.
// What that costs is bounded now in a way it was not before — demo accounts
// live in ONE organisation, every action is attributed to whichever account
// performed it, and the role ordering still applies, so a visitor signed in as
// Viewer cannot alter control posture.
//
// Set DEMO_ACCOUNTS=off to omit them entirely for a private deployment.
const DEMO_ORG = { slug: "demo", name: "Northwind Financial (demo)" };
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const DEMO_USERS = [
  { email: "viewer@demo.fairriskradar.app", name: "Dana Viewer", role: "VIEWER" as const },
  { email: "analyst@demo.fairriskradar.app", name: "Alex Analyst", role: "ANALYST" as const },
  { email: "owner@demo.fairriskradar.app", name: "Omar Owner", role: "CONTROL_OWNER" as const },
  { email: "admin@demo.fairriskradar.app", name: "Ada Admin", role: "ADMIN" as const },
];

async function seedDemoOrg(): Promise<string> {
  const org = await prisma.organisation.upsert({
    where: { slug: DEMO_ORG.slug },
    update: { name: DEMO_ORG.name },
    create: DEMO_ORG,
  });

  if (process.env.DEMO_ACCOUNTS === "off") {
    console.log("DEMO_ACCOUNTS=off — organisation created, no demo users seeded.");
    return org.id;
  }

  for (const u of DEMO_USERS) {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await prisma.user.upsert({
      where: { email: u.email },
      // Re-seeding rotates the demo password rather than leaving a stale hash.
      update: { name: u.name, role: u.role, orgId: org.id, isDemo: true, passwordHash },
      create: { ...u, orgId: org.id, isDemo: true, passwordHash },
    });
  }
  console.log(`Seeded organisation "${org.name}" with ${DEMO_USERS.length} demo accounts.`);
  return org.id;
}

async function main() {
  const orgId = await seedDemoOrg();
  const catalogPath = join(__dirname, "..", "controls", "catalog.yaml");
  const catalog = load(readFileSync(catalogPath, "utf-8")) as CatalogEntry[];

  // Built once: daysAgo() reads the clock, and a file seeded at the start of the
  // loop should carry the same reference date as one seeded at the end.
  const DEMO_EVIDENCE = buildDemoEvidence();

  for (const entry of catalog) {
    await prisma.control.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        nistCsf: entry.mappings.nist_csf,
        iso27001: entry.mappings.iso27001,
        soc2: entry.mappings.soc2,
        pciDss: String(entry.mappings.pci_dss),
        euAiAct: entry.mappings.eu_ai_act,
        owaspLlm: entry.mappings.owasp_llm,
        awsConfigRule: entry.awsConfigRule,
      },
      update: {
        name: entry.name,
        description: entry.description,
        category: entry.category,
        nistCsf: entry.mappings.nist_csf,
        iso27001: entry.mappings.iso27001,
        soc2: entry.mappings.soc2,
        pciDss: String(entry.mappings.pci_dss),
        euAiAct: entry.mappings.eu_ai_act,
        owaspLlm: entry.mappings.owasp_llm,
        awsConfigRule: entry.awsConfigRule,
      },
    });

    const existingCoverage = await prisma.controlCoverage.findFirst({
      where: { orgId, controlId: entry.id },
    });
    if (!existingCoverage) {
      await prisma.controlCoverage.create({
        data: {
          orgId,
          controlId: entry.id,
          coveragePct: DEMO_STARTING_COVERAGE[entry.id] ?? 75,
          source: "DEMO",
        },
      });
    }

    const demoEvidence = DEMO_EVIDENCE[entry.id];
    if (demoEvidence) {
      const existingEvidence = await prisma.evidence.findFirst({ where: { orgId, controlId: entry.id } });
      if (!existingEvidence) {
        const rows = parseCsvToRows(demoEvidence.csv);
        await prisma.evidence.create({
          data: {
            orgId,
            controlId: entry.id,
            filename: demoEvidence.filename,
            contentType: "csv",
            sizeBytes: Buffer.byteLength(demoEvidence.csv, "utf-8"),
            summary: `CSV, ${rows.length} rows (DEMO)`,
            parsedRows: rows,
            rawText: demoEvidence.csv,
          },
        });
      }
    }
  }

  for (const scenario of scenarios) {
    await prisma.scenario.upsert({
      where: { id: scenario.id },
      create: scenario,
      update: scenario,
    });
  }

  console.log(`Seeded ${catalog.length} controls and ${scenarios.length} scenarios.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
