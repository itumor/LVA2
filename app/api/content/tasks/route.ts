import { fail, ok } from "@/lib/http";
import { getTasks } from "@/lib/content";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tasks = await getTasks({
      skill: searchParams.get("skill") ?? undefined,
      topic: searchParams.get("topic") ?? undefined,
      type: searchParams.get("type") ?? undefined,
    });

    return ok(tasks);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to fetch tasks");
  }
}
