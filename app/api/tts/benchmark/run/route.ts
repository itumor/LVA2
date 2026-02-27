import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { hasInstalledModel, isSafeModelId } from "@/lib/tts-models";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { normalizeTtsText, synthesizeWithCache, ttsEnabled } from "@/lib/tts";
import { fetchRaivisModels } from "@/lib/hf-models";

const schema = z.object({
  provider: z.enum(["piper", "f5"]).optional().default("piper"),
  modelId: z.string().min(1),
  rate: z.coerce.number().min(0.7).max(1.3),
  promptId: z.string().optional(),
  text: z.string().optional(),
});

const promptPack: Record<string, string> = {
  p1: "Labdien! Mani sauc Anna, un es mācos latviešu valodu.",
  p2: "Šodien ir 14. februāris, pulkstenis ir 17:35.",
  p3: "Dzīvoklis atrodas centrā, netālu no stacijas un tirgus.",
  p4: "Vai jūs varat pateikt, cik maksā īre mēnesī?",
  p5: "Rīt būs saulains laiks, bet vakarā iespējams neliels lietus.",
  p6: "Es vēlētos rezervēt galdiņu diviem cilvēkiem plkst. septiņos.",
};

export async function POST(request: Request) {
  if (!ttsEnabled()) {
    return fail("Local TTS is disabled by server configuration.", 503, "TTS_DISABLED");
  }

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
      const catalog = await fetchRaivisModels();
      const f5 = catalog.find((m) => m.id === parsed.modelId && m.runtime === "f5");
      if (!f5) return fail("Unsupported F5 model", 400, "UNSUPPORTED_F5_MODEL");
    }

    const promptText = normalizeTtsText(parsed.text ?? (parsed.promptId ? promptPack[parsed.promptId] ?? "" : ""));
    if (!promptText) {
      return fail("Prompt text is required", 400, "MISSING_PROMPT_TEXT");
    }

    const started = performance.now();
    try {
      let synthesis: { audioUrl: string; cacheHit: boolean; format: "wav" };
      let providerUsed: "piper" | "f5" = parsed.provider;
      let warning: string | undefined;

      if (parsed.provider === "piper") {
        synthesis = await synthesizeWithCache({
          text: promptText,
          lang: "lv",
          voice: parsed.modelId,
          rate: parsed.rate,
        });
      } else {
        const base = process.env.TTS_F5_BASE_URL?.trim() || "http://f5-tts:5002";
        try {
          const response = await fetch(`${base}/synthesize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: promptText, lang: "lv", voice: parsed.modelId, rate: parsed.rate }),
          });
          if (!response.ok) throw new Error(`F5 unavailable (${response.status})`);
          const data = (await response.json()) as { audioUrl: string; cacheHit?: boolean; format?: "wav" };
          synthesis = { audioUrl: data.audioUrl, cacheHit: Boolean(data.cacheHit), format: data.format ?? "wav" };
        } catch {
          synthesis = await synthesizeWithCache({
            text: promptText,
            lang: "lv",
            voice: process.env.TTS_DEFAULT_VOICE?.trim() || "lv_LV-aivars-medium",
            rate: parsed.rate,
          });
          providerUsed = "piper";
          warning = "F5 provider unavailable; used Piper fallback.";
        }
      }
      const latencyMs = Math.round(performance.now() - started);

      const run = await prisma.ttsBenchmarkRun.create({
        data: {
          learnerId: DEFAULT_LEARNER_ID,
          modelId: parsed.modelId,
          rate: parsed.rate,
          promptId: parsed.promptId,
          promptText,
          latencyMs,
          audioUrl: synthesis.audioUrl,
          cacheHit: synthesis.cacheHit,
        },
      });

      return ok({ runId: run.id, audioUrl: synthesis.audioUrl, latencyMs, cacheHit: synthesis.cacheHit, providerUsed, warning });
    } catch (error) {
      const run = await prisma.ttsBenchmarkRun.create({
        data: {
          learnerId: DEFAULT_LEARNER_ID,
          modelId: parsed.modelId,
          rate: parsed.rate,
          promptId: parsed.promptId,
          promptText,
          error: error instanceof Error ? error.message : "Synthesis failed",
        },
      });

      return fail(`Synthesis failed (run: ${run.id})`, 502, "BENCHMARK_SYNTH_FAILED");
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues.map((i) => i.message).join("; "), 400, "INVALID_PAYLOAD");
    }
    return fail(error instanceof Error ? error.message : "Benchmark run failed", 500, "BENCHMARK_RUN_FAILED");
  }
}
