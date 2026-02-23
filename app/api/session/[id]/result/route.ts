import { fail, ok } from "@/lib/http";
import { getSessionResult } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await getSessionResult(id);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load result", 404);
  }
}
