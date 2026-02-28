import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVvppA2Exams } from "@/lib/vvpp-a2-generator";
import { generateVvppA2ExamsSmart, generateVvppA2ExamsSmartWithStats } from "@/lib/vvpp-a2-smart-generator";

const mocks = vi.hoisted(() => {
  class MockOpenAICompatibleError extends Error {
    code: string;
    status?: number;
    details?: string;

    constructor(params: { message: string; code: string; status?: number; details?: string }) {
      super(params.message);
      this.name = "OpenAICompatibleError";
      this.code = params.code;
      this.status = params.status;
      this.details = params.details;
    }
  }

  return {
    listModelsMock: vi.fn(),
    chatJsonMock: vi.fn(),
    MockOpenAICompatibleError,
  };
});

vi.mock("@/lib/openai-compatible", () => ({
  listModels: mocks.listModelsMock,
  chatJson: mocks.chatJsonMock,
  OpenAICompatibleError: mocks.MockOpenAICompatibleError,
}));

function buildDraft(suffix = "A") {
  return {
    examId: `draft_${suffix}`,
    versionLabel: `DRAFT_${suffix}`,
    tasks: [
      {
        officialOrder: 1,
        topic: "family",
        instructionLv: `Noklausies paziņojumus ${suffix}`,
        rewrite: {
          audioScriptLv: [
            `Paziņojums viens ${suffix}.`,
            `Paziņojums divi ${suffix}.`,
            `Paziņojums trīs ${suffix}.`,
            `Paziņojums četri ${suffix}.`,
            `Paziņojums pieci ${suffix}.`,
            `Paziņojums seši ${suffix}.`,
          ],
          transcriptLv: `Paziņojums viens ${suffix}. Paziņojums divi ${suffix}. Paziņojums trīs ${suffix}. Paziņojums četri ${suffix}. Paziņojums pieci ${suffix}. Paziņojums seši ${suffix}.`,
          stemsLv: [
            `Jautājums viens ${suffix}?`,
            `Jautājums divi ${suffix}?`,
            `Jautājums trīs ${suffix}?`,
            `Jautājums četri ${suffix}?`,
            `Jautājums pieci ${suffix}?`,
            `Jautājums seši ${suffix}?`,
          ],
          optionsLv: [
            ["A1", "B1", "C1"],
            ["A2", "B2", "C2"],
            ["A3", "B3", "C3"],
            ["A4", "B4", "C4"],
            ["A5", "B5", "C5"],
            ["A6", "B6", "C6"],
          ],
          correctOptionIndex: [0, 1, 2, 0, 1, 2],
        },
      },
      {
        officialOrder: 2,
        topic: "work",
        instructionLv: `Atzīmē patiesi vai nepatiesi ${suffix}`,
        rewrite: {
          audioScriptLv: [
            `A runā ${suffix}.`,
            `B atbild ${suffix}.`,
            `A jautā ${suffix}.`,
            `B skaidro ${suffix}.`,
            `A precizē ${suffix}.`,
            `B piekrīt ${suffix}.`,
          ],
          stemsLv: [
            `Apgalvojums viens ${suffix}.`,
            `Apgalvojums divi ${suffix}.`,
            `Apgalvojums trīs ${suffix}.`,
            `Apgalvojums četri ${suffix}.`,
          ],
          correct: [true, false, true, false],
        },
      },
      {
        officialOrder: 3,
        topic: "shopping",
        instructionLv: `Aizpildi tukšumus ${suffix}`,
        rewrite: {
          audioScriptLv: [
            `Dialogs viens ${suffix}.`,
            `Dialogs divi ${suffix}.`,
            `Dialogs trīs ${suffix}.`,
            `Dialogs četri ${suffix}.`,
            `Dialogs pieci ${suffix}.`,
          ],
          transcriptLv: `Dialogs viens ${suffix}. Dialogs divi ${suffix}. Dialogs trīs ${suffix}. Dialogs četri ${suffix}. Dialogs pieci ${suffix}.`,
          wordBankLv: ["rīt", "deviņos", "aptiekā", "lielo", "divas", "zaļo", "vēlu", "aukstu", "lēni"],
          stemsLv: [
            `Tukšums viens ${suffix}.`,
            `Tukšums divi ${suffix}.`,
            `Tukšums trīs ${suffix}.`,
            `Tukšums četri ${suffix}.`,
            `Tukšums pieci ${suffix}.`,
          ],
          correctWords: ["rīt", "deviņos", "aptiekā", "lielo", "divas"],
        },
      },
      {
        officialOrder: 4,
        topic: "health",
        instructionLv: `Izlasi īsus tekstus ${suffix}`,
        rewrite: {
          textsLv: [
            `Teksts viens ${suffix}.`,
            `Teksts divi ${suffix}.`,
            `Teksts trīs ${suffix}.`,
            `Teksts četri ${suffix}.`,
          ],
          optionsLv: [
            ["A", "B", "C"],
            ["D", "E", "F"],
            ["G", "H", "I"],
            ["J", "K", "L"],
          ],
          correctOptionIndex: [0, 1, 2, 0],
        },
      },
      {
        officialOrder: 5,
        topic: "transport",
        instructionLv: `Savieno situācijas ar sludinājumiem ${suffix}`,
        rewrite: {
          adsLv: [
            `Sludinājums A ${suffix}.`,
            `Sludinājums B ${suffix}.`,
            `Sludinājums C ${suffix}.`,
            `Sludinājums D ${suffix}.`,
            `Sludinājums E ${suffix}.`,
            `Sludinājums F ${suffix}.`,
            `Sludinājums G ${suffix}.`,
            `Sludinājums H ${suffix}.`,
          ],
          situationsLv: [
            `Situācija viens ${suffix}.`,
            `Situācija divi ${suffix}.`,
            `Situācija trīs ${suffix}.`,
            `Situācija četri ${suffix}.`,
            `Situācija pieci ${suffix}.`,
            `Situācija seši ${suffix}.`,
          ],
          answerAdIndex: [0, 1, 2, 3, 4, 5],
        },
      },
      {
        officialOrder: 6,
        topic: "leisure",
        instructionLv: `Aizpildi tekstu ${suffix}`,
        rewrite: {
          textLv: `Mans īsais teksts ${suffix} ar pieciem tukšumiem.`,
          stemsLv: [
            `Tukšums 1 ${suffix}.`,
            `Tukšums 2 ${suffix}.`,
            `Tukšums 3 ${suffix}.`,
            `Tukšums 4 ${suffix}.`,
            `Tukšums 5 ${suffix}.`,
          ],
          optionsLv: [
            ["a", "b", "c"],
            ["d", "e", "f"],
            ["g", "h", "i"],
            ["j", "k", "l"],
            ["m", "n", "o"],
          ],
          correctOptionIndex: [0, 1, 2, 0, 1],
        },
      },
      {
        officialOrder: 7,
        topic: "holidays",
        instructionLv: `Raksti par attēliem ${suffix}`,
        rewrite: {
          picturePromptsLv: [
            `Attēls viens ${suffix}.`,
            `Attēls divi ${suffix}.`,
            `Attēls trīs ${suffix}.`,
            `Attēls četri ${suffix}.`,
          ],
          sampleResponseLv: `Parauga atbilde ${suffix} ar četriem vienkāršiem teikumiem.`,
          commonErrorsLv: [
            `Kļūda viens ${suffix}.`,
            `Kļūda divi ${suffix}.`,
            `Kļūda trīs ${suffix}.`,
          ],
        },
      },
      {
        officialOrder: 8,
        topic: "weather",
        instructionLv: `Aizpildi formas ${suffix}`,
        rewrite: {
          stemsLv: [
            `Forma viens ${suffix}.`,
            `Forma divi ${suffix}.`,
            `Forma trīs ${suffix}.`,
            `Forma četri ${suffix}.`,
            `Forma pieci ${suffix}.`,
          ],
          correctForms: ["forma1", "forma2", "forma3", "forma4", "forma5"],
          sampleResponseLv: `forma1, forma2, forma3, forma4, forma5`,
          commonErrorsLv: [
            `Galotnes kļūda ${suffix}.`,
            `Laika kļūda ${suffix}.`,
            `Pareizrakstības kļūda ${suffix}.`,
          ],
        },
      },
      {
        officialOrder: 9,
        topic: "family",
        instructionLv: `Uzraksti ziņu ${suffix}`,
        rewrite: {
          scenarioLv: `Tu pazaudēji somu ${suffix}.`,
          planPointsLv: ["Kas notika", "Kad un kur", "Ko lūdz", "Kontakti"],
          sampleResponseLv: `Sveiki, vakar pazaudēju somu pieturā. Lūdzu zvaniet, ja atradāt.`,
          commonErrorsLv: [
            `Trūkst punkta ${suffix}.`,
            `Trūkst kontakta ${suffix}.`,
            `Par īsu teksts ${suffix}.`,
          ],
        },
      },
      {
        officialOrder: 10,
        topic: "work",
        instructionLv: `Atbildi uz interviju ${suffix}`,
        rewrite: {
          promptsLv: [
            `Jautājums 1 ${suffix}?`,
            `Jautājums 2 ${suffix}?`,
            `Jautājums 3 ${suffix}?`,
            `Jautājums 4 ${suffix}?`,
            `Jautājums 5 ${suffix}?`,
            `Jautājums 6 ${suffix}?`,
            `Jautājums 7 ${suffix}?`,
            `Jautājums 8 ${suffix}?`,
            `Jautājums 9 ${suffix}?`,
            `Jautājums 10 ${suffix}?`,
          ],
          sampleResponseLv: [
            `Paraugs viens ${suffix}.`,
            `Paraugs divi ${suffix}.`,
            `Paraugs trīs ${suffix}.`,
          ],
          commonErrorsLv: [
            `Nav pilna teikuma ${suffix}.`,
            `Atbilde nav skaidra ${suffix}.`,
            `Pārāk īsa atbilde ${suffix}.`,
          ],
        },
      },
      {
        officialOrder: 11,
        topic: "shopping",
        instructionLv: `Apraksti attēlus ${suffix}`,
        rewrite: {
          imageDescriptionsLv: [
            `Attēla apraksts viens ${suffix}.`,
            `Attēla apraksts divi ${suffix}.`,
          ],
          guidedQuestionsLv: [
            `Jautājums A ${suffix}?`,
            `Jautājums B ${suffix}?`,
            `Jautājums C ${suffix}?`,
          ],
          personalQuestionLv: `Pastāsti par pieredzi ${suffix}.`,
          sampleResponseLv: `Pilna parauga atbilde ${suffix} ar četrām daļām.`,
          commonErrorsLv: [
            `Trūkst vietas ${suffix}.`,
            `Trūkst darbības ${suffix}.`,
            `Nav personiskās pieredzes ${suffix}.`,
          ],
        },
      },
      {
        officialOrder: 12,
        topic: "health",
        instructionLv: `Uzdod jautājumus ${suffix}`,
        rewrite: {
          adsLv: [
            `Sludinājums viens ${suffix}.`,
            `Sludinājums divi ${suffix}.`,
            `Sludinājums trīs ${suffix}.`,
          ],
          targetsLv: ["cena", "laiks", "adrese"],
          promptsLv: [
            `Uzdod pirmo jautājumu ${suffix}.`,
            `Uzdod otro jautājumu ${suffix}.`,
            `Uzdod trešo jautājumu ${suffix}.`,
          ],
          sampleResponseLv: [
            `Cik maksā piedāvājums ${suffix}?`,
            `Cikos notiek pakalpojums ${suffix}?`,
            `Kur atrodas vieta ${suffix}?`,
          ],
          commonErrorsLv: [
            `Nav jautājuma zīmes ${suffix}.`,
            `Nav pilna teikuma ${suffix}.`,
            `Jautājums nav atbilstošs ${suffix}.`,
          ],
        },
      },
    ],
  };
}

