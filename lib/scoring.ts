import { Skill, TaskType } from "@prisma/client";
import { MIN_PASS_PER_SKILL } from "@/lib/constants";
import { buildFailReasonsDetailed } from "@/lib/remediation";
import type { SectionScore } from "@/lib/types";

export type RawAnswers = Record<string, string | boolean | number | string[] | undefined>;
type ScoreComputation = {
  score: number;
  maxScore: number;
  isAutoGraded: boolean;
  isCorrect?: boolean;
};

type QuestionsBlob = Array<Record<string, unknown>>;

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function scoreAutoGradedTask(
  taskType: TaskType,
  questions: QuestionsBlob,
  answers: RawAnswers,
): ScoreComputation {
  if (!["MCQ", "TRUE_FALSE", "FILL_BLANK", "CLOZE", "MATCHING"].includes(taskType)) {
    return { score: 0, maxScore: 0, isAutoGraded: false };
  }

  let correct = 0;

  for (const question of questions) {
    const questionId = String(question.id);

    if (taskType === "MATCHING") {
      const statements = (question.statements as Array<Record<string, unknown>> | undefined) ?? [];
      const situations = (question.situations as Array<Record<string, unknown>> | undefined) ?? [];
      const rows = statements.length > 0 ? statements : situations;

      for (const row of rows) {
        const rowId = String(row.id);
        const expected = normalize(row.answer);
        const provided = normalize(answers[rowId]);
        if (expected && provided && expected === provided) {
          correct += 1;
        }
      }

      continue;
    }

    const expected = normalize(question.correctAnswer);
    const provided = normalize(answers[questionId]);
    if (expected && expected === provided) {
      correct += 1;
    }
  }

  const maxScore = questions.reduce((acc, question) => {
    if (taskType === "MATCHING") {
      const statements = (question.statements as Array<Record<string, unknown>> | undefined) ?? [];
      const situations = (question.situations as Array<Record<string, unknown>> | undefined) ?? [];
      return acc + Math.max(statements.length, situations.length, 1);
    }
    return acc + 1;
  }, 0);

  return {
    score: correct,
    maxScore,
    isAutoGraded: true,
    isCorrect: maxScore > 0 ? correct === maxScore : undefined,
  };
}

export function scoreRubricTask(params: {
  taskType: TaskType;
  points: number;
  answers: RawAnswers;
}): ScoreComputation {
  const { taskType, points, answers } = params;

  if (taskType === "MESSAGE_ADVERT") {
    const checks = Number(answers.rubricChecks ?? 0);
    const wordCount = Number(answers.wordCount ?? 0);
    const score = Math.min(points, checks + (wordCount >= 35 ? 2 : 0));
    return { score, maxScore: points, isAutoGraded: false };
  }

  if (taskType === "PICTURE_SENTENCE") {
    const sentenceChecks = Number(answers.sentenceChecks ?? 0);
    return { score: Math.min(points, sentenceChecks), maxScore: points, isAutoGraded: false };
  }

  if (taskType === "WORD_FORM") {
    const correctForms = Number(answers.correctForms ?? 0);
    return { score: Math.min(points, correctForms), maxScore: points, isAutoGraded: false };
  }

  if (["INTERVIEW", "IMAGE_DESCRIPTION", "AD_QUESTION"].includes(taskType)) {
    const rubricChecks = Number(answers.rubricChecks ?? 0);
    return { score: Math.min(points, rubricChecks), maxScore: points, isAutoGraded: false };
  }

  return { score: 0, maxScore: points, isAutoGraded: false };
}

export function evaluateSectionPass(skill: Skill, score: number): SectionScore {
  return {
    skill,
    score,
    maxScore: 15,
    passed: score >= MIN_PASS_PER_SKILL,
  };
}

export function computeExamOutcome(sectionScores: SectionScore[]) {
  const failed = sectionScores.filter((row) => !row.passed);
  const failReasonsDetailed = buildFailReasonsDetailed({ sectionScores });
  return {
    passAll: failed.length === 0,
    totalScore: sectionScores.reduce((acc, row) => acc + row.score, 0),
    failReasons: failed.map((row) => `${row.skill} is below 9/15`),
    failReasonsDetailed,
  };
}
