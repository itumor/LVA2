import { z } from "zod";
import { TOPICS } from "@/lib/vvpp-a2-template-bank";
import { fnv1a32 } from "@/lib/vvpp-a2-rng";
import {
  generateVvppA2Exams,
  type ExamTask,
  type ExamVersion,
  type VvppA2GeneratorInput,
  type VvppA2GeneratorOutput,
  validateVvppA2Exam,
} from "@/lib/vvpp-a2-generator";
import {
  chatJson,
  listModels,
  OpenAICompatibleError,
  type ChatMessage,
} from "@/lib/openai-compatible";

type LlmConfigInput = {
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

export type VvppA2SmartGeneratorInput = VvppA2GeneratorInput & {
  useLlm?: boolean;
  llm?: LlmConfigInput;
};

type ResolvedLlmConfig = {
  useLlm: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  topP: number;
  timeoutMs: number;
  maxRetries: number;
  concurrency: number;
  chunkSize: number;
};

export type VvppA2SmartRunStats = {
  llmRequested: boolean;
  llmPreflightPassed: boolean;
  llmCount: number;
  fallbackCount: number;
  total: number;
  preflightError?: string;
};

export type VvppA2SmartProgressPhase = "start" | "preflight" | "generating" | "completed";

export type VvppA2SmartProgressEvent = {
  phase: VvppA2SmartProgressPhase;
  totalExams: number;
  completedExams: number;
  llmCount: number;
  fallbackCount: number;
  percent: number;
  currentExamId?: string;
};

export type VvppA2SmartGeneratorHooks = {
  onProgress?: (event: VvppA2SmartProgressEvent) => void | Promise<void>;
};

type LlmTaskDraftOrder1 = {
  officialOrder: 1;
  topic: string;
  instructionLv: string;
  rewrite: {
    audioScriptLv: string[];
    transcriptLv: string;
    stemsLv: string[];
    optionsLv: string[][];
    correctOptionIndex: number[];
  };
};

type LlmTaskDraftOrder2 = {
  officialOrder: 2;
  topic: string;
  instructionLv: string;
  rewrite: {
    audioScriptLv: string[];
    stemsLv: string[];
    correct: boolean[];
  };
};

type LlmTaskDraftOrder3 = {
  officialOrder: 3;
  topic: string;
  instructionLv: string;
  rewrite: {
    audioScriptLv: string[];
    transcriptLv: string;
    wordBankLv: string[];
    stemsLv: string[];
    correctWords: string[];
  };
};

type LlmTaskDraftOrder4 = {
  officialOrder: 4;
  topic: string;
  instructionLv: string;
  rewrite: {
    textsLv: string[];
    optionsLv: string[][];
    correctOptionIndex: number[];
  };
};

type LlmTaskDraftOrder5 = {
  officialOrder: 5;
  topic: string;
  instructionLv: string;
  rewrite: {
    adsLv: string[];
    situationsLv: string[];
    answerAdIndex: number[];
  };
};

type LlmTaskDraftOrder6 = {
  officialOrder: 6;
  topic: string;
  instructionLv: string;
  rewrite: {
    textLv: string;
    stemsLv: string[];
    optionsLv: string[][];
    correctOptionIndex: number[];
  };
};

type LlmTaskDraftOrder7 = {
  officialOrder: 7;
  topic: string;
  instructionLv: string;
  rewrite: {
    picturePromptsLv: string[];
    sampleResponseLv: string;
    commonErrorsLv: string[];
  };
};

type LlmTaskDraftOrder8 = {
  officialOrder: 8;
  topic: string;
  instructionLv: string;
  rewrite: {
    stemsLv: string[];
    correctForms: string[];
    sampleResponseLv: string;
    commonErrorsLv: string[];
  };
};

type LlmTaskDraftOrder9 = {
  officialOrder: 9;
  topic: string;
  instructionLv: string;
  rewrite: {
    scenarioLv: string;
    planPointsLv: string[];
    sampleResponseLv: string;
    commonErrorsLv: string[];
  };
};

type LlmTaskDraftOrder10 = {
  officialOrder: 10;
  topic: string;
  instructionLv: string;
  rewrite: {
    promptsLv: string[];
    sampleResponseLv: string[];
    commonErrorsLv: string[];
  };
};

type LlmTaskDraftOrder11 = {
  officialOrder: 11;
  topic: string;
  instructionLv: string;
  rewrite: {
    imageDescriptionsLv: string[];
    guidedQuestionsLv: string[];
    personalQuestionLv: string;
    sampleResponseLv: string;
    commonErrorsLv: string[];
  };
};

type LlmTaskDraftOrder12 = {
  officialOrder: 12;
  topic: string;
  instructionLv: string;
  rewrite: {
    adsLv: string[];
    targetsLv: string[];
    promptsLv: string[];
    sampleResponseLv: string[];
    commonErrorsLv: string[];
  };
};

type LlmTaskDraft =
  | LlmTaskDraftOrder1
  | LlmTaskDraftOrder2
  | LlmTaskDraftOrder3
  | LlmTaskDraftOrder4
  | LlmTaskDraftOrder5
  | LlmTaskDraftOrder6
  | LlmTaskDraftOrder7
  | LlmTaskDraftOrder8
  | LlmTaskDraftOrder9
  | LlmTaskDraftOrder10
  | LlmTaskDraftOrder11
  | LlmTaskDraftOrder12;

const topicSchema = z.enum(TOPICS);

const order1Schema = z.object({
  officialOrder: z.literal(1),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    audioScriptLv: z.array(z.string().min(1)).length(6),
    transcriptLv: z.string().min(1),
    stemsLv: z.array(z.string().min(1)).length(6),
    optionsLv: z.array(z.array(z.string().min(1)).length(3)).length(6),
    correctOptionIndex: z.array(z.number().int().min(0).max(2)).length(6),
  }),
});

