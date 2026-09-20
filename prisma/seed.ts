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

async function main() {
  const catalogPath = join(__dirname, "..", "controls", "catalog.yaml");
  const catalog = load(readFileSync(catalogPath, "utf-8")) as CatalogEntry[];

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
      where: { controlId: entry.id },
    });
    if (!existingCoverage) {
      await prisma.controlCoverage.create({
        data: {
          controlId: entry.id,
          coveragePct: DEMO_STARTING_COVERAGE[entry.id] ?? 75,
          source: "DEMO",
        },
      });
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
