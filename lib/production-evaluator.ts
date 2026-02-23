import { Skill, TaskType } from "@prisma/client";
import type { RawAnswers } from "@/lib/scoring";

const SUPPORTED_TASK_TYPES: TaskType[] = [
  "PICTURE_SENTENCE",
  "WORD_FORM",
  "MESSAGE_ADVERT",
  "INTERVIEW",
  "IMAGE_DESCRIPTION",
  "AD_QUESTION",
];

const CONNECTORS = [
  "un",
  "bet",
  "jo",
  "tāpēc",
  "tadel",
  "tādēļ",
  "pēc",
  "pirms",
  "then",
  "because",
  "so",
  "also",
];

const FILLERS = ["nu", "emm", "um", "uh", "aaa", "hmm"];

type EvaluatorTask = {
  id: string;
  skill: Skill;
  taskType: TaskType;
  points: number;
  promptLv: string;
  promptEn: string;
  questions: Array<Record<string, unknown>>;
};

type PromptResponse = {
  questionId: string;
  prompt: string;
  response: string;
  minWords: number | null;
  expectsQuestion: boolean;
};

type DimensionScores = {
  taskCompletion: number;
  grammar: number;
  vocabulary: number;
  coherence: number;
  fluency?: number;
};

export type AdaptiveCorrection = {
  questionId: string;
  original: string;
  corrected: string;
  note: string;
};

export type AdaptiveEvaluation = {
  method: "openai" | "heuristic";
  model?: string;
  score: number;
  maxScore: number;
  rubric: DimensionScores;
  strengths: string[];
  improvements: string[];
  corrections: AdaptiveCorrection[];
  overallFeedback: string;
  warnings?: string[];
};

type EvaluateProductionParams = {
  task: EvaluatorTask;
  answers: RawAnswers;
};

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, precision = 2): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]*/gu) ?? [];
}

function sentenceCount(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]?/g) ?? [];
  return matches.filter((row) => row.trim().length > 0).length;
}

function comparable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function questionIdFrom(question: Record<string, unknown>, index: number): string {
  return String(question.id ?? `q${index + 1}`);
}

function extractPrompt(question: Record<string, unknown>): string {
  const promptParts = [
    asText(question.promptLv),
    asText(question.stemLv),
    asText(question.followUp),
    asText(question.target),
    asText(question.imageHint),
    asText(question.adText),
  ];

  if (Array.isArray(question.bulletPoints)) {
    promptParts.push(
      (question.bulletPoints as unknown[])
        .map((item) => asText(item))
        .filter(Boolean)
        .join(" | "),
    );
  }

  return promptParts.filter(Boolean).join(" ").trim();
}

function extractResponses(task: EvaluatorTask, answers: RawAnswers): PromptResponse[] {
  return task.questions.map((question, index) => {
    const questionId = questionIdFrom(question, index);
    const response = asText(answers[questionId]);
    const minWordsRaw = Number(question.minWords);
    const minWords = Number.isFinite(minWordsRaw) && minWordsRaw > 0 ? minWordsRaw : null;
    const prompt = extractPrompt(question);
    const expectsQuestion =
      task.taskType === "AD_QUESTION" ||
      /\?$/.test(prompt) ||
      prompt.toLowerCase().includes("uzdod jautājumu");

    return {
      questionId,
      prompt,
      response,
      minWords,
      expectsQuestion,
    };
  });
}

function countImmediateRepeats(text: string): number {
  const matches = text.toLowerCase().match(/\b(\p{L}+)\s+\1\b/gu) ?? [];
  return matches.length;
}

function buildTaskCompletionScore(responses: PromptResponse[]): number {
  if (responses.length === 0) return 0;

  const answered = responses.filter((row) => row.response.length > 0);
  const coverage = answered.length / responses.length;

  const minWordItems = responses.filter((row) => typeof row.minWords === "number");
  const minWordCoverage =
    minWordItems.length === 0
      ? 1
      : minWordItems.reduce((acc, row) => {
          const totalWords = words(row.response).length;
          const ratio = row.minWords ? clamp(totalWords / row.minWords, 0, 1) : 1;
          return acc + ratio;
        }, 0) / minWordItems.length;

  const questionItems = responses.filter((row) => row.expectsQuestion);
  const questionCoverage =
    questionItems.length === 0
      ? 1
      : questionItems.reduce((acc, row) => acc + (/\?$/.test(row.response.trim()) ? 1 : 0), 0) / questionItems.length;

  return round((coverage * 0.6 + minWordCoverage * 0.3 + questionCoverage * 0.1) * 5);
}