const order2Schema = z.object({
  officialOrder: z.literal(2),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    audioScriptLv: z.array(z.string().min(1)).min(6).max(12),
    stemsLv: z.array(z.string().min(1)).length(4),
    correct: z.array(z.boolean()).length(4),
  }),
});

const order3Schema = z.object({
  officialOrder: z.literal(3),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    audioScriptLv: z.array(z.string().min(1)).length(5),
    transcriptLv: z.string().min(1),
    wordBankLv: z.array(z.string().min(1)).length(9),
    stemsLv: z.array(z.string().min(1)).length(5),
    correctWords: z.array(z.string().min(1)).length(5),
  }),
});

const order4Schema = z.object({
  officialOrder: z.literal(4),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    textsLv: z.array(z.string().min(1)).length(4),
    optionsLv: z.array(z.array(z.string().min(1)).length(3)).length(4),
    correctOptionIndex: z.array(z.number().int().min(0).max(2)).length(4),
  }),
});

const order5Schema = z.object({
  officialOrder: z.literal(5),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    adsLv: z.array(z.string().min(1)).length(8),
    situationsLv: z.array(z.string().min(1)).length(6),
    answerAdIndex: z.array(z.number().int().min(0).max(7)).length(6),
  }),
});

const order6Schema = z.object({
  officialOrder: z.literal(6),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    textLv: z.string().min(1),
    stemsLv: z.array(z.string().min(1)).length(5),
    optionsLv: z.array(z.array(z.string().min(1)).length(3)).length(5),
    correctOptionIndex: z.array(z.number().int().min(0).max(2)).length(5),
  }),
});

const order7Schema = z.object({
  officialOrder: z.literal(7),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    picturePromptsLv: z.array(z.string().min(1)).length(4),
    sampleResponseLv: z.string().min(1),
    commonErrorsLv: z.array(z.string().min(1)).min(1),
  }),
});

const order8Schema = z.object({
  officialOrder: z.literal(8),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    stemsLv: z.array(z.string().min(1)).length(5),
    correctForms: z.array(z.string().min(1)).length(5),
    sampleResponseLv: z.string().min(1),
    commonErrorsLv: z.array(z.string().min(1)).min(1),
  }),
});

const order9Schema = z.object({
  officialOrder: z.literal(9),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    scenarioLv: z.string().min(1),
    planPointsLv: z.array(z.string().min(3)).length(4),
    sampleResponseLv: z.string().min(1),
    commonErrorsLv: z.array(z.string().min(1)).min(1),
  }),
});

const order10Schema = z.object({
  officialOrder: z.literal(10),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    promptsLv: z.array(z.string().min(1)).min(9).max(10),
    sampleResponseLv: z.array(z.string().min(1)).min(1),
    commonErrorsLv: z.array(z.string().min(1)).min(1),
  }),
});

const order11Schema = z.object({
  officialOrder: z.literal(11),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    imageDescriptionsLv: z.array(z.string().min(1)).length(2),
    guidedQuestionsLv: z.array(z.string().min(1)).length(3),
    personalQuestionLv: z.string().min(1),
    sampleResponseLv: z.string().min(1),
    commonErrorsLv: z.array(z.string().min(1)).min(1),
  }),
});

const order12Schema = z.object({
  officialOrder: z.literal(12),
  topic: topicSchema,
  instructionLv: z.string().min(1),
  rewrite: z.object({
    adsLv: z.array(z.string().min(1)).length(3),
    targetsLv: z.array(z.string().min(3)).length(3),
    promptsLv: z.array(z.string().min(1)).length(3),
    sampleResponseLv: z.array(z.string().min(1)).length(3),
    commonErrorsLv: z.array(z.string().min(1)).min(1),
  }),
});

