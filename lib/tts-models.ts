import path from "node:path";
import { readdir, stat } from "node:fs/promises";

export type InstalledTtsModel = {
  id: string;
  label: string;
  filesPresent: { onnx: boolean; json: boolean };
  sizeBytes?: number;
  updatedAt?: string;
};

const MODEL_ID_RE = /^[a-zA-Z0-9._-]+$/;

export function getTtsModelDir() {
  return process.env.TTS_MODEL_DIR?.trim() || path.join(process.cwd(), "tts-models");
}

export function isSafeModelId(modelId: string) {
  return MODEL_ID_RE.test(modelId);
}

function prettifyModelLabel(id: string) {
  return id.replace(/[-_]+/g, " ");
}

export async function listInstalledTtsModels(): Promise<InstalledTtsModel[]> {
  const modelDir = getTtsModelDir();

  let entries: string[] = [];
  try {
    entries = await readdir(modelDir);
  } catch {
    return [];
  }

  const byId = new Map<string, InstalledTtsModel>();

  for (const entry of entries) {
    if (!entry.endsWith(".onnx") && !entry.endsWith(".onnx.json")) continue;
    const baseId = entry.endsWith(".onnx.json") ? entry.slice(0, -10) : entry.slice(0, -5);
    if (!isSafeModelId(baseId)) continue;

    const current = byId.get(baseId) ?? {
      id: baseId,
      label: prettifyModelLabel(baseId),
      filesPresent: { onnx: false, json: false },
    };

    if (entry.endsWith(".onnx")) {
      current.filesPresent.onnx = true;
      try {
        const s = await stat(path.join(modelDir, entry));
        current.sizeBytes = s.size;
        current.updatedAt = s.mtime.toISOString();
      } catch {
        // ignore
      }
    }
    if (entry.endsWith(".onnx.json")) {
      current.filesPresent.json = true;
    }

    byId.set(baseId, current);
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export async function hasInstalledModel(modelId: string) {
  if (!isSafeModelId(modelId)) return false;
  const models = await listInstalledTtsModels();
  return models.some((m) => m.id === modelId && m.filesPresent.onnx);
}