function buildGrammarScore(responses: PromptResponse[]): number {
  const answered = responses.filter((row) => row.response.length > 0);
  if (answered.length === 0) return 0;

  const perResponse = answered.map((row) => {
    const text = row.response.trim();
    const tokenCount = words(text).length;
    const sentences = sentenceCount(text);
    let score = 5;

    if (tokenCount < 3) score -= 1;
    if (!/^[\p{Lu}]/u.test(text)) score -= 0.8;
    if (!/[.!?]$/.test(text)) score -= 0.8;
    if (/([!?.,])\1{1,}/.test(text)) score -= 0.4;
    score -= Math.min(1.6, countImmediateRepeats(text) * 0.5);
    if (tokenCount > 24 && sentences <= 1) score -= 0.8;

    return clamp(score, 0, 5);
  });

  return round(perResponse.reduce((acc, value) => acc + value, 0) / perResponse.length);
}

function buildVocabularyScore(responses: PromptResponse[]): number {
  const allWords = words(responses.map((row) => row.response).join(" "));
  if (allWords.length === 0) return 0;

  const uniqueCount = new Set(allWords).size;
  const uniqueRatio = uniqueCount / allWords.length;
  const longWordRatio = allWords.filter((word) => word.length >= 7).length / allWords.length;
  const lengthBoost = clamp(allWords.length / 25, 0.6, 1);

  const weighted = (uniqueRatio * 3.8 + longWordRatio * 1.5) * lengthBoost;
  return round(clamp(weighted, 0, 5));
}

function buildCoherenceScore(responses: PromptResponse[]): number {
  const combined = responses.map((row) => row.response).join(" ").trim().toLowerCase();
  if (!combined) return 0;

  const totalSentences = sentenceCount(combined);
  const totalWords = words(combined).length;
  const connectorHits = CONNECTORS.reduce((acc, connector) => {
    const regex = new RegExp(`\\b${connector}\\b`, "g");
    return acc + (combined.match(regex)?.length ?? 0);
  }, 0);

  const responseCount = Math.max(1, responses.length);
  const structure = clamp(totalSentences / (responseCount * 2), 0, 1);
  const connectorDensity = clamp(connectorHits / responseCount, 0, 1);
  const lengthCoverage = clamp(totalWords / (responseCount * 10), 0, 1);

  return round((structure * 0.45 + connectorDensity * 0.35 + lengthCoverage * 0.2) * 5);
}

function buildFluencyScore(responses: PromptResponse[]): number {
  const answered = responses.filter((row) => row.response.length > 0);
  if (answered.length === 0) return 0;

  const combined = answered.map((row) => row.response).join(" ").toLowerCase();
  const spokenWords = words(combined);
  if (spokenWords.length === 0) return 0;

  const fillerCount = spokenWords.filter((token) => FILLERS.includes(token)).length;
  const averageLength = spokenWords.length / answered.length;
  const smoothness = 1 - clamp(fillerCount / Math.max(1, spokenWords.length / 6), 0, 0.6);
  const pace = 1 - clamp(Math.abs(averageLength - 12) / 20, 0, 0.6);

  return round(clamp((smoothness * 0.6 + pace * 0.4) * 5, 0, 5));
}

function buildCorrections(responses: PromptResponse[]): AdaptiveCorrection[] {
  const corrections: AdaptiveCorrection[] = [];

  for (const row of responses) {
    if (!row.response.trim()) continue;

    const notes: string[] = [];
    const original = row.response.trim();
    let corrected = original.replace(/\s+/g, " ");

    if (corrected !== original) {
      notes.push("Normalized spacing.");
    }

    const deduped = corrected.replace(/\b(\p{L}+)\s+\1\b/giu, "$1");
    if (deduped !== corrected) {
      corrected = deduped;
      notes.push("Removed repeated word.");
    }

    if (/^[\p{Ll}]/u.test(corrected)) {
      corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
      notes.push("Capitalized sentence start.");
    }

    if (row.expectsQuestion && !/\?$/.test(corrected)) {
      corrected = corrected.replace(/[.!]+$/, "");
      corrected = `${corrected}?`;
      notes.push("Added question mark.");
    } else if (!row.expectsQuestion && !/[.!?]$/.test(corrected)) {
      corrected = `${corrected}.`;
      notes.push("Added ending punctuation.");
    }

    if (words(corrected).length < 5) {
      notes.push("Expand with one more detail for a stronger answer.");
    }

    if (notes.length > 0 || corrected !== original) {
      corrections.push({
        questionId: row.questionId,
        original,
        corrected,
        note: notes.join(" "),
      });
    }
  }

  return corrections.slice(0, 8);
}

