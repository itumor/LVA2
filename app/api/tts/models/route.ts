import { ok } from "@/lib/http";
import { getActiveTtsConfig } from "@/lib/tts-config";
import { listInstalledTtsModels } from "@/lib/tts-models";
import { fetchRaivisModels } from "@/lib/hf-models";

export async function GET() {
  const [installedPiper, activeConfig, catalog] = await Promise.all([
    listInstalledTtsModels(),
    getActiveTtsConfig(),
    fetchRaivisModels().catch(() => []),
  ]);

  const piperModels = installedPiper.map((m) => ({ ...m, provider: "piper" as const }));
  const f5Models = catalog
    .filter((m) => m.runtime === "f5")
    .map((m) => ({
      id: m.id,
      label: m.repo,
      filesPresent: { onnx: false, json: false },
      provider: "f5" as const,
    }));

  return ok({ models: [...piperModels, ...f5Models], activeConfig });
}
