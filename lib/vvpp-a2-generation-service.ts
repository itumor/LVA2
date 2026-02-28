import { listModels } from "@/lib/openai-compatible";
import {
  generateVvppA2ExamsSmartWithStats,
  type VvppA2SmartGeneratorHooks,
  type VvppA2SmartGeneratorInput,
  type VvppA2SmartRunStats,
} from "@/lib/vvpp-a2-smart-generator";
import type { VvppA2GeneratorOutput } from "@/lib/vvpp-a2-generator";

export type VvppA2GenerationRequest = {
  n?: number;
  seed?: number;
  extraPracticeVariants?: number;
  useLlm?: boolean;
  requireLlm?: boolean;
  llm?: {
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxRetries?: number;
    concurrency?: number;
    chunkSize?: number;
    temperature?: number;
    topP?: number;
  };
};

export type VvppA2GenerationDiagnostics = {
  requestedUseLlm: boolean;
  requireLlm: boolean;
  selectedBaseUrl: string | null;
  model: string;
  baseUrlProbes: Array<{ baseUrl: string; ok: boolean; models?: string[]; error?: string }>;
  stats: VvppA2SmartRunStats;
};

export type VvppA2GenerationResult = {
  payload: VvppA2GeneratorOutput;
  diagnostics: VvppA2GenerationDiagnostics;
};

export class VvppA2GenerationServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "VvppA2GenerationServiceError";
    this.status = status;
    this.code = code;
  }
}

export async function resolveWorkingBaseUrl(baseUrl: string | undefined, apiKey: string | undefined, model: string) {
  const candidates = [
    baseUrl,
    process.env.VVPP_GENERATOR_LLM_BASE_URL,
    process.env.OPENAI_BASE_URL,
    "http://127.0.0.1:1234",
    "http://localhost:1234",
    "http://host.docker.internal:1234",
  ]
    .map((row) => String(row ?? "").trim())
    .filter((row, index, arr) => row.length > 0 && arr.indexOf(row) === index);

  const tried: Array<{ baseUrl: string; ok: boolean; models?: string[]; error?: string }> = [];

  for (const candidate of candidates) {
    try {
      const models = await listModels({
        baseUrl: candidate,
        apiKey,
        timeoutMs: 3500,
      });
      const hasModel = models.includes(model);
      tried.push({ baseUrl: candidate, ok: hasModel, models: models.slice(0, 10) });
      if (hasModel) {
        return { selected: candidate, tried };
      }
    } catch (error) {
      tried.push({ baseUrl: candidate, ok: false, error: String(error) });
    }
  }

  return { selected: baseUrl, tried };
}

export async function runVvppA2Generation(
  body: VvppA2GenerationRequest,
  hooks?: VvppA2SmartGeneratorHooks,
): Promise<VvppA2GenerationResult> {
  const requestedModel =
    body.llm?.model ||
    process.env.VVPP_GENERATOR_LLM_MODEL ||
    process.env.OPENAI_EVALUATOR_MODEL ||
    "openai/gpt-oss-20b";

  const resolvedBase = await resolveWorkingBaseUrl(
    body.llm?.baseUrl,
    body.llm?.apiKey || process.env.VVPP_GENERATOR_LLM_API_KEY || process.env.OPENAI_API_KEY || "local-ai",
    requestedModel,
  );

  if (body.useLlm && body.requireLlm && !resolvedBase.selected) {
    throw new VvppA2GenerationServiceError(
      "LLM is required but no reachable OpenAI-compatible base URL was found",
      400,
      "LLM_UNAVAILABLE",
    );
  }

  const smartInput: VvppA2SmartGeneratorInput = {
    n: body.n,
    seed: body.seed,
    extraPracticeVariants: body.extraPracticeVariants,
    useLlm: body.useLlm,
    llm: {
      ...body.llm,
      baseUrl: resolvedBase.selected || body.llm?.baseUrl,
      model: requestedModel,
    },
  };

  const { output, stats } = await generateVvppA2ExamsSmartWithStats(smartInput, hooks);

  if (body.useLlm && body.requireLlm && stats.llmCount === 0) {
    throw new VvppA2GenerationServiceError(
      "LLM was reachable but all exams fell back to template content. Increase timeout/retries and try again.",
      409,
      "LLM_FALLBACK_ONLY",
    );
  }

  return {
    payload: output,
    diagnostics: {
      requestedUseLlm: Boolean(body.useLlm),
      requireLlm: Boolean(body.requireLlm),
      selectedBaseUrl: resolvedBase.selected || null,
      model: requestedModel,
      baseUrlProbes: resolvedBase.tried,
      stats,
    },
  };
}