function formatDimensionName(key: keyof DimensionScores): string {
  if (key === "taskCompletion") return "task completion";
  if (key === "grammar") return "grammar control";
  if (key === "vocabulary") return "vocabulary range";
  if (key === "coherence") return "coherence";
  return "fluency";
}

function buildStrengths(scores: DimensionScores): string[] {
  const items = Object.entries(scores) as Array<[keyof DimensionScores, number | undefined]>;
  return items
    .filter((entry): entry is [keyof DimensionScores, number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .filter(([, value]) => value >= 3.5)
    .slice(0, 3)
    .map(([dimension, value]) => `Strong ${formatDimensionName(dimension)} (${value.toFixed(1)}/5).`);
}

function suggestionForDimension(dimension: keyof DimensionScores): string {
  if (dimension === "taskCompletion") {
    return "Address every required point from the prompt and add one supporting detail.";
  }
  if (dimension === "grammar") {
    return "Use complete sentences with clear endings and check agreement in basic forms.";
  }
  if (dimension === "vocabulary") {
    return "Use a wider range of everyday words and avoid repeating the same phrase.";
  }
  if (dimension === "coherence") {
    return "Link ideas with connectors like 'un', 'bet', 'jo', and keep sentence order logical.";
  }
  return "Speak in steady short sentences and reduce filler words.";
}

function buildImprovements(scores: DimensionScores): string[] {
  const items = Object.entries(scores) as Array<[keyof DimensionScores, number | undefined]>;
  return items
    .filter((entry): entry is [keyof DimensionScores, number] => typeof entry[1] === "number")
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([dimension, value]) => `${suggestionForDimension(dimension)} (${value.toFixed(1)}/5)`);
}

function buildOverallFeedback(score: number, maxScore: number, rubric: DimensionScores): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const weakestDimension = (
    Object.entries(rubric) as Array<[keyof DimensionScores, number | undefined]>
  )
    .filter((entry): entry is [keyof DimensionScores, number] => typeof entry[1] === "number")
    .sort((a, b) => a[1] - b[1])[0]?.[0];

  if (ratio >= 0.85) {
    return "Very strong response. Keep the same structure and add a bit more variety for top consistency.";
  }
  if (ratio >= 0.65) {
    const weak = weakestDimension ? formatDimensionName(weakestDimension) : "accuracy";
    return `Good response overall. Focus next on ${weak} to move to the top band.`;
  }
  return "Response is understandable but needs clearer structure and language control to meet A2 target reliably.";
}

function evaluateWordFormTask(task: EvaluatorTask, answers: RawAnswers): AdaptiveEvaluation {
  const expectedRows = task.questions
    .map((question, index) => {
      const questionId = questionIdFrom(question, index);
      const expected = asText(question.correctAnswer);
      const provided = asText(answers[questionId]);
      return { questionId, expected, provided };
    })
    .filter((row) => row.expected.length > 0);

  if (expectedRows.length === 0) {
    return heuristicallyEvaluate(task, answers);
  }

  let exactMatches = 0;
  let nearMatches = 0;
  const corrections: AdaptiveCorrection[] = [];

  for (const row of expectedRows) {
    const expectedStrict = row.expected.trim().toLowerCase();
    const providedStrict = row.provided.trim().toLowerCase();
    const expectedSoft = comparable(row.expected);
    const providedSoft = comparable(row.provided);

    if (providedStrict && providedStrict === expectedStrict) {
      exactMatches += 1;
      continue;
    }

    if (providedSoft && providedSoft === expectedSoft) {
      nearMatches += 1;
      corrections.push({
        questionId: row.questionId,
        original: row.provided,
        corrected: row.expected,
        note: "Form is close, but add correct Latvian spelling/diacritics.",
      });
      continue;
    }

    corrections.push({
      questionId: row.questionId,
      original: row.provided || "(no answer)",
      corrected: row.expected,
      note: "Use the correct word form shown here.",
    });
  }

  const total = expectedRows.length;
  const answeredCount = expectedRows.filter((row) => row.provided.length > 0).length;
  const completionRatio = answeredCount / total;
  const accuracyRatio = (exactMatches + nearMatches * 0.7) / total;
  const score = round(accuracyRatio * task.points);
  const rubric: DimensionScores = {
    taskCompletion: round(completionRatio * 5),
    grammar: round(accuracyRatio * 5),
    vocabulary: round(accuracyRatio * 4.5 + completionRatio * 0.5),
    coherence: round(Math.max(2, completionRatio * 5)),
  };

  const strengths =
    exactMatches > 0
      ? [`Correct forms: ${exactMatches}/${total}.`]
      : ["At least one attempt was provided for this grammar task."];
  const improvements = [
    `Expected forms corrected: ${corrections.length}/${total}.`,
    "Review noun cases and endings before retrying.",
  ];

  return {
    method: "heuristic",
    score: clamp(score, 0, task.points),
    maxScore: task.points,
    rubric,
    strengths,
    improvements,
    corrections,
    overallFeedback:
      corrections.length === 0
        ? "Excellent control of word forms."
        : "Focus on case endings and spelling to improve word-form accuracy.",
  };
}

