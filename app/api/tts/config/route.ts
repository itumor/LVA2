import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { getActiveTtsConfig, upsertActiveTtsConfig } from "@/lib/tts-config";
import { hasInstalledModel, isSafeModelId } from "@/lib/tts-models";
import { fetchRaivisModels } from "@/lib/hf-models";

const schema = z.object({
  provider: z.enum(["piper", "f5"]),
  modelId: z.string().min(1),
  rate: z.coerce.number().min(0.7).max(1.3),
});

export async function GET() {
  const config = await getActiveTtsConfig();
  return ok(config);
}

export async function PUT(request: Request) {
  try {
    const parsed = schema.parse(await request.json());
    if (parsed.provider === "piper") {
      if (!isSafeModelId(parsed.modelId)) {
        return fail("Invalid modelId", 400, "INVALID_MODEL_ID");
      }
      if (!(await hasInstalledModel(parsed.modelId))) {
        return fail("Model is not installed locally", 400, "MODEL_NOT_INSTALLED");
      }
    } else {
      const models = await fetchRaivisModels();
      const f5 = models.find((m) => m.id === parsed.modelId && m.runtime === "f5");
      if (!f5) return fail("Unsupported F5 model", 400, "UNSUPPORTED_F5_MODEL");
    }

    const config = await upsertActiveTtsConfig(parsed);
    return ok(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues.map((i) => i.message).join("; "), 400, "INVALID_PAYLOAD");
    }
    return fail(error instanceof Error ? error.message : "Failed to save config", 500, "CONFIG_SAVE_FAILED");
  }
}
