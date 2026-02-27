import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildTtsCacheKey, synthesizeWithCache } from "@/lib/tts";

describe("tts cache", () => {
  const originalFetch = global.fetch;
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lva2-tts-"));
    process.env.TTS_CACHE_DIR = tempDir;
    process.env.TTS_PIPER_BASE_URL = "http://fake-tts";
    global.fetch = vi.fn(async () => {
      const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
      return new Response(bytes, { status: 200, headers: { "Content-Type": "audio/wav" } });
    }) as typeof fetch;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    delete process.env.TTS_CACHE_DIR;
    delete process.env.TTS_PIPER_BASE_URL;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("builds deterministic cache key", () => {
    const a = buildTtsCacheKey({ text: "Sveiki", lang: "lv", voice: "lv_LV-default", rate: 1 });
    const b = buildTtsCacheKey({ text: "Sveiki", lang: "lv", voice: "lv_LV-default", rate: 1 });
    expect(a).toBe(b);
  });

  it("returns cache miss then hit for same input", async () => {
    const input = { text: "Labdien", lang: "lv" as const, voice: "lv_LV-default", rate: 1 };

    const first = await synthesizeWithCache(input);
    expect(first.cacheHit).toBe(false);

    const second = await synthesizeWithCache(input);
    expect(second.cacheHit).toBe(true);
  });
});
