import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  runId: z.string().min(1),
  naturalness: z.coerce.number().int().min(1).max(5),
  pronunciation: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json());

    const run = await prisma.ttsBenchmarkRun.findUnique({ where: { id: parsed.runId } });
    if (!run) return fail("Benchmark run not found", 404, "RUN_NOT_FOUND");
    if (run.error) return fail("Cannot rate failed benchmark run", 400, "RUN_HAS_ERROR");

    const existing = await prisma.ttsBenchmarkRating.findUnique({ where: { runId: parsed.runId } });
    if (existing) return fail("Run already rated", 409, "RUN_ALREADY_RATED");

    const rating = await prisma.ttsBenchmarkRating.create({
      data: {
        runId: parsed.runId,
        naturalness: parsed.naturalness,
        pronunciation: parsed.pronunciation,
        notes: parsed.notes,
      },
    });

    return ok(rating);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues.map((i) => i.message).join("; "), 400, "INVALID_PAYLOAD");
    }
    return fail(error instanceof Error ? error.message : "Rating failed", 500, "BENCHMARK_RATE_FAILED");
  }
}
