import { fetchRaivisModels } from "@/lib/hf-models";

export type SttModel = {
  id: string;
  provider: "whisper-ct2" | "whisper-transformers" | "whisper-cpp";
};

export async function listSttModels(): Promise<SttModel[]> {
  const catalog = await fetchRaivisModels();
  const out: SttModel[] = [];

  for (const m of catalog) {
    if (m.runtime !== "whisper") continue;

    let provider: SttModel["provider"] = "whisper-transformers";
    if (m.repo.includes("-ct2")) provider = "whisper-ct2";
    if (m.repo.includes("whisper.cpp")) provider = "whisper-cpp";

    out.push({ id: m.id, provider });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}
