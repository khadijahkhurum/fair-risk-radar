// Resets every control back to its demo starting coverage — useful after
// testing manual overrides or an AWS Config sync against a scratch account.
//
// Run directly via tsx, not the `prisma` CLI, so .env needs loading explicitly.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  const controls = await prisma.control.findMany();
  for (const control of controls) {
    await prisma.controlCoverage.create({
      data: {
        controlId: control.id,
        coveragePct: DEMO_STARTING_COVERAGE[control.id] ?? 75,
        source: "DEMO",
      },
    });
  }
  console.log(`Reset coverage for ${controls.length} controls.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