function heuristicallyEvaluate(task: EvaluatorTask, answers: RawAnswers): AdaptiveEvaluation {
  const responses = extractResponses(task, answers);
  const rubric: DimensionScores = {
    taskCompletion: buildTaskCompletionScore(responses),
    grammar: buildGrammarScore(responses),
    vocabulary: buildVocabularyScore(responses),
    coherence: buildCoherenceScore(responses),
  };

  if (task.skill === Skill.SPEAKING) {
    rubric.fluency = buildFluencyScore(responses);
  }

  const writingWeighted =
    rubric.taskCompletion * 0.35 +
    rubric.grammar * 0.25 +
    rubric.vocabulary * 0.2 +
    rubric.coherence * 0.2;

  const speakingWeighted =
    rubric.taskCompletion * 0.35 +
    rubric.grammar * 0.2 +
    rubric.vocabulary * 0.15 +
    rubric.coherence * 0.1 +
    (rubric.fluency ?? 0) * 0.2;

  const weighted = task.skill === Skill.SPEAKING ? speakingWeighted : writingWeighted;
  const score = round((weighted / 5) * task.points);

  const strengths = buildStrengths(rubric);
  const improvements = buildImprovements(rubric);
  const corrections = buildCorrections(responses);
  const overallFeedback = buildOverallFeedback(score, task.points, rubric);

  return {
    method: "heuristic",
    score: clamp(score, 0, task.points),
    maxScore: task.points,
    rubric,
    strengths:
      strengths.length > 0 ? strengths : ["Answer includes at least one relevant idea tied to the prompt."],
    improvements,
    corrections,
    overallFeedback,
  };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function readModelText(payload: OpenAIResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function sanitizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => asText(item))
    .filter(Boolean)
    .slice(0, 6);
  return items.length > 0 ? items : fallback;
}

function sanitizeCorrections(
  value: unknown,
  fallback: AdaptiveCorrection[],
  validIds: Set<string>,
): AdaptiveCorrection[] {
  if (!Array.isArray(value)) return fallback;

  const mapped = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const questionId = asText(row.questionId);
      if (!questionId || !validIds.has(questionId)) return null;

      const original = asText(row.original);
      const corrected = asText(row.corrected);
      const note = asText(row.note);
      if (!original || !corrected) return null;

      return { questionId, original, corrected, note: note || "Improved clarity and correctness." };
    })
    .filter((entry): entry is AdaptiveCorrection => Boolean(entry))
    .slice(0, 8);

  return mapped.length > 0 ? mapped : fallback;
}

