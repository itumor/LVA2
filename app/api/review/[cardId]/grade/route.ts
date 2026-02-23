import { z } from "zod";
import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { gradeReviewCard } from "@/lib/daily-plan";
import { fail, ok } from "@/lib/http";

const schema = z.object({
  grade: z.number().int().min(0).max(5),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId } = await params;
    const body = schema.parse(await request.json());
    const card = await gradeReviewCard({
      cardId,
      learnerId: DEFAULT_LEARNER_ID,
      grade: body.grade,
    });

    return ok(card);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grade card");
  }
}
