import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { buildDailyPlan } from "@/lib/daily-plan";
import { fail, ok } from "@/lib/http";

export async function GET() {
  try {
    const plan = await buildDailyPlan(DEFAULT_LEARNER_ID);
    return ok(plan);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to build daily plan");
  }
}