const taskSchemaByOrder: Record<number, z.ZodType<LlmTaskDraft>> = {
  1: order1Schema,
  2: order2Schema,
  3: order3Schema,
  4: order4Schema,
  5: order5Schema,
  6: order6Schema,
  7: order7Schema,
  8: order8Schema,
  9: order9Schema,
  10: order10Schema,
  11: order11Schema,
  12: order12Schema,
};

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeTaskCandidate(raw: unknown, fallbackExam: ExamVersion, officialOrder: number): unknown {
  if (!raw || typeof raw !== "object") return raw;

  const row = raw as Record<string, unknown>;
  const allTasks = fallbackExam.sections.flatMap((section) => section.tasks);
  const fallbackTask = allTasks.find((task) => task.officialOrder === officialOrder);

  let source: unknown = row;

  if (row.task && typeof row.task === "object") {
    source = row.task;
  } else if (Array.isArray(row.tasks)) {
    source =
      (row.tasks as Array<Record<string, unknown>>).find(
        (task) => Number(task.officialOrder) === officialOrder,
      ) ?? row.tasks[0];
  } else if (Array.isArray(row.sections)) {
    const flattened = (row.sections as Array<Record<string, unknown>>).flatMap((section) =>
      Array.isArray(section.tasks) ? (section.tasks as unknown[]) : [],
    );
    source =
      (flattened as Array<Record<string, unknown>>).find(
        (task) => Number(task.officialOrder) === officialOrder,
      ) ?? flattened[0];
  }

  if (!source || typeof source !== "object") return source;
  const task = source as Record<string, unknown>;
  const rewrite = (task.rewrite && typeof task.rewrite === "object" ? task.rewrite : task) as Record<
    string,
    unknown
  >;

  return {
    officialOrder,
    topic: typeof task.topic === "string" ? task.topic : (fallbackTask?.topic ?? "family"),
    instructionLv:
      typeof task.instructionLv === "string" ? task.instructionLv : (fallbackTask?.instructionLv ?? "Uzdevums"),
    rewrite: {
      ...rewrite,
      transcriptLv: typeof rewrite.transcriptLv === "string" ? rewrite.transcriptLv : "",
      textLv: typeof rewrite.textLv === "string" ? rewrite.textLv : "",
      scenarioLv: typeof rewrite.scenarioLv === "string" ? rewrite.scenarioLv : "",
      personalQuestionLv: typeof rewrite.personalQuestionLv === "string" ? rewrite.personalQuestionLv : "",
      audioScriptLv: coerceStringArray(rewrite.audioScriptLv),
      stemsLv: coerceStringArray(rewrite.stemsLv ?? rewrite.questions),
      optionsLv: Array.isArray(rewrite.optionsLv) ? rewrite.optionsLv : [],
      correctOptionIndex: Array.isArray(rewrite.correctOptionIndex) ? rewrite.correctOptionIndex : [],
      correct: Array.isArray(rewrite.correct) ? rewrite.correct : [],
      wordBankLv: coerceStringArray(rewrite.wordBankLv),
      correctWords: coerceStringArray(rewrite.correctWords),
      textsLv: coerceStringArray(rewrite.textsLv),
      adsLv: coerceStringArray(rewrite.adsLv),
      situationsLv: coerceStringArray(rewrite.situationsLv),
      answerAdIndex: Array.isArray(rewrite.answerAdIndex) ? rewrite.answerAdIndex : [],
      picturePromptsLv: coerceStringArray(rewrite.picturePromptsLv),
      correctForms: coerceStringArray(rewrite.correctForms),
      planPointsLv: coerceStringArray(rewrite.planPointsLv),
      promptsLv: coerceStringArray(rewrite.promptsLv),
      sampleResponseLv: Array.isArray(rewrite.sampleResponseLv)
        ? rewrite.sampleResponseLv
        : typeof rewrite.sampleResponseLv === "string"
          ? rewrite.sampleResponseLv
          : "",
      commonErrorsLv: coerceStringArray(rewrite.commonErrorsLv),
      imageDescriptionsLv: coerceStringArray(rewrite.imageDescriptionsLv),
      guidedQuestionsLv: coerceStringArray(rewrite.guidedQuestionsLv),
      targetsLv: coerceStringArray(rewrite.targetsLv),
    },
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(value: string): string {
  return fnv1a32(normalizeText(value)).toString(16).padStart(8, "0");
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}'-]+/gu) ?? [];
}

function splitForA2Check(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (words(trimmed).length <= 20) {
    return [trimmed];
  }

  const fragments = trimmed
    .split(/[.!?]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  return fragments.length > 1 ? fragments : [trimmed];
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function sanitizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildScaffoldExam(params: {
  seed: number;
  n: number;
  extraPracticeVariants: number;
}): ExamVersion[] {
  const { seed, n, extraPracticeVariants } = params;

  const exams: ExamVersion[] = [];

  for (let i = 0; i < n; i += 1) {
    const variantSeed = seed + i * 101;
    const generated = generateVvppA2Exams({ n: 1, seed: variantSeed, extraPracticeVariants: 0 }).exams[0];
    const clone = deepClone(generated);
    clone.examId = `vvpp_a2_${seed}_v${i + 1}`;
    clone.versionLabel = `VVPP A2 V${i + 1}`;
    exams.push(clone);
  }

  for (let j = 0; j < extraPracticeVariants; j += 1) {
    const variantSeed = seed + (n + j) * 101;
    const generated = generateVvppA2Exams({ n: 1, seed: variantSeed, extraPracticeVariants: 0 }).exams[0];
    const clone = deepClone(generated);
    clone.examId = `vvpp_a2_${seed}_practice_v${j + 1}`;
    clone.versionLabel = `PRACTICE V${j + 1}`;
    exams.push(clone);
  }

  return exams;
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

function resolveLlmConfig(input: VvppA2SmartGeneratorInput): ResolvedLlmConfig {
  const autoUseLlm = hasAnyLlmEnv();
  const useLlm = typeof input.useLlm === "boolean" ? input.useLlm : autoUseLlm;

  return {
    useLlm,
    baseUrl:
      input.llm?.baseUrl?.trim() ||
      process.env.VVPP_GENERATOR_LLM_BASE_URL?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      "http://127.0.0.1:1234",
    model:
      input.llm?.model?.trim() ||
      process.env.VVPP_GENERATOR_LLM_MODEL?.trim() ||
      process.env.OPENAI_EVALUATOR_MODEL?.trim() ||
      "openai/gpt-oss-20b",
    apiKey:
      input.llm?.apiKey?.trim() ||
      process.env.VVPP_GENERATOR_LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      "local-ai",
    temperature: Number.isFinite(input.llm?.temperature) ? Number(input.llm?.temperature) : 0.8,
    topP: Number.isFinite(input.llm?.topP) ? Number(input.llm?.topP) : 0.95,
    timeoutMs: sanitizePositiveInt(
      input.llm?.timeoutMs ?? Number(process.env.VVPP_GENERATOR_LLM_TIMEOUT_MS),
      180000,
    ),
    maxRetries: sanitizeNonNegativeInt(input.llm?.maxRetries, 0),
    concurrency: clamp(sanitizePositiveInt(input.llm?.concurrency, 1), 1, 4),
    chunkSize: clamp(sanitizePositiveInt(input.llm?.chunkSize, 20), 1, 200),
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, U>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const output: U[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      output[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return output;
}

function extractExamCoreTexts(exam: ExamVersion): string[] {
  const texts: string[] = [];

  for (const section of exam.sections) {
    for (const task of section.tasks) {
      if (typeof task.instructionLv === "string") texts.push(task.instructionLv);

      if (Array.isArray((task.stimuli as Record<string, unknown>).audioScriptLv)) {
        texts.push(...(((task.stimuli as Record<string, unknown>).audioScriptLv as unknown[])
          .map((row) => String(row ?? ""))
          .filter(Boolean)));
      }

      if (typeof (task.stimuli as Record<string, unknown>).transcriptLv === "string") {
        texts.push(String((task.stimuli as Record<string, unknown>).transcriptLv));
      }

      if (typeof (task.stimuli as Record<string, unknown>).textLv === "string") {
        texts.push(String((task.stimuli as Record<string, unknown>).textLv));
      }

      if (typeof (task.stimuli as Record<string, unknown>).scenarioLv === "string") {
        texts.push(String((task.stimuli as Record<string, unknown>).scenarioLv));
      }

      if (Array.isArray((task.stimuli as Record<string, unknown>).ads)) {
        for (const ad of (task.stimuli as Record<string, unknown>).ads as Array<Record<string, unknown>>) {
          if (typeof ad.textLv === "string") texts.push(ad.textLv);
        }
      }

      for (const question of task.questions) {
        if (typeof question.promptLv === "string") texts.push(question.promptLv);
        if (typeof question.stemLv === "string") texts.push(question.stemLv);
        if (typeof question.statementLv === "string") texts.push(question.statementLv);
        if (typeof question.textLv === "string") texts.push(question.textLv);

        if (Array.isArray(question.optionsLv)) {
          texts.push(...question.optionsLv.map((row) => String(row)));
        }
      }

      if (typeof task.sampleResponseLv === "string") {
        texts.push(task.sampleResponseLv);
      }
      if (Array.isArray(task.sampleResponseLv)) {
        texts.push(...task.sampleResponseLv.map((row) => String(row)));
      }
    }
  }

  return texts.filter((text) => normalizeText(text).length >= 16);
}

function assertA2ExamTexts(exam: ExamVersion) {
  for (const text of extractExamCoreTexts(exam)) {
    for (const fragment of splitForA2Check(text)) {
      const tokenCount = words(fragment).length;
      if (tokenCount > 35) {
        throw new Error(`A2 length gate failed for exam ${exam.examId}`);
      }
    }
  }
}

function hasCrossExamDuplicateCore(exam: ExamVersion, usedHashes: Set<string>): boolean {
  const hashes = extractExamCoreTexts(exam).map((text) => hashText(text));
  return hashes.some((entry) => usedHashes.has(entry));
}

function registerExamHashes(exam: ExamVersion, usedHashes: Set<string>) {
  for (const text of extractExamCoreTexts(exam)) {
    usedHashes.add(hashText(text));
  }
}

function summarizeUsedHashes(usedHashes: Set<string>, limit = 60): string[] {
  return [...usedHashes].slice(-limit);
}

function taskRewriteShape(officialOrder: number): string {
  switch (officialOrder) {
    case 1:
      return `{"audioScriptLv":[6],"transcriptLv":"...","stemsLv":[6],"optionsLv":[[3]x6],"correctOptionIndex":[6]}`;
    case 2:
      return `{"audioScriptLv":[6..12],"stemsLv":[4],"correct":[4 booleans]}`;
    case 3:
      return `{"audioScriptLv":[5],"transcriptLv":"...","wordBankLv":[9],"stemsLv":[5],"correctWords":[5]}`;
    case 4:
      return `{"textsLv":[4],"optionsLv":[[3]x4],"correctOptionIndex":[4]}`;
    case 5:
      return `{"adsLv":[8],"situationsLv":[6],"answerAdIndex":[6 values 0..7]}`;
    case 6:
      return `{"textLv":"...","stemsLv":[5],"optionsLv":[[3]x5],"correctOptionIndex":[5]}`;
    case 7:
      return `{"picturePromptsLv":[4],"sampleResponseLv":"...","commonErrorsLv":[>=3]}`;
    case 8:
      return `{"stemsLv":[5],"correctForms":[5],"sampleResponseLv":"...","commonErrorsLv":[>=3]}`;
    case 9:
      return `{"scenarioLv":"...","planPointsLv":[4],"sampleResponseLv":"...","commonErrorsLv":[>=3]}`;
    case 10:
      return `{"promptsLv":[9..10],"sampleResponseLv":[>=3],"commonErrorsLv":[>=3]}`;
    case 11:
      return `{"imageDescriptionsLv":[2],"guidedQuestionsLv":[3],"personalQuestionLv":"...","sampleResponseLv":"...","commonErrorsLv":[>=3]}`;
    case 12:
      return `{"adsLv":[3],"targetsLv":[3],"promptsLv":[3],"sampleResponseLv":[3],"commonErrorsLv":[>=3]}`;
    default:
      return "{}";
  }
}

function buildTaskPrompt(params: {
  exam: ExamVersion;
  task: ExamTask;
  usedHashes: string[];
  attempt: number;
}): ChatMessage[] {
  const { exam, task, usedHashes, attempt } = params;
  return [
    {
      role: "system",
      content:
        "You generate Latvian CEFR A2 VVPP task content. Return strict JSON only. Keep language simple and safe.",
    },
    {
      role: "user",
      content: `
Create one task draft only.
Attempt: ${attempt}
Exam ID: ${exam.examId}
Version: ${exam.versionLabel}
officialOrder: ${task.officialOrder}
taskType: ${task.taskType}
points: ${task.points}
Current topic: ${task.topic}
Recently used hash signatures (avoid close duplicates): ${JSON.stringify(usedHashes)}

Return JSON only with this shape:
{
  "officialOrder": ${task.officialOrder},
  "topic": "family|work|shopping|health|transport|leisure|holidays|weather",
  "instructionLv": "string",
  "rewrite": ${taskRewriteShape(task.officialOrder)}
}

Constraints:
- CEFR A2 Latvian only.
- Keep prompts/options short and clear.
- No copyrighted passages.
- No real personal data.
- Use synthetic names and contacts only.
`,
    },
  ];
}

function buildTaskRepairPrompt(params: {
  officialOrder: number;
  rawText: string;
  schemaErrors: string[];
}): ChatMessage[] {
  const { officialOrder, rawText, schemaErrors } = params;
  return [
    {
      role: "system",
      content:
        "You are a strict JSON repair assistant. Convert invalid task JSON to valid task JSON only.",
    },
    {
      role: "user",
      content: `
Repair this invalid JSON into valid JSON for one task:
{
  "officialOrder": ${officialOrder},
  "topic": "family|work|shopping|health|transport|leisure|holidays|weather",
  "instructionLv": "string",
  "rewrite": ${taskRewriteShape(officialOrder)}
}

Schema errors to fix:
${schemaErrors.join(" | ")}

Invalid JSON/content:
${rawText}

Return valid JSON only.
`,
    },
  ];
}

function setTaskByOrder(exam: ExamVersion): Map<number, ExamTask> {
  const map = new Map<number, ExamTask>();
  for (const section of exam.sections) {
    for (const task of section.tasks) {
      map.set(task.officialOrder, task);
    }
  }
  return map;
}

function applyTaskDraftToScaffold(scaffold: ExamVersion, rawTask: LlmTaskDraft): ExamVersion {
  const exam = deepClone(scaffold);
  const taskMap = setTaskByOrder(exam);
  const task = taskMap.get(rawTask.officialOrder);
  if (!task) {
    throw new Error(`Draft references unknown order: ${rawTask.officialOrder}`);
  }

  task.topic = rawTask.topic;
  task.instructionLv = rawTask.instructionLv;

  if (rawTask.officialOrder === 1) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).audioScriptLv = rewrite.audioScriptLv;
    (task.stimuli as Record<string, unknown>).transcriptLv = rewrite.transcriptLv;
    for (let i = 0; i < 6; i += 1) {
      task.questions[i].stemLv = rewrite.stemsLv[i];
      task.questions[i].optionsLv = rewrite.optionsLv[i];
      task.answerKey?.items && (task.answerKey.items[i].correctOptionIndex = rewrite.correctOptionIndex[i]);
    }
    return exam;
  }

  if (rawTask.officialOrder === 2) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).audioScriptLv = rewrite.audioScriptLv;
    (task.stimuli as Record<string, unknown>).transcriptLv = rewrite.audioScriptLv.join(" ");
    for (let i = 0; i < 4; i += 1) {
      task.questions[i].statementLv = rewrite.stemsLv[i];
      task.answerKey?.items && (task.answerKey.items[i].correct = rewrite.correct[i]);
    }
    return exam;
  }

  if (rawTask.officialOrder === 3) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).audioScriptLv = rewrite.audioScriptLv;
    (task.stimuli as Record<string, unknown>).transcriptLv = rewrite.transcriptLv;
    (task.stimuli as Record<string, unknown>).wordBankLv = rewrite.wordBankLv;
    for (let i = 0; i < 5; i += 1) {
      task.questions[i].stemLv = rewrite.stemsLv[i];
      task.answerKey?.items && (task.answerKey.items[i].correctWord = rewrite.correctWords[i]);
    }
    return exam;
  }

  if (rawTask.officialOrder === 4) {
    const rewrite = rawTask.rewrite;
    for (let i = 0; i < 4; i += 1) {
      task.questions[i].textLv = rewrite.textsLv[i];
      task.questions[i].optionsLv = rewrite.optionsLv[i];
      task.answerKey?.items && (task.answerKey.items[i].correctOptionIndex = rewrite.correctOptionIndex[i]);
    }
    return exam;
  }

  if (rawTask.officialOrder === 5) {
    const rewrite = rawTask.rewrite;
    const adIds = Array.from({ length: 8 }, (_row, i) => String.fromCharCode(65 + i));
    (task.stimuli as Record<string, unknown>).ads = rewrite.adsLv.map((textLv, index) => ({
      id: adIds[index],
      textLv,
    }));

    for (let i = 0; i < 6; i += 1) {
      task.questions[i].textLv = rewrite.situationsLv[i];
      task.questions[i].availableAds = adIds;
      task.answerKey?.items && (task.answerKey.items[i].adId = adIds[rewrite.answerAdIndex[i]]);
    }
    return exam;
  }

  if (rawTask.officialOrder === 6) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).textLv = rewrite.textLv;
    for (let i = 0; i < 5; i += 1) {
      task.questions[i].stemLv = rewrite.stemsLv[i];
      task.questions[i].optionsLv = rewrite.optionsLv[i];
      task.answerKey?.items && (task.answerKey.items[i].correctOptionIndex = rewrite.correctOptionIndex[i]);
    }
    return exam;
  }

  if (rawTask.officialOrder === 7) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).picturePrompts = rewrite.picturePromptsLv.map((descriptionLv, index) => ({
      imageId: `img${index + 1}`,
      descriptionLv,
    }));
    for (let i = 0; i < 4; i += 1) {
      task.questions[i].promptLv = rewrite.picturePromptsLv[i];
    }
    task.sampleResponseLv = rewrite.sampleResponseLv;
    task.commonErrorsLv = rewrite.commonErrorsLv;
    return exam;
  }

  if (rawTask.officialOrder === 8) {
    const rewrite = rawTask.rewrite;
    for (let i = 0; i < 5; i += 1) {
      task.questions[i].stemLv = rewrite.stemsLv[i];
      task.answerKey?.items && (task.answerKey.items[i].correctForm = rewrite.correctForms[i]);
    }
    task.sampleResponseLv = rewrite.sampleResponseLv;
    task.commonErrorsLv = rewrite.commonErrorsLv;
    return exam;
  }

  if (rawTask.officialOrder === 9) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).scenarioLv = rewrite.scenarioLv;
    (task.stimuli as Record<string, unknown>).planPointsLv = rewrite.planPointsLv;
    if (task.questions[0]) {
      task.questions[0].promptLv = rewrite.scenarioLv;
    }
    task.sampleResponseLv = rewrite.sampleResponseLv;
    task.commonErrorsLv = rewrite.commonErrorsLv;
    return exam;
  }

  if (rawTask.officialOrder === 10) {
    const rewrite = rawTask.rewrite;
    task.questions = rewrite.promptsLv.map((promptLv, index) => ({
      id: `q${index + 1}`,
      promptLv,
    }));
    (task.stimuli as Record<string, unknown>).questionCount = rewrite.promptsLv.length;
    task.sampleResponseLv = rewrite.sampleResponseLv;
    task.commonErrorsLv = rewrite.commonErrorsLv;
    return exam;
  }

  if (rawTask.officialOrder === 11) {
    const rewrite = rawTask.rewrite;
    (task.stimuli as Record<string, unknown>).images = rewrite.imageDescriptionsLv.map((descriptionLv, index) => ({
      id: `img${index + 1}`,
      descriptionLv,
    }));
    (task.stimuli as Record<string, unknown>).guidedQuestionsLv = rewrite.guidedQuestionsLv;
    (task.stimuli as Record<string, unknown>).personalQuestionLv = rewrite.personalQuestionLv;

    task.questions = [
      { id: "q1", promptLv: rewrite.guidedQuestionsLv[0] },
      { id: "q2", promptLv: rewrite.guidedQuestionsLv[1] },
      { id: "q3", promptLv: rewrite.guidedQuestionsLv[2] },
      { id: "q4", promptLv: rewrite.personalQuestionLv },
    ];
    task.sampleResponseLv = rewrite.sampleResponseLv;
    task.commonErrorsLv = rewrite.commonErrorsLv;
    return exam;
  }

  const rewrite = rawTask.rewrite;
  (task.stimuli as Record<string, unknown>).ads = rewrite.adsLv.map((textLv, index) => ({
    id: `ad${index + 1}`,
    textLv,
    target: rewrite.targetsLv[index],
  }));

  task.questions = rewrite.promptsLv.map((promptLv, index) => ({
    id: `q${index + 1}`,
    adId: `ad${index + 1}`,
    adTextLv: rewrite.adsLv[index],
    targetLv: rewrite.targetsLv[index],
    promptLv,
  }));
  task.sampleResponseLv = rewrite.sampleResponseLv;
  task.commonErrorsLv = rewrite.commonErrorsLv;

  return exam;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeError(error: unknown): string {
  if (error instanceof OpenAICompatibleError) {
    const details = error.details ? ` | ${error.details}` : "";
    return `${error.code}: ${error.message}${details}`;
  }

  if (error instanceof z.ZodError) {
    return `SCHEMA_ERROR: ${error.issues.map((issue) => issue.message).join(" | ")}`;
  }

  return String(error);
}

