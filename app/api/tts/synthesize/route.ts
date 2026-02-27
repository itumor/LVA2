import { z } from "zod";
import { fail, ok } from "@/lib/http";
import {
  getTtsMaxChars,
  normalizeTtsText,
  synthesizeWithCache,
  ttsEnabled,
} from "@/lib/tts";
import { getActiveTtsConfig } from "@/lib/tts-config";

const requestSchema = z.object({
  text: z.string(),
  lang: z.literal("lv").optional().default("lv"),
  provider: z.enum(["piper", "f5"]).optional(),
  voice: z.string().trim().min(1).optional(),
  rate: z.coerce.number().min(0.7).max(1.3).optional(),
});

export async function POST(request: Request) {
  if (!ttsEnabled()) {
    return fail("Local TTS is disabled by server configuration.", 503, "TTS_DISABLED");
  }

  try {
    const json = await request.json();
    const parsed = requestSchema.parse(json);
    const text = normalizeTtsText(parsed.text);

    if (!text) {
      return fail("Text is required", 400, "INVALID_TEXT");
    }

    const maxChars = getTtsMaxChars();
    if (text.length > maxChars) {
      return fail(`Text exceeds maximum length (${maxChars}).`, 413, "TEXT_TOO_LONG");
    }

    const activeConfig = await getActiveTtsConfig();
    const provider = parsed.provider ?? activeConfig?.provider ?? "piper";
    const voice =
      parsed.voice ??
      activeConfig?.modelId ??
      (process.env.TTS_DEFAULT_VOICE?.trim() || "lv_LV-aivars-medium");
    const rate = parsed.rate ?? activeConfig?.rate ?? 1;

    let result: { audioUrl: string; cacheHit: boolean; format: "wav" };
    if (provider === "piper") {
      result = await synthesizeWithCache({
        text,
        lang: parsed.lang,
        voice,
        rate,
      });
    } else {
      const base = process.env.TTS_F5_BASE_URL?.trim() || "http://f5-tts:5002";
      try {
        const response = await fetch(`${base}/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, lang: parsed.lang, voice, rate }),
        });
        if (!response.ok) {
          const fallback = await synthesizeWithCache({
            text,
            lang: parsed.lang,
            voice: process.env.TTS_DEFAULT_VOICE?.trim() || "lv_LV-aivars-medium",
            rate,
          });
          return ok({
            audioUrl: fallback.audioUrl,
            cacheHit: fallback.cacheHit,
            format: fallback.format,
            providerUsed: "piper",
            warning: "F5 provider unavailable; used Piper fallback.",
          });
        }
        const data = (await response.json()) as { audioUrl: string; cacheHit?: boolean; format?: "wav" };
        result = { audioUrl: data.audioUrl, cacheHit: Boolean(data.cacheHit), format: data.format ?? "wav" };
      } catch {
        const fallback = await synthesizeWithCache({
          text,
          lang: parsed.lang,
          voice: process.env.TTS_DEFAULT_VOICE?.trim() || "lv_LV-aivars-medium",
          rate,
        });
        return ok({
          audioUrl: fallback.audioUrl,
          cacheHit: fallback.cacheHit,
          format: fallback.format,
          providerUsed: "piper",
          warning: "F5 provider unavailable; used Piper fallback.",
        });
      }
    }

    return ok({
      audioUrl: result.audioUrl,
      cacheHit: result.cacheHit,
      format: result.format,
      providerUsed: provider,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues.map((issue) => issue.message).join("; "), 400, "INVALID_PAYLOAD");
    }

    return fail(
      error instanceof Error ? error.message : "TTS synthesis failed",
      502,
      "TTS_PROVIDER_ERROR",
    );
  }
}
