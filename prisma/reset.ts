// Wipe the transactional data and leave the catalogue intact, so a public
// demo can be returned to a known state.
//
// Why this exists: every visitor to the deployed app shares one database.
// For a real GRC tool that is correct — an audit trail is organisation-wide,
// not per-visitor. For a public portfolio link it means strangers' edits
// accumulate in your demo. Run this before showing it to anyone.
//
// Controls and Scenarios survive; run `npm run db:seed` after this to restore
// demo coverage and evidence (the db:reset script chains both).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Order matters: Risk references RiskAssessment, Evidence and
  // ControlCoverage reference Control.
  const risks = await prisma.risk.deleteMany({});
  const runs = await prisma.riskAssessment.deleteMany({});
  const evidence = await prisma.evidence.deleteMany({});
  const coverage = await prisma.controlCoverage.deleteMany({});

  console.log(
    `Reset: removed ${risks.count} risks, ${runs.count} simulation runs, ` +
      `${evidence.count} evidence records, ${coverage.count} coverage records.`
  );
  console.log("Run `npm run db:seed` to restore the demo baseline.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
