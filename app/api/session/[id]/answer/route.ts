import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { SessionRuleError, submitAnswer } from "@/lib/session";

const schema = z.object({
  taskId: z.string(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
  confidence: z.number().min(1).max(5).optional(),
  source: z.enum(["EXAM", "TRAINER", "REVIEW"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = schema.parse(await request.json());
    const result = await submitAnswer({
      sessionId: id,
      taskId: body.taskId,
      answers: body.answers,
      confidence: body.confidence,
      source: body.source,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof SessionRuleError) {
      return fail(error.code, error.status, error.code);
    }
    return fail(error instanceof Error ? error.message : "Failed to submit answer");
  }
}
