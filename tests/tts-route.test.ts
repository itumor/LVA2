import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  synthesizeWithCache: vi.fn(async () => ({
    audioUrl: "/tts-cache/a.wav",
    cacheHit: false,
    format: "wav" as const,
  })),
}));

vi.mock("@/lib/tts-config", () => ({
  getActiveTtsConfig: vi.fn(async () => null),
}));

vi.mock("@/lib/tts", () => ({
  ttsEnabled: vi.fn(() => true),
  getTtsMaxChars: vi.fn(() => 10),
  normalizeTtsText: vi.fn((text: string) => text.trim()),
  synthesizeWithCache: mocks.synthesizeWithCache,
}));

describe("POST /api/tts/synthesize", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.synthesizeWithCache.mockClear();
  });

  it("returns synthesized audio metadata", async () => {
    const { POST } = await import("@/app/api/tts/synthesize/route");
    const response = await POST(
      new Request("http://localhost/api/tts/synthesize", {
        method: "POST",
        body: JSON.stringify({ text: "Sveiki" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.audioUrl).toBe("/tts-cache/a.wav");
  });

  it("rejects empty text", async () => {
    const { POST } = await import("@/app/api/tts/synthesize/route");
    const response = await POST(
      new Request("http://localhost/api/tts/synthesize", {
        method: "POST",
        body: JSON.stringify({ text: "   " }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects too long text", async () => {
    const { POST } = await import("@/app/api/tts/synthesize/route");
    const response = await POST(
      new Request("http://localhost/api/tts/synthesize", {
        method: "POST",
        body: JSON.stringify({ text: "12345678901" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(413);
  });

  it("passes piper voice/rate parameters through to synthesis cache", async () => {
    const { POST } = await import("@/app/api/tts/synthesize/route");
    await POST(
      new Request("http://localhost/api/tts/synthesize", {
        method: "POST",
        body: JSON.stringify({
          text: "Labdien",
          provider: "piper",
          voice: "lv_LV-aivars-medium",
          rate: 0.9,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(mocks.synthesizeWithCache).toHaveBeenCalledWith({
      text: "Labdien",
      lang: "lv",
      voice: "lv_LV-aivars-medium",
      rate: 0.9,
    });
  });
});
