/**
 * Seeds the database from the compliance-as-code catalog (controls/catalog.yaml)
 * and the industry scenario definitions (src/lib/scenarios.ts).
 *
 * Run with: npm run db:seed
 * Safe to re-run — every write is an upsert.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { PrismaClient } from "@prisma/client";
import { SCENARIO_DEFINITIONS } from "../src/lib/scenarios";
import { DEMO_COVERAGE } from "../src/lib/aws-config";

const prisma = new PrismaClient();

interface CatalogEntry {
  key: string;
  name: string;
  description: string;
  weight: number;
  frameworkMappings: Record<string, string>;
}

async function main() {
  const catalogPath = join(__dirname, "..", "controls", "catalog.yaml");
  const catalog = yaml.load(readFileSync(catalogPath, "utf8")) as CatalogEntry[];

  console.log(`Seeding ${catalog.length} controls from controls/catalog.yaml...`);
  const controlsByKey: Record<string, { id: string }> = {};
  for (const entry of catalog) {
    const control = await prisma.control.upsert({
      where: { key: entry.key },
      update: {
        name: entry.name,
        description: entry.description.trim(),
        weight: entry.weight,
        frameworkMappings: entry.frameworkMappings,
      },
      create: {
        key: entry.key,
        name: entry.name,
        description: entry.description.trim(),
        weight: entry.weight,
        frameworkMappings: entry.frameworkMappings,
      },
    });
    controlsByKey[entry.key] = control;
  }

  console.log(`Seeding ${SCENARIO_DEFINITIONS.length} scenarios...`);
  for (const def of SCENARIO_DEFINITIONS) {
    const scenario = await prisma.scenario.upsert({
      where: { key: def.key },
      update: {
        label: def.label,
        threat: def.threat,
        sourceCitation: def.sourceCitation,
        toleranceUsd: def.toleranceUsd,
        tef: def.profile.tef,
        vulnBaseline: def.profile.vulnBaseline,
        secProb: def.profile.secProb,
        lossPrimary: def.profile.lossPrimary,
        lossSecondary: def.profile.lossSecondary,
      },
      create: {
        key: def.key,
        label: def.label,
        threat: def.threat,
        sourceCitation: def.sourceCitation,
        toleranceUsd: def.toleranceUsd,
        tef: def.profile.tef,
        vulnBaseline: def.profile.vulnBaseline,
        secProb: def.profile.secProb,
        lossPrimary: def.profile.lossPrimary,
        lossSecondary: def.profile.lossSecondary,
      },
    });

    for (const key of Object.keys(controlsByKey) as Array<keyof typeof DEMO_COVERAGE>) {
      await prisma.controlCoverage.upsert({
        where: { scenarioId_controlId: { scenarioId: scenario.id, controlId: controlsByKey[key].id } },
        update: {},
        create: {
          scenarioId: scenario.id,
          controlId: controlsByKey[key].id,
          coveragePct: DEMO_COVERAGE[key],
          source: "manual",
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
