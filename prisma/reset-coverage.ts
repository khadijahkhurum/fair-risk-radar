/**
 * Resets every scenario's control coverage back to the manual baseline.
 *
 * Useful after experimenting with the AWS Config sync in demo mode, which
 * relabels coverage rows as "demo". Run with: npm run db:reset-coverage
 */
import { PrismaClient } from "@prisma/client";
import { DEMO_COVERAGE } from "../src/lib/aws-config";

const prisma = new PrismaClient();

async function main() {
  const coverage = await prisma.controlCoverage.findMany({ include: { control: true } });

  for (const row of coverage) {
    const key = row.control.key as keyof typeof DEMO_COVERAGE;
    await prisma.controlCoverage.update({
      where: { id: row.id },
      data: {
        coveragePct: DEMO_COVERAGE[key] ?? row.coveragePct,
        source: "manual",
      },
    });
  }

  console.log(`Reset ${coverage.length} control coverage rows to manual baseline.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
