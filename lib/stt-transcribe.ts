import { getActiveSttConfig } from "@/lib/stt-config";

export type SttTranscriptionResult = {
  text: string;
  provider: string;
  modelId: string;
};

type SttOverride = {
  provider: "whisper-ct2" | "whisper-transformers" | "whisper-cpp";
  modelId: string;
};

export async function transcribeWithActiveStt(file: File, override?: SttOverride) {
  const active = override ?? (await getActiveSttConfig());
  if (!active || active.provider === "browser") {
    throw new Error("Server STT is not active. Choose a Whisper provider in Settings.");
  }

  const configuredBase = process.env.STT_BASE_URL?.trim();
  const candidateBases = configuredBase ? [configuredBase] : ["http://stt:5003", "http://localhost:5003"];
  const payload = new FormData();
  payload.set("file", file);
  payload.set("provider", active.provider);
  payload.set("modelId", active.modelId);
  payload.set("language", "lv");

  let body = "";
  let lastError: unknown = null;
  let providerError: string | null = null;
  for (const base of candidateBases) {
    try {
      const resp = await fetch(`${base}/transcribe`, { method: "POST", body: payload });
      body = await resp.text();
      if (!resp.ok) {
        providerError = `STT provider error (${resp.status}) from ${base}: ${body}`;
        continue;
      }
      lastError = null;
      providerError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (providerError) {
    throw new Error(providerError);
  }

  if (lastError) {
    const targets = candidateBases.join(", ");
    throw new Error(
      `STT backend unreachable at ${targets}. Start STT service or set STT_BASE_URL. Last error: ${lastError instanceof Error ? lastError.message : "fetch failed"}`,
    );
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { text: body };
  }

  const asObj = parsed as { text?: string };
  return {
    text: asObj.text ?? "",
    provider: active.provider,
    modelId: active.modelId,
  } as SttTranscriptionResult;
}

function tokenizeWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string[], b: string[]) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export function computeWordAccuracy(referenceText: string, hypothesisText: string) {
  const ref = tokenizeWords(referenceText);
  const hyp = tokenizeWords(hypothesisText);
  if (ref.length === 0) return null;
  const distance = levenshtein(ref, hyp);
  const wer = distance / ref.length;
  const accuracy = Math.max(0, 1 - wer) * 100;
  return Math.round(accuracy * 100) / 100;
}