async function preflightLlm(config: ResolvedLlmConfig): Promise<string | null> {
  const models = await listModels({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: Math.min(config.timeoutMs, 12000),
  });

  if (!models.includes(config.model)) {
    throw new OpenAICompatibleError({
      message: `Configured model not available: ${config.model}`,
      code: "HTTP_ERROR",
      details: `Available models: ${models.slice(0, 20).join(", ")}`,
    });
  }

  // Do not hard-fail or warn on warmup chat here. For local heavyweight models,
  // a short warmup request can time out even when full requests eventually succeed.
  return null;
}

async function enrichOneExam(params: {
  scaffoldExam: ExamVersion;
  config: ResolvedLlmConfig;
  usedHashes: Set<string>;
}): Promise<{ exam: ExamVersion; usedLlm: boolean; reason?: string }> {
  const { scaffoldExam, config, usedHashes } = params;
  const allTasks = scaffoldExam.sections.flatMap((section) => section.tasks).sort((a, b) => a.officialOrder - b.officialOrder);
  let working = deepClone(scaffoldExam);
  let llmTaskCount = 0;
  const failures: string[] = [];

  for (const task of allTasks) {
    let applied = false;
    const schema = taskSchemaByOrder[task.officialOrder];
    const usedHashSnapshot = summarizeUsedHashes(usedHashes, 60);

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      try {
        const messages = buildTaskPrompt({
          exam: working,
          task,
          usedHashes: usedHashSnapshot,
          attempt: attempt + 1,
        });

        const response = await chatJson<LlmTaskDraft>({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          temperature: config.temperature,
          topP: config.topP,
          timeoutMs: config.timeoutMs,
          messages,
        });

        const normalized = normalizeTaskCandidate(response.json, working, task.officialOrder);
        let parsed: LlmTaskDraft;
        try {
          parsed = schema.parse(normalized);
        } catch (error) {
          if (!(error instanceof z.ZodError)) {
            throw error;
          }

          const repairMessages = buildTaskRepairPrompt({
            officialOrder: task.officialOrder,
            rawText: response.rawText,
            schemaErrors: error.issues.slice(0, 12).map((issue) => issue.message),
          });

          const repaired = await chatJson<LlmTaskDraft>({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.model,
            temperature: 0,
            topP: 1,
            timeoutMs: config.timeoutMs,
            messages: repairMessages,
          });

          const normalizedRepaired = normalizeTaskCandidate(repaired.json, working, task.officialOrder);
          parsed = schema.parse(normalizedRepaired);
        }

        working = applyTaskDraftToScaffold(working, parsed);
        llmTaskCount += 1;
        applied = true;
        break;
      } catch (error) {
        if (attempt < config.maxRetries) {
          await sleep(200 * (attempt + 1));
          continue;
        }
        failures.push(`task ${task.officialOrder}: ${serializeError(error)}`);
      }
    }

    if (!applied) {
      continue;
    }
  }

  try {
    validateVvppA2Exam(working);
    assertA2ExamTexts(working);
    const duplicateDetected = hasCrossExamDuplicateCore(working, usedHashes);

    registerExamHashes(working, usedHashes);
    return {
      exam: working,
      usedLlm: llmTaskCount > 0,
      reason:
        failures.length > 0
          ? failures.slice(0, 3).join(" || ")
          : duplicateDetected
            ? "Duplicate cross-exam core text detected"
            : undefined,
    };
  } catch (error) {
    const fallback = deepClone(scaffoldExam);
    registerExamHashes(fallback, usedHashes);
    return {
      exam: fallback,
      usedLlm: false,
      reason: failures.length > 0 ? `${failures.slice(0, 3).join(" || ")} || ${serializeError(error)}` : serializeError(error),
    };
  }
}

