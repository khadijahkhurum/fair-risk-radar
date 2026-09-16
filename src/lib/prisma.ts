import { PrismaClient } from "@prisma/client";

// Standard Next.js pattern: reuse one PrismaClient across hot reloads in dev
// so each edit doesn't open a fresh pool of DB connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
