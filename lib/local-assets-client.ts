"use client";

import { getClientTtsConfig } from "@/lib/tts-client";

type AssetQuestion = Record<string, unknown>;

type AssetTask = {
  id: string;
  skill?: string;
  taskType: string;
  promptLv: string;
  transcript?: string | null;
  audioRef?: string | null;
  metadata?: unknown;
};

type ListeningAssetResult = {
  audioUrl: string | null;
  warning?: string;
};

type ImageAssetResult = {
  imageUrl: string | null;
  warning?: string;
};

const listeningRequestCache = new Map<string, Promise<ListeningAssetResult>>();
const imageRequestCache = new Map<string, Promise<ImageAssetResult>>();

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function readMetadataListeningText(task: AssetTask) {
  if (!task.metadata || typeof task.metadata !== "object") return null;
  const stimuli = (task.metadata as Record<string, unknown>).stimuli;
  if (!stimuli || typeof stimuli !== "object") return null;

  const transcript = (stimuli as Record<string, unknown>).transcriptLv;
  if (typeof transcript === "string" && transcript.trim()) {
    return normalizeText(transcript);
  }

  const audioScript = (stimuli as Record<string, unknown>).audioScriptLv;
  if (Array.isArray(audioScript) && audioScript.length > 0) {
    const lines = audioScript.map((line) => String(line ?? "").trim()).filter(Boolean);
    if (lines.length > 0) {
      return normalizeText(lines.join(" "));
    }
  }

  return null;
}

function resolveListeningText(task: AssetTask) {
  if (typeof task.transcript === "string" && task.transcript.trim()) {
    return normalizeText(task.transcript);
  }

  const metadataText = readMetadataListeningText(task);
  if (metadataText) return metadataText;

  if (typeof task.promptLv === "string" && task.promptLv.trim()) {
    return normalizeText(task.promptLv);
  }

  return "";
}

export function resolveStaticListeningAudio(task: Pick<AssetTask, "audioRef">) {
  if (!task.audioRef) return null;
  if (task.audioRef.includes("a_2_limenis_audio.mp3")) return "/media/a_2_limenis_audio.mp3";
  return null;
}

export function resolveLegacyImageFromQuestion(question: AssetQuestion, questionId: string) {
  const explicit = typeof question.imageUrl === "string" ? question.imageUrl : null;
  if (explicit) {
    const legacyMap: Record<string, string> = {
      "/images/writing-q1.svg": "/images/writing-q1.jpg",
      "/images/writing-q2.svg": "/images/writing-q2.jpg",
      "/images/writing-q3.svg": "/images/writing-q3.jpg",
      "/images/writing-q4.svg": "/images/writing-q4.jpg",
      "/images/speaking-q1.svg": "/images/speaking-q1.jpg",
      "/images/speaking-q2.svg": "/images/speaking-q2.jpg",
    };
    return legacyMap[explicit] ?? explicit;
  }

  const hint = typeof question.imageHint === "string" ? question.imageHint.toLowerCase() : "";
  if (hint.includes("park")) return "/images/speaking-q1.jpg";
  if (hint.includes("kafejn")) return "/images/speaking-q2.jpg";

  const fallbackMap: Record<string, string> = {
    q1: "/images/writing-q1.jpg",
    q2: "/images/writing-q2.jpg",
    q3: "/images/writing-q3.jpg",
    q4: "/images/writing-q4.jpg",
  };

  return fallbackMap[questionId] ?? null;
}

function inferSkill(task: AssetTask): "WRITING" | "SPEAKING" {
  const normalized = String(task.skill ?? "").toUpperCase();
  if (normalized === "SPEAKING") return "SPEAKING";
  if (normalized === "WRITING") return "WRITING";
  return task.taskType === "IMAGE_DESCRIPTION" ? "SPEAKING" : "WRITING";
}

function buildImagePrompt(task: AssetTask, question: AssetQuestion) {
  if (task.taskType === "IMAGE_DESCRIPTION") {
    const base =
      (typeof question.imageHint === "string" && question.imageHint.trim()) ||
      (typeof question.promptLv === "string" && question.promptLv.trim()) ||
      task.promptLv;
    const followUp =
      typeof question.followUp === "string" && question.followUp.trim() ? question.followUp.trim() : null;
    return normalizeText(followUp ? `${base}. ${followUp}` : base);
  }

  const writingPrompt =
    (typeof question.imageHint === "string" && question.imageHint.trim()) ||
    (typeof question.promptLv === "string" && question.promptLv.trim()) ||
    task.promptLv;

  return normalizeText(writingPrompt);
}

export async function ensureListeningAudio(task: AssetTask): Promise<ListeningAssetResult> {
  const text = resolveListeningText(task);
  if (!text) {
    return { audioUrl: null, warning: "No listening text available for TTS generation." };
  }

  const config = await getClientTtsConfig();
  const modelId = config?.provider === "piper" ? config.modelId : "";
  const rate = config?.rate ?? 1;
  const key = `${task.id}::${text}::${modelId || "default"}::${String(rate)}`;
  const cached = listeningRequestCache.get(key);
  if (cached) return cached;

  const requestPromise = (async () => {
    try {
      const response = await fetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lang: "lv",
          provider: "piper",
          rate,
          voice: modelId || undefined,
        }),
      });

      const payload = (await response.json()) as
        | { ok: true; data: { audioUrl: string } }
        | { ok: false; error?: string };

      if (!response.ok || !payload.ok) {
        return {
          audioUrl: null,
          warning: payload.ok ? "Listening audio generation failed." : payload.error || "Listening audio generation failed.",
        };
      }

      return { audioUrl: payload.data.audioUrl };
    } catch (error) {
      return {
        audioUrl: null,
        warning: error instanceof Error ? error.message : "Listening audio generation failed.",
      };
    }
  })();

  listeningRequestCache.set(key, requestPromise);
  return requestPromise;
}

export async function ensureGeneratedImage(params: {
  task: AssetTask;
  question: AssetQuestion;
  questionId: string;
}): Promise<ImageAssetResult> {
  const prompt = buildImagePrompt(params.task, params.question);
  if (!prompt) {
    return { imageUrl: null, warning: "No image prompt available for generation." };
  }

  const key = `${params.task.id}::${params.questionId}::${prompt.toLowerCase()}`;
  const cached = imageRequestCache.get(key);
  if (cached) return cached;

  const requestPromise = (async () => {
    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          taskId: params.task.id,
          questionId: params.questionId,
          skill: inferSkill(params.task),
          taskType: params.task.taskType,
        }),
      });

      const payload = (await response.json()) as
        | { ok: true; data: { imageUrl: string } }
        | { ok: false; error?: string };

      if (!response.ok || !payload.ok) {
        return {
          imageUrl: null,
          warning: payload.ok ? "Image generation failed." : payload.error || "Image generation failed.",
        };
      }

      return { imageUrl: payload.data.imageUrl };
    } catch (error) {
      return {
        imageUrl: null,
        warning: error instanceof Error ? error.message : "Image generation failed.",
      };
    }
  })();

  imageRequestCache.set(key, requestPromise);
  return requestPromise;
}
