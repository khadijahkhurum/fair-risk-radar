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
  // Coverage is per organisation now (audit S2), so a reset is per
  // organisation too — the control catalogue itself is still global.
  const [controls, orgs] = await Promise.all([
    prisma.control.findMany(),
    prisma.organisation.findMany({ select: { id: true, slug: true } }),
  ]);

  if (orgs.length === 0) {
    console.log("No organisations found. Run `npm run db:seed` first.");
    return;
  }

  for (const org of orgs) {
    for (const control of controls) {
      await prisma.controlCoverage.create({
        data: {
          orgId: org.id,
          controlId: control.id,
          coveragePct: DEMO_STARTING_COVERAGE[control.id] ?? 75,
          source: "DEMO",
        },
      });
    }
    console.log(`Reset coverage for ${controls.length} controls in "${org.slug}".`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
