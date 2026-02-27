import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tts-config", () => ({
  getActiveTtsConfig: vi.fn(async () => null),
}));

vi.mock("@/lib/tts", () => ({
  ttsEnabled: vi.fn(() => true),
  getTtsMaxChars: vi.fn(() => 10),
  normalizeTtsText: vi.fn((text: string) => text.trim()),
  synthesizeWithCache: vi.fn(async () => ({
    audioUrl: "/tts-cache/a.wav",
    cacheHit: false,
    format: "wav",
  })),
}));

describe("POST /api/tts/synthesize", () => {
  beforeEach(() => {
    vi.resetModules();
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
});
