import { getActiveSttConfig } from "@/lib/stt-config";

export type SttTranscriptionResult = {
  text: string;
  provider: string;
  modelId: string;
};

export async function transcribeWithActiveStt(file: File) {
  const active = await getActiveSttConfig();
  if (!active || active.provider === "browser") {
    throw new Error("Server STT is not active. Choose a Whisper provider in Settings.");
  }

  const base = process.env.STT_BASE_URL?.trim() || "http://stt:5003";
  const payload = new FormData();
  payload.set("file", file);
  payload.set("provider", active.provider);
  payload.set("modelId", active.modelId);
  payload.set("language", "lv");

  const resp = await fetch(`${base}/transcribe`, { method: "POST", body: payload });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`STT provider error (${resp.status}): ${body}`);
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
