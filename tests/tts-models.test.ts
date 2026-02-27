import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { isSafeModelId, listInstalledTtsModels } from "@/lib/tts-models";

describe("tts models", () => {
  let tempDir = "";

  afterEach(async () => {
    delete process.env.TTS_MODEL_DIR;
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("validates model ids", () => {
    expect(isSafeModelId("lv_LV-aivars-medium")).toBe(true);
    expect(isSafeModelId("../evil")).toBe(false);
    expect(isSafeModelId("bad/name")).toBe(false);
  });

  it("lists installed models from model directory", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lva2-models-"));
    process.env.TTS_MODEL_DIR = tempDir;

    await writeFile(path.join(tempDir, "lv_LV-aivars-medium.onnx"), "abc");
    await writeFile(path.join(tempDir, "lv_LV-aivars-medium.onnx.json"), "{}");

    const models = await listInstalledTtsModels();
    expect(models.length).toBe(1);
    expect(models[0]?.id).toBe("lv_LV-aivars-medium");
    expect(models[0]?.filesPresent.onnx).toBe(true);
    expect(models[0]?.filesPresent.json).toBe(true);
  });
});
