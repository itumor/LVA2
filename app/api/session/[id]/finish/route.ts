import { fail, ok } from "@/lib/http";
import { finishSession, SessionRuleError } from "@/lib/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await finishSession(id);
    return ok(result);
  } catch (error) {
    if (error instanceof SessionRuleError) {
      return fail(error.code, error.status, error.code);
    }
    return fail(error instanceof Error ? error.message : "Failed to finish session");
  }
}
