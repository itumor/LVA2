export type RaivisModel = {
  id: string;
  repo: string;
  task: string;
  supportedInApp: boolean;
  runtime: "piper" | "whisper" | "f5" | "unknown";
};

type HfModelItem = {
  id?: string;
  pipeline_tag?: string;
};

export async function fetchRaivisModels(): Promise<RaivisModel[]> {
  const response = await fetch("https://huggingface.co/api/models?author=RaivisDejus&limit=100", {
    headers: { "User-Agent": "LVA2-TTS-Model-Lab" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Hugging Face request failed (${response.status})`);
  }

  const items = (await response.json()) as HfModelItem[];
  const models: RaivisModel[] = [];

  for (const item of items) {
    const id = item.id ?? "";
    if (!id.startsWith("RaivisDejus/")) continue;
    const repo = id.split("/")[1] ?? id;

    let runtime: RaivisModel["runtime"] = "unknown";
    if (/^Piper-/i.test(repo)) runtime = "piper";
    else if (/^whisper(\.|-)/i.test(repo)) runtime = "whisper";
    else if (/^F5-/i.test(repo)) runtime = "f5";

    const task = item.pipeline_tag ?? (runtime === "whisper" ? "automatic-speech-recognition" : runtime === "piper" || runtime === "f5" ? "text-to-speech" : "unknown");

    models.push({
      id,
      repo,
      task,
      runtime,
      supportedInApp: runtime === "piper",
    });
  }

  models.sort((a, b) => a.repo.localeCompare(b.repo));
  return models;
}
