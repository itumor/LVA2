import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { OpenAICompatibleError, resolveOpenAICompatiblePath } from "@/lib/openai-compatible";

type ImageGenerationInput = {
  prompt: string;
  model?: string;
  size?: string;
};

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

export type LocalImageResult = {
  fileName: string;
  filePath: string;
  imageUrl: string;
  cacheHit: boolean;
  model: string;
};

export class LocalImageError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.name = "LocalImageError";
    this.code = code;
    this.status = status;
  }
}

const generationLocks = new Map<string, Promise<LocalImageResult>>();

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim();
}

function resolveImageModel(input?: string) {
  const model = input?.trim() || process.env.LOCAL_IMAGE_MODEL?.trim() || "x/z-image-turbo";
  if (!model) {
    throw new LocalImageError(
      "LOCAL_IMAGE_MODEL is required for local image generation.",
      "IMAGE_MODEL_MISSING",
      500,
    );
  }
  return model;
}

function resolveImageSize(input?: string) {
  return input?.trim() || process.env.LOCAL_IMAGE_SIZE?.trim() || "1024x1024";
}

function resolveImageBaseUrl() {
  const explicit = process.env.LOCAL_IMAGE_BASE_URL?.trim();
  if (explicit) return explicit;

  const openAiCompat = process.env.OPENAI_BASE_URL?.trim();
  if (openAiCompat) return openAiCompat;

  // Ollama default local endpoint.
  return "http://localhost:11434";
}

function resolveImageApiKey() {
  return process.env.LOCAL_IMAGE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "local-ai";
}

function resolveImageTimeoutMs() {
  const raw = process.env.LOCAL_IMAGE_TIMEOUT_MS?.trim();
  if (!raw) return 120000;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120000;
  return parsed;
}

export function resolveImageOutputDir() {
  return process.env.LOCAL_IMAGE_OUTPUT_DIR?.trim() || path.join(process.cwd(), "public", "generated", "images");
}

function resolveImageUrl(filePath: string) {
  return `/api/images/file/${encodeURIComponent(path.basename(filePath))}`;
}

export function buildImageCacheKey(input: {
  model: string;
  size: string;
  prompt: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: input.model,
        size: input.size,
        prompt: normalizePrompt(input.prompt),
      }),
    )
    .digest("hex");
}

async function downloadFromUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new LocalImageError(`Image download failed (${response.status})`, "IMAGE_DOWNLOAD_FAILED", 502);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) {
    throw new LocalImageError("Downloaded image is empty.", "IMAGE_EMPTY", 502);
  }

  return bytes;
}

async function callOpenAICompatibleImage(input: {
  prompt: string;
  model: string;
  size: string;
}): Promise<Uint8Array> {
  const endpoint = resolveOpenAICompatiblePath(resolveImageBaseUrl(), "images");
  const controller = new AbortController();
  const timeoutMs = resolveImageTimeoutMs();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveImageApiKey()}`,
      },
      body: JSON.stringify({
        model: input.model,
        prompt: normalizePrompt(input.prompt),
        size: input.size,
        response_format: "b64_json",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LocalImageError(
        `Image generation timed out after ${timeoutMs} ms`,
        "IMAGE_TIMEOUT",
        504,
      );
    }

    throw new LocalImageError(
      error instanceof Error ? error.message : "Image generation request failed",
      "IMAGE_REQUEST_FAILED",
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OpenAICompatibleError({
      message: `OpenAI-compatible image generation failed (${response.status})`,
      code: "HTTP_ERROR",
      status: response.status,
      details: body.slice(0, 800),
    });
  }

  const payload = (await response.json()) as OpenAIImageResponse;
  const item = payload.data?.[0];
  const b64 = item?.b64_json?.trim();

  if (b64) {
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.byteLength) {
      throw new LocalImageError("Generated image was empty.", "IMAGE_EMPTY", 502);
    }
    return new Uint8Array(bytes);
  }

  const imageUrl = item?.url?.trim();
  if (imageUrl) {
    return downloadFromUrl(imageUrl);
  }

  throw new LocalImageError("Image provider returned no image data.", "IMAGE_DATA_MISSING", 502);
}

export function generateImageWithCache(input: ImageGenerationInput) {
  const prompt = normalizePrompt(input.prompt);
  if (!prompt) {
    throw new LocalImageError("Prompt is required.", "INVALID_PROMPT", 400);
  }

  const model = resolveImageModel(input.model);
  const size = resolveImageSize(input.size);
  const cacheKey = buildImageCacheKey({ prompt, model, size });

  const existing = generationLocks.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const outputDir = resolveImageOutputDir();
    await mkdir(outputDir, { recursive: true });

    const fileName = `${cacheKey}.png`;
    const filePath = path.join(outputDir, fileName);

    try {
      await access(filePath);
      return {
        fileName,
        filePath,
        imageUrl: resolveImageUrl(filePath),
        cacheHit: true,
        model,
      };
    } catch {
      // cache miss
    }

    const imageBytes = await callOpenAICompatibleImage({ prompt, model, size });
    if (!imageBytes.byteLength) {
      throw new LocalImageError("Generated image was empty.", "IMAGE_EMPTY", 502);
    }

    const tempPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, imageBytes);

    try {
      await readFile(tempPath);
      await writeFile(filePath, imageBytes);
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }

    return {
      fileName,
      filePath,
      imageUrl: resolveImageUrl(filePath),
      cacheHit: false,
      model,
    };
  })().finally(() => {
    generationLocks.delete(cacheKey);
  });

  generationLocks.set(cacheKey, promise);
  return promise;
}
