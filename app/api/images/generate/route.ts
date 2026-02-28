import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { LocalImageError, generateImageWithCache } from "@/lib/local-image";
import { OpenAICompatibleError } from "@/lib/openai-compatible";

const requestSchema = z.object({
  prompt: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  skill: z.enum(["WRITING", "SPEAKING"]),
  taskType: z.enum(["PICTURE_SENTENCE", "IMAGE_DESCRIPTION"]),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.parse(await request.json());
    const result = await generateImageWithCache({
      prompt: parsed.prompt,
    });

    return ok({
      imageUrl: result.imageUrl,
      cacheHit: result.cacheHit,
      model: result.model,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues.map((issue) => issue.message).join("; "), 400, "INVALID_PAYLOAD");
    }

    if (error instanceof LocalImageError) {
      return fail(error.message, error.status, error.code);
    }

    if (error instanceof OpenAICompatibleError) {
      return fail(error.message, error.status ?? 502, error.code);
    }

    return fail(error instanceof Error ? error.message : "Image generation failed", 502, "IMAGE_GENERATION_FAILED");
  }
}
