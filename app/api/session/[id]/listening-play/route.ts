import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { recordListeningPlay, SessionRuleError } from "@/lib/session";

const schema = z.object({
  taskId: z.string(),
  playEventAt: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = schema.parse(await request.json());
    const result = await recordListeningPlay({
      sessionId: id,
      taskId: body.taskId,
      playEventAt: body.playEventAt,
    });

    return ok(result);
  } catch (error) {
    if (error instanceof SessionRuleError) {
      return fail(error.code, error.status, error.code);
    }
    return fail(error instanceof Error ? error.message : "Failed to track listening play");
  }
}
