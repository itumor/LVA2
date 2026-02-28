import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

describe("POST /api/images/generate", () => {
  const originalFetch = global.fetch;
  const originalModel = process.env.LOCAL_IMAGE_MODEL;
  const originalBase = process.env.LOCAL_IMAGE_BASE_URL;
  const originalApiKey = process.env.LOCAL_IMAGE_API_KEY;
  const originalOutputDir = process.env.LOCAL_IMAGE_OUTPUT_DIR;

  let tempDir = "";

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lva2-images-"));
    process.env.LOCAL_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
    process.env.LOCAL_IMAGE_BASE_URL = "http://fake-images";
    process.env.LOCAL_IMAGE_API_KEY = "local-ai";
    process.env.LOCAL_IMAGE_OUTPUT_DIR = tempDir;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalModel === undefined) delete process.env.LOCAL_IMAGE_MODEL;
    else process.env.LOCAL_IMAGE_MODEL = originalModel;

    if (originalBase === undefined) delete process.env.LOCAL_IMAGE_BASE_URL;
    else process.env.LOCAL_IMAGE_BASE_URL = originalBase;

    if (originalApiKey === undefined) delete process.env.LOCAL_IMAGE_API_KEY;
    else process.env.LOCAL_IMAGE_API_KEY = originalApiKey;

    if (originalOutputDir === undefined) delete process.env.LOCAL_IMAGE_OUTPUT_DIR;
    else process.env.LOCAL_IMAGE_OUTPUT_DIR = originalOutputDir;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects empty prompt", async () => {
    const { POST } = await import("@/app/api/images/generate/route");
    const response = await POST(
      new Request("http://localhost/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "   ",
          taskId: "task-1",
          questionId: "q1",
          skill: "WRITING",
          taskType: "PICTURE_SENTENCE",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns generated image URL and cache hit on repeat call", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const b64 = Buffer.from(pngBytes).toString("base64");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const { POST } = await import("@/app/api/images/generate/route");
    const request = new Request("http://localhost/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "ģimene parkā",
        taskId: "task-1",
        questionId: "q1",
        skill: "SPEAKING",
        taskType: "IMAGE_DESCRIPTION",
      }),
    });

    const first = await POST(request.clone());
    const firstPayload = await first.json();

    expect(first.status).toBe(200);
    expect(firstPayload.ok).toBe(true);
    expect(firstPayload.data.cacheHit).toBe(false);
    expect(firstPayload.data.imageUrl).toMatch(/^\/generated\/images\/[a-f0-9]{64}\.png$/);

    const second = await POST(request.clone());
    const secondPayload = await second.json();

    expect(second.status).toBe(200);
    expect(secondPayload.ok).toBe(true);
    expect(secondPayload.data.cacheHit).toBe(true);
    expect(secondPayload.data.imageUrl).toBe(firstPayload.data.imageUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns clear error when LOCAL_IMAGE_MODEL is missing", async () => {
    delete process.env.LOCAL_IMAGE_MODEL;

    const { POST } = await import("@/app/api/images/generate/route");
    const response = await POST(
      new Request("http://localhost/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "cilvēks autobusā",
          taskId: "task-2",
          questionId: "q2",
          skill: "WRITING",
          taskType: "PICTURE_SENTENCE",
        }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("IMAGE_MODEL_MISSING");
  });
});
