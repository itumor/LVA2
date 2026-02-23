import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/http";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: "healthy", timestamp: new Date().toISOString() });
  } catch {
    return fail("Database not ready", 503);
  }
}
