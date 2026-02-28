import { Skill, TaskType } from "@prisma/client";
import { evaluateProductionTask } from "@/lib/production-evaluator";

describe("evaluateProductionTask", () => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_EVALUATOR_MODEL;
  const previousBaseUrl = process.env.OPENAI_BASE_URL;
  const previousFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_EVALUATOR_MODEL;
    delete process.env.OPENAI_BASE_URL;
  });

  afterAll(() => {
    if (typeof previousApiKey === "string") {
      process.env.OPENAI_API_KEY = previousApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }

    if (typeof previousModel === "string") {
      process.env.OPENAI_EVALUATOR_MODEL = previousModel;
    } else {
      delete process.env.OPENAI_EVALUATOR_MODEL;
    }

    if (typeof previousBaseUrl === "string") {
      process.env.OPENAI_BASE_URL = previousBaseUrl;
    } else {
      delete process.env.OPENAI_BASE_URL;
    }

    global.fetch = previousFetch;
  });

  it("returns adaptive fallback scoring for writing without API key", async () => {
    const evaluation = await evaluateProductionTask({
      task: {
        id: "writing_message_advert_001",
        skill: Skill.WRITING,
        taskType: TaskType.MESSAGE_ADVERT,
        points: 8,
        promptLv: "Uzraksti ziņu par sludinājumu.",
        promptEn: "Write a message about the advert.",
        questions: [
          {
            id: "q1",
            minWords: 35,
            bulletPoints: ["kas jūs interesē", "laiks", "cena"],
          },
        ],
      },
      answers: {
        q1: "Labdien! Mani interese dzivoklis. Vai tas ir pieejams sestdien? Cik maksa menesi?",
      },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.method).toBe("heuristic");
    expect(evaluation?.maxScore).toBe(8);
    expect(typeof evaluation?.score).toBe("number");
    expect(evaluation?.warnings?.length).toBeGreaterThan(0);
    expect(evaluation?.improvements.length).toBeGreaterThan(0);
  });

  it("suggests question-form correction for speaking ad questions", async () => {
    const evaluation = await evaluateProductionTask({
      task: {
        id: "speaking_ad_question_001",
        skill: Skill.SPEAKING,
        taskType: TaskType.AD_QUESTION,
        points: 4,
        promptLv: "Uzdod jautājumu par sludinājumu.",
        promptEn: "Ask a question about the advert.",
        questions: [
          {
            id: "q1",
            target: "laiks",
            promptLv: "Uzdod jautājumu par apskates laiku",
          },
        ],
      },
      answers: {
        q1: "cikos ir apskate",
      },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.rubric.fluency).toBeDefined();
    expect(evaluation?.corrections[0]?.corrected.endsWith("?")).toBe(true);
  });

  it("uses answer-key corrections for word-form tasks", async () => {
    const evaluation = await evaluateProductionTask({
      task: {
        id: "writing_word_forms_001",
        skill: Skill.WRITING,
        taskType: TaskType.WORD_FORM,
        points: 5,
        promptLv: "Aizpildi teikumus ar pareizo vārda formu.",
        promptEn: "Fill with the correct word form.",
        questions: [
          { id: "q1", stemLv: "Es dzīvoju ____ (Rīga).", correctAnswer: "Rīgā" },
          { id: "q2", stemLv: "Mēs ejam uz ____ (veikals).", correctAnswer: "veikalu" },
        ],
      },
      answers: {
        q1: "Riga",
        q2: "veikals",
      },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.method).toBe("heuristic");
    expect(evaluation?.corrections.length).toBe(2);
    expect(evaluation?.corrections[0]?.corrected).toBe("Rīgā");
    expect(evaluation?.score).toBeLessThan(5);
  });

  it("uses model id when OPENAI_EVALUATOR_MODEL contains alias prefix", async () => {
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:1234";
    process.env.OPENAI_API_KEY = "local-ai";
    process.env.OPENAI_EVALUATOR_MODEL = "llm openai/gpt-oss-20b";

    let requestModel = "";
    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requestModel = String(body.model ?? "");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  overallScore: 6,
                  rubric: {
                    taskCompletion: 4,
                    grammar: 4,
                    vocabulary: 3,
                    coherence: 4,
                  },
                  strengths: ["Task mostly complete"],
                  improvements: ["Add more detail"],
                  corrections: [],
                  overallFeedback: "Solid answer.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const evaluation = await evaluateProductionTask({
      task: {
        id: "writing_message_advert_001",
        skill: Skill.WRITING,
        taskType: TaskType.MESSAGE_ADVERT,
        points: 8,
        promptLv: "Uzraksti ziņu par sludinājumu.",
        promptEn: "Write a message about the advert.",
        questions: [{ id: "q1", minWords: 35 }],
      },
      answers: {
        q1: "Labdien! Mani interesē sludinājums. Vai varam sarunāt tikšanos sestdien?",
      },
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation?.method).toBe("openai");
    expect(requestModel).toBe("openai/gpt-oss-20b");
  });
});
