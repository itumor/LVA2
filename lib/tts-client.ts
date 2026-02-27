export type ClientTtsConfig = { provider?: "piper" | "f5"; modelId: string; rate: number };

let cachedConfig: ClientTtsConfig | null = null;
let inflight: Promise<ClientTtsConfig | null> | null = null;

export function primeClientTtsConfig(config: ClientTtsConfig | null) {
  cachedConfig = config;
}

export async function getClientTtsConfig() {
  if (cachedConfig) return cachedConfig;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch("/api/tts/config", { method: "GET" });
      const payload = (await response.json()) as
        | { ok: true; data: { provider?: "piper" | "f5"; modelId: string; rate: number } | null }
        | { ok: false };
      if (!response.ok || !payload.ok || !payload.data) {
        return null;
      }

      cachedConfig = {
        provider: payload.data.provider,
        modelId: payload.data.modelId,
        rate: payload.data.rate,
      };
      return cachedConfig;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
