export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type OpenAITextPart = {
  type?: string;
  text?: string;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | OpenAITextPart[];
    };
  }>;
};

type OpenAIModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export type OpenAICompatibleErrorCode =
  | "INVALID_URL"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class OpenAICompatibleError extends Error {
  code: OpenAICompatibleErrorCode;
  status?: number;
  details?: string;

  constructor(params: {
    message: string;
    code: OpenAICompatibleErrorCode;
    status?: number;
    details?: string;
  }) {
    super(params.message);
    this.name = "OpenAICompatibleError";
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }
}

function ensureUrl(baseUrl: string): URL {
  try {
    return new URL(baseUrl);
  } catch {
    throw new OpenAICompatibleError({
      message: `Invalid OpenAI-compatible base URL: ${baseUrl}`,
      code: "INVALID_URL",
    });
  }
}

export function resolveOpenAICompatiblePath(baseUrl: string, path: "chat" | "models" | "images"): string {
  const url = ensureUrl(baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");

  const target =
    path === "chat" ? "chat/completions" : path === "models" ? "models" : "images/generations";

  if (normalizedPath === "" || normalizedPath === "/") {
    url.pathname = `/v1/${target}`;
  } else if (normalizedPath.endsWith(`/v1/${target}`)) {
    url.pathname = normalizedPath;
  } else if (normalizedPath.endsWith("/v1")) {
    url.pathname = `${normalizedPath}/${target}`;
  } else {
    url.pathname = `${normalizedPath}/v1/${target}`;
  }

  return url.toString();
}

function readModelText(payload: OpenAIChatResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}

async function withTimeout<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fn(controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OpenAICompatibleError({
        message: `OpenAI-compatible request timed out after ${timeoutMs} ms`,
        code: "TIMEOUT",
      });
    }

    if (error instanceof OpenAICompatibleError) {
      throw error;
    }

    throw new OpenAICompatibleError({
      message: "OpenAI-compatible request failed due to network error",
      code: "NETWORK_ERROR",
      details: String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listModels(params: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<string[]> {
  const endpoint = resolveOpenAICompatiblePath(params.baseUrl, "models");
  const timeoutMs = params.timeoutMs ?? 12000;

  return withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildHeaders(params.apiKey),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new OpenAICompatibleError({
        message: `OpenAI-compatible model listing failed (${response.status})`,
        code: "HTTP_ERROR",
        status: response.status,
        details: body.slice(0, 600),
      });
    }

    const payload = (await response.json()) as OpenAIModelsResponse;
    const ids = (payload.data ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);

    return [...new Set(ids)];
  });
}

export async function chatJson<T = unknown>(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<{ json: T; rawText: string }> {
  const endpoint = resolveOpenAICompatiblePath(params.baseUrl, "chat");
  const timeoutMs = params.timeoutMs ?? 45000;

  return withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(params.apiKey),
      signal,
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature ?? 0.2,
        top_p: params.topP,
        max_tokens: params.maxTokens,
        messages: params.messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new OpenAICompatibleError({
        message: `OpenAI-compatible chat failed (${response.status})`,
        code: "HTTP_ERROR",
        status: response.status,
        details: body.slice(0, 800),
      });
    }

    const payload = (await response.json()) as OpenAIChatResponse;
    const rawText = readModelText(payload);
    const extracted = extractJsonObject(rawText);

    if (!extracted) {
      throw new OpenAICompatibleError({
        message: "OpenAI-compatible chat did not return valid JSON content",
        code: "INVALID_JSON",
        details: rawText.slice(0, 800),
      });
    }

    return {
      json: extracted as T,
      rawText,
    };
  });
}
