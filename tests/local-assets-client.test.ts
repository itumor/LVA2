import { beforeEach, describe, expect, it, vi } from "vitest";

const getClientTtsConfigMock = vi.fn();

vi.mock("@/lib/tts-client", () => ({
  getClientTtsConfig: getClientTtsConfigMock,
}));

describe("local assets client", () => {
  beforeEach(() => {
    vi.resetModules();
    getClientTtsConfigMock.mockReset();
  });

  it("uses Piper provider with selected model/rate for listening audio", async () => {
    getClientTtsConfigMock.mockResolvedValue({
      provider: "piper",
      modelId: "lv_LV-aivars-medium",
      rate: 0.95,
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: { audioUrl: "/api/tts/audio/abc.wav" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const { ensureListeningAudio } = await import("@/lib/local-assets-client");
    const task = {
      id: "listen_1",
      skill: "LISTENING",
      taskType: "MCQ",
      promptLv: "Noklausies",
      transcript: "Sveiki, kā jums klājas?",
      audioRef: null,
    };

    const result = await ensureListeningAudio(task);

    expect(result.audioUrl).toBe("/api/tts/audio/abc.wav");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.provider).toBe("piper");
    expect(body.voice).toBe("lv_LV-aivars-medium");
    expect(body.rate).toBe(0.95);
    expect(body.text).toBe("Sveiki, kā jums klājas?");
  });

  it("memoizes listening audio calls across repeated requests", async () => {
    getClientTtsConfigMock.mockResolvedValue({
      provider: "piper",
      modelId: "lv_LV-aivars-medium",
      rate: 1,
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: { audioUrl: "/api/tts/audio/reused.wav" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const { ensureListeningAudio } = await import("@/lib/local-assets-client");
    const task = {
      id: "listen_2",
      skill: "LISTENING",
      taskType: "TRUE_FALSE",
      promptLv: "Noklausies dialogu",
      transcript: "Dialogs par darbu un brīvdienām.",
      audioRef: null,
    };

    const first = await ensureListeningAudio(task);
    const second = await ensureListeningAudio(task);

    expect(first.audioUrl).toBe("/api/tts/audio/reused.wav");
    expect(second.audioUrl).toBe("/api/tts/audio/reused.wav");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
