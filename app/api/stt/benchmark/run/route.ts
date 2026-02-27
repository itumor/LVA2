import { fail, ok } from "@/lib/http";
import { computeWordAccuracy, transcribeWithActiveStt } from "@/lib/stt-transcribe";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const referenceText = String(form.get("referenceText") ?? "").trim();

    if (!(file instanceof File)) {
      return fail("Missing audio file", 400, "MISSING_FILE");
    }

    const started = performance.now();
    const result = await transcribeWithActiveStt(file);
    const latencyMs = Math.round(performance.now() - started);

    const accuracy = referenceText ? computeWordAccuracy(referenceText, result.text) : null;

    return ok({
      provider: result.provider,
      modelId: result.modelId,
      transcript: result.text,
      latencyMs,
      referenceText: referenceText || null,
      wordAccuracy: accuracy,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "STT benchmark failed", 502, "STT_BENCHMARK_FAILED");
  }
}
