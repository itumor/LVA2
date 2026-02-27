import { createHash } from "node:crypto";
import { mkdir, access, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";

export type TtsSynthesizeInput = {
  text: string;
  lang: "lv";
  voice: string;
  rate: number;
};

export type TtsSynthesizeResult = {
  fileName: string;
  filePath: string;
  audioUrl: string;
  cacheHit: boolean;
  format: "wav";
};

const synthesisLocks = new Map<string, Promise<TtsSynthesizeResult>>();

export function ttsEnabled() {
  return (process.env.TTS_ENABLED ?? "true").toLowerCase() === "true";
}

export function getTtsMaxChars() {
  const raw = Number(process.env.TTS_MAX_TEXT_CHARS ?? "500");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 500;
}

export function normalizeTtsText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function resolveTtsCacheDir() {
  return process.env.TTS_CACHE_DIR?.trim() || path.join(process.cwd(), "public", ".cache", "tts");
}

export function resolveTtsAudioUrl(filePath: string) {
  const fileName = path.basename(filePath);
  return `/api/tts/audio/${fileName}`;
}

export function buildTtsCacheKey(input: TtsSynthesizeInput) {
  const normalizedText = normalizeTtsText(input.text);
  return createHash("sha256")
    .update(JSON.stringify({
      lang: input.lang,
      voice: input.voice,
      rate: input.rate,
      text: normalizedText,
    }))
    .digest("hex");
}

async function callPiperService(input: TtsSynthesizeInput): Promise<Uint8Array> {
  const baseUrl = process.env.TTS_PIPER_BASE_URL?.trim() || "http://tts:5001";
  const response = await fetch(`${baseUrl}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: normalizeTtsText(input.text),
      lang: input.lang,
      voice: input.voice,
      rate: input.rate,
    }),
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      details = "";
    }
    throw new Error(`Piper unavailable (${response.status})${details ? `: ${details}` : ""}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export function synthesizeWithCache(input: TtsSynthesizeInput) {
  const cacheKey = buildTtsCacheKey(input);
  const existing = synthesisLocks.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const cacheDir = resolveTtsCacheDir();
    await mkdir(cacheDir, { recursive: true });

    const fileName = `${cacheKey}.wav`;
    const filePath = path.join(cacheDir, fileName);

    try {
      await access(filePath);
      return {
        fileName,
        filePath,
        audioUrl: resolveTtsAudioUrl(filePath),
        cacheHit: true,
        format: "wav" as const,
      };
    } catch {
      // Cache miss.
    }

    const audioBytes = await callPiperService(input);
    if (!audioBytes.byteLength) {
      throw new Error("Piper returned empty audio.");
    }

    const tempPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, audioBytes);

    try {
      // Verify file can be read before publishing.
      await readFile(tempPath);
      await writeFile(filePath, audioBytes);
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }

    return {
      fileName,
      filePath,
      audioUrl: resolveTtsAudioUrl(filePath),
      cacheHit: false,
      format: "wav" as const,
    };
  })().finally(() => {
    synthesisLocks.delete(cacheKey);
  });

  synthesisLocks.set(cacheKey, promise);
  return promise;
}