describe("vvpp smart generator", () => {
  const previousEnv = {
    base: process.env.OPENAI_BASE_URL,
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EVALUATOR_MODEL,
  };
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    mocks.listModelsMock.mockReset();
    mocks.chatJsonMock.mockReset();

    process.env.OPENAI_BASE_URL = "http://127.0.0.1:1234";
    process.env.OPENAI_API_KEY = "local-ai";
    process.env.OPENAI_EVALUATOR_MODEL = "openai/gpt-oss-20b";
  });

  afterAll(() => {
    if (previousEnv.base !== undefined) process.env.OPENAI_BASE_URL = previousEnv.base;
    else delete process.env.OPENAI_BASE_URL;

    if (previousEnv.key !== undefined) process.env.OPENAI_API_KEY = previousEnv.key;
    else delete process.env.OPENAI_API_KEY;

    if (previousEnv.model !== undefined) process.env.OPENAI_EVALUATOR_MODEL = previousEnv.model;
    else delete process.env.OPENAI_EVALUATOR_MODEL;

    errorSpy.mockRestore();
  });

  it("returns template generator output when LLM is disabled", async () => {
    const smart = await generateVvppA2ExamsSmart({ n: 2, seed: 2026, useLlm: false });
    const plain = generateVvppA2Exams({ n: 2, seed: 2026 });

    expect(JSON.stringify(smart)).toBe(JSON.stringify(plain));
  });

  it("uses LLM draft when preflight and draft generation succeed", async () => {
    mocks.listModelsMock.mockResolvedValue(["openai/gpt-oss-20b"]);

    mocks.chatJsonMock.mockResolvedValue({
      json: buildDraft("LLM"),
      rawText: JSON.stringify(buildDraft("LLM")),
    });

    const payload = await generateVvppA2ExamsSmart({
      n: 1,
      seed: 2026,
      useLlm: true,
      llm: { maxRetries: 0, timeoutMs: 1000 },
    });

    const task1 = payload.exams[0].sections[0].tasks[0];
    expect(task1.instructionLv).toContain("LLM");
    expect(task1.questions[0]?.stemLv).toContain("LLM");
    expect(task1.answerKey?.items[0]?.correctOptionIndex).toBe(0);
    expect(mocks.chatJsonMock).toHaveBeenCalledTimes(12);
  });

  it("falls back to template output when LLM returns invalid JSON", async () => {
    mocks.listModelsMock.mockResolvedValue(["openai/gpt-oss-20b"]);

    mocks.chatJsonMock.mockRejectedValue(
      new mocks.MockOpenAICompatibleError({
        message: "invalid",
        code: "INVALID_JSON",
      }),
    );

    const smart = await generateVvppA2ExamsSmart({
      n: 1,
      seed: 2026,
      useLlm: true,
      llm: { maxRetries: 1, timeoutMs: 1000 },
    });

    const plain = generateVvppA2Exams({ n: 1, seed: 2026 });
    expect(JSON.stringify(smart)).toBe(JSON.stringify(plain));
  });

  it("falls back when LLM times out", async () => {
    mocks.listModelsMock.mockResolvedValue(["openai/gpt-oss-20b"]);

    mocks.chatJsonMock.mockRejectedValue(
      new mocks.MockOpenAICompatibleError({
        message: "timed out",
        code: "TIMEOUT",
      }),
    );

    const smart = await generateVvppA2ExamsSmart({
      n: 1,
      seed: 2026,
      useLlm: true,
      llm: { maxRetries: 0, timeoutMs: 1000 },
    });

    const plain = generateVvppA2Exams({ n: 1, seed: 2026 });
    expect(JSON.stringify(smart)).toBe(JSON.stringify(plain));
  });

  it("keeps output root shape and supports extra practice variants", async () => {
    mocks.listModelsMock.mockResolvedValue(["openai/gpt-oss-20b"]);

    let callIndex = 0;
    mocks.chatJsonMock.mockImplementation(async () => {
      callIndex += 1;
      return { json: buildDraft(String(callIndex)), rawText: JSON.stringify(buildDraft(String(callIndex))) };
    });

    const payload = await generateVvppA2ExamsSmart({
      n: 3,
      seed: 2026,
      extraPracticeVariants: 2,
      useLlm: true,
      llm: { maxRetries: 0, timeoutMs: 1000 },
    });

    expect(Object.keys(payload)).toEqual(["generator", "exams"]);
    expect(payload.generator.n).toBe(3);
    expect(payload.exams).toHaveLength(5);
  });

  it("handles n=200 with concurrency=1 using mocked LLM", async () => {
    mocks.listModelsMock.mockResolvedValue(["openai/gpt-oss-20b"]);

    let callIndex = 0;
    mocks.chatJsonMock.mockImplementation(async () => {
      callIndex += 1;
      const suffix = String(callIndex);
      return { json: buildDraft(suffix), rawText: JSON.stringify(buildDraft(suffix)) };
    });

    const payload = await generateVvppA2ExamsSmart({
      n: 200,
      seed: 2026,
      useLlm: true,
      llm: {
        maxRetries: 0,
        timeoutMs: 1000,
        concurrency: 1,
        chunkSize: 25,
      },
    });

    expect(payload.exams).toHaveLength(200);

    for (const exam of payload.exams) {
      const totals = Object.fromEntries(
        exam.sections.map((section) => [
          section.skill,
          section.tasks.reduce((sum, task) => sum + task.points, 0),
        ]),
      );
      expect(totals).toEqual({
        LISTENING: 15,
        READING: 15,
        WRITING: 15,
        SPEAKING: 15,
      });
    }
  });

  it("emits progress events with percent and coherent counters", async () => {
    mocks.listModelsMock.mockResolvedValue(["openai/gpt-oss-20b"]);

    let callIndex = 0;
    mocks.chatJsonMock.mockImplementation(async () => {
      callIndex += 1;
      const suffix = String(callIndex);
      return { json: buildDraft(suffix), rawText: JSON.stringify(buildDraft(suffix)) };
    });

    const progressEvents: Array<{
      phase: string;
      percent: number;
      completedExams: number;
      totalExams: number;
      llmCount: number;
      fallbackCount: number;
    }> = [];

    const { stats } = await generateVvppA2ExamsSmartWithStats(
      {
        n: 2,
        seed: 2026,
        useLlm: true,
        llm: { maxRetries: 0, timeoutMs: 1000, concurrency: 1, chunkSize: 1 },
      },
      {
        onProgress(event) {
          progressEvents.push({
            phase: event.phase,
            percent: event.percent,
            completedExams: event.completedExams,
            totalExams: event.totalExams,
            llmCount: event.llmCount,
            fallbackCount: event.fallbackCount,
          });
        },
      },
    );

    expect(progressEvents.some((event) => event.phase === "start")).toBe(true);
    expect(progressEvents.some((event) => event.phase === "preflight")).toBe(true);
    expect(progressEvents.filter((event) => event.phase === "generating")).toHaveLength(2);

    const last = progressEvents[progressEvents.length - 1];
    expect(last.phase).toBe("completed");
    expect(last.percent).toBe(100);
    expect(last.completedExams).toBe(2);
    expect(last.totalExams).toBe(2);
    expect(last.llmCount + last.fallbackCount).toBe(2);
    expect(stats.llmCount + stats.fallbackCount).toBe(2);
  });
});