async function generateVvppA2ExamsSmartInternal(
  input: VvppA2SmartGeneratorInput = {},
  hooks: VvppA2SmartGeneratorHooks = {},
): Promise<{ output: VvppA2GeneratorOutput; stats: VvppA2SmartRunStats }> {
  const n = sanitizePositiveInt(input.n, 3);
  const seed = sanitizePositiveInt(input.seed, 2026);
  const extraPracticeVariants = sanitizeNonNegativeInt(input.extraPracticeVariants, 0);
  const totalExams = n + extraPracticeVariants;

  const config = resolveLlmConfig(input);

  const stats: VvppA2SmartRunStats = {
    llmRequested: config.useLlm,
    llmPreflightPassed: false,
    llmCount: 0,
    fallbackCount: 0,
    total: totalExams,
  };

  let completedExams = 0;
  let llmCount = 0;
  let fallbackCount = 0;

  const emitProgress = async (
    phase: VvppA2SmartProgressPhase,
    currentExamId?: string,
  ) => {
    if (!hooks.onProgress) return;

    const percent = totalExams <= 0 ? 100 : Math.round((completedExams / totalExams) * 100);
    await hooks.onProgress({
      phase,
      totalExams,
      completedExams,
      llmCount,
      fallbackCount,
      percent,
      currentExamId,
    });
  };

  await emitProgress("start");

  if (!config.useLlm) {
    const output = generateVvppA2Exams({ n, seed, extraPracticeVariants });
    for (const exam of output.exams) {
      completedExams += 1;
      await emitProgress("generating", exam.examId);
    }
    await emitProgress("completed");
    return {
      output,
      stats,
    };
  }

  const scaffoldExams = buildScaffoldExam({ seed, n, extraPracticeVariants });
  const usedHashes = new Set<string>();

  console.error(
    `[vvpp-smart] LLM enabled model=${config.model} baseUrl=${config.baseUrl} timeoutMs=${config.timeoutMs} maxRetries=${config.maxRetries} concurrency=${config.concurrency} chunkSize=${config.chunkSize}`,
  );

  await emitProgress("preflight");

  try {
    const warmupWarning = await preflightLlm(config);
    if (warmupWarning) {
      console.error(`[vvpp-smart] Warmup check failed, proceeding anyway. ${warmupWarning}`);
    }
  } catch (error) {
    stats.preflightError = serializeError(error);
    console.error(`[vvpp-smart] LLM preflight failed; using template fallback. ${serializeError(error)}`);

    for (const exam of scaffoldExams) {
      registerExamHashes(exam, usedHashes);
      completedExams += 1;
      fallbackCount += 1;
      await emitProgress("generating", exam.examId);
    }

    stats.fallbackCount = fallbackCount;
    await emitProgress("completed");
    return {
      output: {
        generator: {
          name: "VVPP_A2_Generator",
          seed,
          n,
        },
        exams: scaffoldExams,
      },
      stats,
    };
  }

  stats.llmPreflightPassed = true;

  const chunks = chunkArray(scaffoldExams, config.chunkSize);
  const outputExams: ExamVersion[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    console.error(
      `[vvpp-smart] Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} exams, concurrency=${config.concurrency})`,
    );

    const enrichedChunk = await mapWithConcurrency(chunk, config.concurrency, async (scaffoldExam) => {
      const result = await enrichOneExam({
        scaffoldExam,
        config,
        usedHashes,
      });

      if (result.usedLlm) {
        llmCount += 1;
      } else {
        fallbackCount += 1;
        if (result.reason) {
          console.error(`[vvpp-smart] Fallback for ${scaffoldExam.examId}: ${result.reason}`);
        }
      }

      completedExams += 1;
      await emitProgress("generating", scaffoldExam.examId);
      return result.exam;
    });

    outputExams.push(...enrichedChunk);
  }

  console.error(`[vvpp-smart] Completed. LLM=${llmCount}, fallback=${fallbackCount}, total=${outputExams.length}`);
  stats.llmCount = llmCount;
  stats.fallbackCount = fallbackCount;
  stats.total = outputExams.length;
  await emitProgress("completed");

  return {
    output: {
      generator: {
        name: "VVPP_A2_Generator",
        seed,
        n,
      },
      exams: outputExams,
    },
    stats,
  };
}

export async function generateVvppA2ExamsSmartWithStats(
  input: VvppA2SmartGeneratorInput = {},
  hooks: VvppA2SmartGeneratorHooks = {},
): Promise<{ output: VvppA2GeneratorOutput; stats: VvppA2SmartRunStats }> {
  return generateVvppA2ExamsSmartInternal(input, hooks);
}

export async function generateVvppA2ExamsSmart(
  input: VvppA2SmartGeneratorInput = {},
  hooks: VvppA2SmartGeneratorHooks = {},
): Promise<VvppA2GeneratorOutput> {
  const result = await generateVvppA2ExamsSmartInternal(input, hooks);
  return result.output;
}
