import { describe, expect, it } from "vitest";
import { generateVvppA2Exams } from "@/lib/vvpp-a2-generator";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}'-]+/gu) ?? [];
}

describe("vvpp a2 generator", () => {
  it("is reproducible for same seed and N", () => {
    const a = generateVvppA2Exams({ seed: 2026, n: 3 });
    const b = generateVvppA2Exams({ seed: 2026, n: 3 });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("changes output for a different seed", () => {
    const a = generateVvppA2Exams({ seed: 2026, n: 2 });
    const b = generateVvppA2Exams({ seed: 2027, n: 2 });

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("matches blueprint order, durations, and scoring", () => {
    const payload = generateVvppA2Exams({ seed: 2026, n: 3 });

    expect(payload.generator.name).toBe("VVPP_A2_Generator");
    expect(payload.generator.seed).toBe(2026);
    expect(payload.generator.n).toBe(3);
    expect(payload.exams).toHaveLength(3);

    for (const exam of payload.exams) {
      expect(exam.sectionDurationsMin).toEqual({
        LISTENING: 25,
        READING: 30,
        WRITING: 35,
        SPEAKING: 15,
      });

      expect(exam.passRule).toEqual({ perSkillMin: 9, perSkillMax: 15 });
      expect(exam.sections.map((s) => s.skill)).toEqual(["LISTENING", "READING", "WRITING", "SPEAKING"]);
      expect(exam.sections.map((s) => s.tasks.length)).toEqual([3, 3, 3, 3]);

      const allTasks = exam.sections.flatMap((section) => section.tasks);
      const orders = allTasks.map((task) => task.officialOrder).sort((a, b) => a - b);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      const pointsBySkill = Object.fromEntries(
        exam.sections.map((section) => [
          section.skill,
          section.tasks.reduce((sum, task) => sum + task.points, 0),
        ]),
      );

      expect(pointsBySkill).toEqual({
        LISTENING: 15,
        READING: 15,
        WRITING: 15,
        SPEAKING: 15,
      });

      expect(exam.validation).toEqual({
        listeningPoints: 15,
        readingPoints: 15,
        writingPoints: 15,
        speakingPoints: 15,
        totalPoints: 60,
      });
    }
  });

  it("includes answer keys for auto-graded tasks and omits for production tasks", () => {
    const payload = generateVvppA2Exams({ seed: 2026, n: 1 });
    const exam = payload.exams[0];
    const allTasks = exam.sections.flatMap((section) => section.tasks);

    const autoOrders = new Set([1, 2, 3, 4, 5, 6, 8]);

    for (const task of allTasks) {
      const hasAnswerKey = Boolean(task.answerKey?.items?.length);
      if (autoOrders.has(task.officialOrder)) {
        expect(hasAnswerKey).toBe(true);
      } else {
        expect(hasAnswerKey).toBe(false);
      }
    }
  });

  it("includes rubric, sample response, and common errors for writing/speaking tasks", () => {
    const payload = generateVvppA2Exams({ seed: 2026, n: 1 });
    const exam = payload.exams[0];

    const productionTasks = exam.sections
      .flatMap((section) => section.tasks)
      .filter((task) => task.officialOrder >= 7);

    expect(productionTasks).toHaveLength(6);

    for (const task of productionTasks) {
      expect(task.rubric?.dimensions?.length).toBeGreaterThan(0);
      expect(task.sampleResponseLv).toBeDefined();
      expect(Array.isArray(task.commonErrorsLv)).toBe(true);
      expect(task.commonErrorsLv?.length).toBeGreaterThan(0);
    }
  });

  it("keeps core texts unique across versions", () => {
    const payload = generateVvppA2Exams({ seed: 2026, n: 3, extraPracticeVariants: 2 });

    const firstSeenInExam = new Map<string, string>();

    for (const exam of payload.exams) {
      const allTasks = exam.sections.flatMap((section) => section.tasks);

      for (const task of allTasks) {
        const coreTexts: string[] = [];

        if (task.officialOrder <= 3 && Array.isArray(task.stimuli.audioScriptLv)) {
          coreTexts.push(...(task.stimuli.audioScriptLv as string[]));
        }

        if (task.officialOrder === 4) {
          for (const question of task.questions) {
            if (typeof question.textLv === "string") coreTexts.push(question.textLv);
          }
        }

        if (task.officialOrder === 5 && Array.isArray(task.stimuli.ads)) {
          coreTexts.push(...((task.stimuli.ads as Array<{ textLv?: string }>).map((row) => row.textLv ?? "")));
        }

        if (task.officialOrder === 6 && typeof task.stimuli.textLv === "string") {
          coreTexts.push(task.stimuli.textLv);
        }

        if (task.officialOrder === 7 || task.officialOrder === 9 || task.officialOrder === 10) {
          for (const question of task.questions) {
            if (typeof question.promptLv === "string") coreTexts.push(question.promptLv);
            if (typeof question.stemLv === "string") coreTexts.push(question.stemLv);
          }
        }

        if (task.officialOrder === 9 && typeof task.stimuli.scenarioLv === "string") {
          coreTexts.push(task.stimuli.scenarioLv);
        }

        if (task.officialOrder === 11) {
          if (Array.isArray(task.stimuli.images)) {
            coreTexts.push(
              ...(task.stimuli.images as Array<{ descriptionLv?: string }>).map((row) => row.descriptionLv ?? ""),
            );
          }
          if (typeof task.stimuli.personalQuestionLv === "string") {
            coreTexts.push(task.stimuli.personalQuestionLv);
          }
        }

        if (task.officialOrder === 12 && Array.isArray(task.stimuli.ads)) {
          coreTexts.push(...((task.stimuli.ads as Array<{ textLv?: string }>).map((row) => row.textLv ?? "")));
        }

        for (const text of coreTexts) {
          const key = normalize(text);
          if (key.length < 16) continue;
          const seenExamId = firstSeenInExam.get(key);
          if (!seenExamId) {
            firstSeenInExam.set(key, exam.examId);
            continue;
          }
          if (seenExamId === exam.examId) continue;
          expect(seenExamId).toBe(exam.examId);
        }
      }
    }
  });

  it("keeps A2-friendly text lengths", () => {
    const payload = generateVvppA2Exams({ seed: 2026, n: 2 });

    const inspectableTexts: string[] = [];

    for (const exam of payload.exams) {
      for (const section of exam.sections) {
        for (const task of section.tasks) {
          inspectableTexts.push(task.instructionLv);

          if (Array.isArray(task.stimuli.audioScriptLv)) {
            inspectableTexts.push(...(task.stimuli.audioScriptLv as string[]));
          }

          for (const question of task.questions) {
            if (typeof question.promptLv === "string") inspectableTexts.push(question.promptLv);
            if (typeof question.stemLv === "string") inspectableTexts.push(question.stemLv);
            if (typeof question.textLv === "string") inspectableTexts.push(question.textLv);

            if (Array.isArray(question.optionsLv)) {
              inspectableTexts.push(...(question.optionsLv as string[]));
            }
          }
        }
      }
    }

    for (const text of inspectableTexts) {
      const tokenCount = words(text).length;
      if (tokenCount === 0) continue;

      expect(tokenCount).toBeGreaterThanOrEqual(1);
      expect(tokenCount).toBeLessThanOrEqual(18);
    }
  });

  it("keeps template output schema free from LLM-only fields", () => {
    const payload = generateVvppA2Exams({ seed: 2026, n: 1 });
    expect(Object.keys(payload)).toEqual(["generator", "exams"]);
    expect((payload as Record<string, unknown>).llm).toBeUndefined();
    expect((payload as Record<string, unknown>).stats).toBeUndefined();
  });
});
