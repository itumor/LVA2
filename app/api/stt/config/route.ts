import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { getActiveSttConfig, upsertActiveSttConfig } from "@/lib/stt-config";
import { listSttModels } from "@/lib/stt-models";

const schema = z.object({
  provider: z.enum(["browser", "whisper-ct2", "whisper-transformers", "whisper-cpp"]),
  modelId: z.string().min(1),
});

export async function GET() {
  return ok(await getActiveSttConfig());
}

export async function PUT(request: Request) {
  try {
    const parsed = schema.parse(await request.json());

    if (parsed.provider !== "browser") {
      const models = await listSttModels();
      const found = models.find((m) => m.id === parsed.modelId && m.provider === parsed.provider);
      if (!found) return fail("STT model/provider not supported", 400, "UNSUPPORTED_STT_MODEL");
    }

    return ok(await upsertActiveSttConfig(parsed));
  } catch (error) {
    if (error instanceof z.ZodError) return fail(error.issues.map((i) => i.message).join("; "), 400, "INVALID_PAYLOAD");
    return fail(error instanceof Error ? error.message : "STT config save failed", 500, "STT_CONFIG_SAVE_FAILED");
  }
}
