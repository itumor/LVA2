import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tts-config", () => ({
  getActiveTtsConfig: vi.fn(async () => ({ provider: "piper", modelId: "lv_LV-aivars-medium", rate: 1 })),
  upsertActiveTtsConfig: vi.fn(async ({ provider, modelId, rate }: { provider: "piper" | "f5"; modelId: string; rate: number }) => ({
    provider,
    modelId,
    rate,
    updatedAt: new Date().toISOString(),
  })),
}));

vi.mock("@/lib/tts-models", () => ({
  hasInstalledModel: vi.fn(async () => true),
  isSafeModelId: vi.fn(() => true),
}));
vi.mock("@/lib/hf-models", () => ({
  fetchRaivisModels: vi.fn(async () => [{ id: "RaivisDejus/F5-TTS-Latvian", runtime: "f5" }]),
}));

describe("/api/tts/config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns active config", async () => {
    const { GET } = await import("@/app/api/tts/config/route");
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.provider).toBe("piper");
    expect(payload.data.modelId).toBe("lv_LV-aivars-medium");
  });

  it("saves valid config", async () => {
    const { PUT } = await import("@/app/api/tts/config/route");
    const response = await PUT(
      new Request("http://localhost/api/tts/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "piper", modelId: "lv_LV-aivars-medium", rate: 1.1 }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.rate).toBe(1.1);
  });

  it("rejects out-of-range rate", async () => {
    const { PUT } = await import("@/app/api/tts/config/route");
    const response = await PUT(
      new Request("http://localhost/api/tts/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "piper", modelId: "lv_LV-aivars-medium", rate: 1.8 }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