function sanitizeOpenAIEvaluation(
  raw: unknown,
  task: EvaluatorTask,
  heuristic: AdaptiveEvaluation,
  responses: PromptResponse[],
  model: string,
): AdaptiveEvaluation | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const rubricInput = (row.rubric as Record<string, unknown> | undefined) ?? {};
  const validIds = new Set(responses.map((item) => item.questionId));

  const rubric: DimensionScores = {
    taskCompletion: clamp(Number(rubricInput.taskCompletion ?? heuristic.rubric.taskCompletion), 0, 5),
    grammar: clamp(Number(rubricInput.grammar ?? heuristic.rubric.grammar), 0, 5),
    vocabulary: clamp(Number(rubricInput.vocabulary ?? heuristic.rubric.vocabulary), 0, 5),
    coherence: clamp(Number(rubricInput.coherence ?? heuristic.rubric.coherence), 0, 5),
  };

  if (task.skill === Skill.SPEAKING) {
    rubric.fluency = clamp(Number(rubricInput.fluency ?? heuristic.rubric.fluency ?? 0), 0, 5);
  }

  const answeredCount = responses.filter((entry) => entry.response.length > 0).length;
  const rawScore = clamp(Number(row.overallScore ?? row.score ?? heuristic.score), 0, task.points);
  const score = answeredCount === 0 ? 0 : rawScore;

  const strengths = sanitizeStringArray(row.strengths, heuristic.strengths);
  const improvements = sanitizeStringArray(row.improvements, heuristic.improvements);
  const corrections = sanitizeCorrections(row.corrections, heuristic.corrections, validIds);
  const overallFeedback = asText(row.overallFeedback) || heuristic.overallFeedback;

  return {
    method: "openai",
    model,
    score: round(score),
    maxScore: task.points,
    rubric: {
      taskCompletion: round(rubric.taskCompletion),
      grammar: round(rubric.grammar),
      vocabulary: round(rubric.vocabulary),
      coherence: round(rubric.coherence),
      fluency: typeof rubric.fluency === "number" ? round(rubric.fluency) : undefined,
    },
    strengths,
    improvements,
    corrections,
    overallFeedback,
  };
}

async function evaluateWithOpenAI(
  task: EvaluatorTask,
  responses: PromptResponse[],
  heuristic: AdaptiveEvaluation,
): Promise<AdaptiveEvaluation | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_EVALUATOR_MODEL ?? "gpt-4o-mini";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const promptPayload = {
      skill: task.skill,
      taskType: task.taskType,
      maxScore: task.points,
      examLevel: "A2",
      taskPrompt: {
        lv: task.promptLv,
        en: task.promptEn,
      },
      responses: responses.map((item) => ({
        questionId: item.questionId,
        prompt: item.prompt,
        learnerResponse: item.response,
      })),
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are an A2 Latvian exam evaluator. Grade writing/speaking responses and produce corrections. Return valid JSON only.",
          },
          {
            role: "user",
            content: `
Evaluate this learner submission and return JSON with this schema:
{
  "overallScore": number,
  "rubric": {
    "taskCompletion": number,
    "grammar": number,
    "vocabulary": number,
    "coherence": number,
    "fluency": number (only for speaking)
  },
  "strengths": string[],
  "improvements": string[],
  "corrections": [{"questionId":"string","original":"string","corrected":"string","note":"string"}],
  "overallFeedback": "string"
}
Rules:
- Score range is 0..${task.points}.
- Rubric dimensions are 0..5.
- Corrections must use provided questionId values.
- Keep feedback concise and actionable.
Submission:
${JSON.stringify(promptPayload)}
`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OpenAIResponse;
    const content = readModelText(payload);
    const parsed = extractJsonObject(content);
    if (!parsed) return null;

    return sanitizeOpenAIEvaluation(parsed, task, heuristic, responses, model);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function supportsAdaptiveEvaluation(taskType: TaskType, skill: Skill): boolean {
  return (skill === Skill.WRITING || skill === Skill.SPEAKING) && SUPPORTED_TASK_TYPES.includes(taskType);
}

export async function evaluateProductionTask(params: EvaluateProductionParams): Promise<AdaptiveEvaluation | null> {
  if (!supportsAdaptiveEvaluation(params.task.taskType, params.task.skill)) {
    return null;
  }

  if (params.task.taskType === "WORD_FORM") {
    return evaluateWordFormTask(params.task, params.answers);
  }

  const responses = extractResponses(params.task, params.answers);
  const heuristic = heuristicallyEvaluate(params.task, params.answers);
  const aiEvaluation = await evaluateWithOpenAI(params.task, responses, heuristic);

  if (aiEvaluation) {
    return aiEvaluation;
  }

  const warnings = process.env.OPENAI_API_KEY
    ? ["AI evaluator unavailable; used local fallback scoring."]
    : ["OPENAI_API_KEY not configured; used local fallback scoring."];

  return {
    ...heuristic,
    warnings,
  };
}
