// Standard Next.js singleton so hot-reload in dev doesn't open a new
// PrismaClient (and a new DB connection pool) on every file save.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
