import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { parseSkill, SessionRuleError, submitSection } from "@/lib/session";

const schema = z.object({
  skill: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = schema.parse(await request.json());
    const result = await submitSection({
      sessionId: id,
      skill: parseSkill(body.skill),
    });
    return ok(result);
  } catch (error) {
    if (error instanceof SessionRuleError) {
      return fail(error.code, error.status, error.code);
    }
    return fail(error instanceof Error ? error.message : "Failed to submit section");
  }
}
