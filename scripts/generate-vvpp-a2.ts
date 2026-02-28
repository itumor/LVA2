import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateVvppA2ExamsSmart, type VvppA2SmartGeneratorInput } from "../lib/vvpp-a2-smart-generator";

type CliArgs = {
  n?: number;
  seed?: number;
  extraPracticeVariants?: number;
  useLlm?: boolean;
  llm?: {
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
    topP?: number;
    timeoutMs?: number;
    maxRetries?: number;
    concurrency?: number;
    chunkSize?: number;
  };
};

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {
    llm: {},
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;

    const [key, rawValue] = arg.slice(2).split("=", 2);
    const numeric = Number(rawValue);

    if (key === "n" && Number.isFinite(numeric)) {
      parsed.n = numeric;
      continue;
    }

    if (key === "seed" && Number.isFinite(numeric)) {
      parsed.seed = numeric;
      continue;
    }

    if (key === "extraPracticeVariants" && Number.isFinite(numeric)) {
      parsed.extraPracticeVariants = numeric;
      continue;
    }

    if (key === "useLlm") {
      parsed.useLlm = parseBoolean(rawValue);
      continue;
    }

    if (key === "llmBaseUrl" && rawValue) {
      parsed.llm!.baseUrl = rawValue;
      continue;
    }

    if (key === "llmModel" && rawValue) {
      parsed.llm!.model = rawValue;
      continue;
    }

    if (key === "llmApiKey" && rawValue) {
      parsed.llm!.apiKey = rawValue;
      continue;
    }

    if (key === "llmTemperature" && Number.isFinite(numeric)) {
      parsed.llm!.temperature = numeric;
      continue;
    }

    if (key === "llmTopP" && Number.isFinite(numeric)) {
      parsed.llm!.topP = numeric;
      continue;
    }

    if (key === "llmTimeoutMs" && Number.isFinite(numeric)) {
      parsed.llm!.timeoutMs = numeric;
      continue;
    }

    if (key === "llmMaxRetries" && Number.isFinite(numeric)) {
      parsed.llm!.maxRetries = numeric;
      continue;
    }

    if (key === "llmConcurrency" && Number.isFinite(numeric)) {
      parsed.llm!.concurrency = numeric;
      continue;
    }

    if (key === "llmChunkSize" && Number.isFinite(numeric)) {
      parsed.llm!.chunkSize = numeric;
      continue;
    }
  }

  if (parsed.llm && Object.keys(parsed.llm).length === 0) {
    delete parsed.llm;
  }

  return parsed;
}

function hasAnyLlmEnv(): boolean {
  return Boolean(
    process.env.VVPP_GENERATOR_LLM_BASE_URL?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      process.env.VVPP_GENERATOR_LLM_MODEL?.trim() ||
      process.env.OPENAI_EVALUATOR_MODEL?.trim() ||
      process.env.VVPP_GENERATOR_LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  );
}

function loadDotEnvIfPresent() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;

    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    process.env[key] = unquoted;
  }
}

async function main() {
  loadDotEnvIfPresent();

  const args = parseArgs(process.argv.slice(2));
  const autoUseLlm = hasAnyLlmEnv();

  const payload = await generateVvppA2ExamsSmart({
    ...(args as VvppA2SmartGeneratorInput),
    useLlm: typeof args.useLlm === "boolean" ? args.useLlm : autoUseLlm,
  });

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[generate-vvpp-a2] ${String(error)}\n`);
  process.exit(1);
});
