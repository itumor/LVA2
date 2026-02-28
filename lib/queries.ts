import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { buildDailyPlan } from "@/lib/daily-plan";
import { prisma } from "@/lib/prisma";
import { Skill } from "@prisma/client";

export const DEFAULT_EXAM_DATASET_ID = "seed-default";

export type ExamDatasetOption = {
  examId: string;
  versionLabel: string;
  taskCount: number;
  hasGeneratedMetadata: boolean;
};

function readExamId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).examId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readVersionLabel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).versionLabel;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function pickDefaultExamId(options: ExamDatasetOption[]): string {
  const generated = options.filter((row) => row.hasGeneratedMetadata);
  if (generated.length > 0) {
    return [...generated].sort((a, b) => b.examId.localeCompare(a.examId))[0].examId;
  }
  return options[0]?.examId ?? DEFAULT_EXAM_DATASET_ID;
}

export function resolveSelectedExamId(options: ExamDatasetOption[], requestedExamId?: string): string {
  if (requestedExamId && options.some((row) => row.examId === requestedExamId)) {
    return requestedExamId;
  }
  return pickDefaultExamId(options);
}

export async function getExamDatasetOptions(): Promise<ExamDatasetOption[]> {
  const tasks = await prisma.taskItem.findMany({
    select: {
      id: true,
      metadata: true,
    },
    orderBy: { id: "asc" },
  });

  const map = new Map<string, ExamDatasetOption>();

  for (const task of tasks) {
    const examId = readExamId(task.metadata) ?? DEFAULT_EXAM_DATASET_ID;
    const versionLabel = readVersionLabel(task.metadata) ?? "Seed Default";
    const hasGeneratedMetadata = examId !== DEFAULT_EXAM_DATASET_ID;
    const prev = map.get(examId);

    if (prev) {
      prev.taskCount += 1;
      if (prev.versionLabel === "Seed Default" && versionLabel !== "Seed Default") {
        prev.versionLabel = versionLabel;
      }
      continue;
    }

    map.set(examId, {
      examId,
      versionLabel,
      taskCount: 1,
      hasGeneratedMetadata,
    });
  }

  return [...map.values()].sort((a, b) => {
    if (a.hasGeneratedMetadata !== b.hasGeneratedMetadata) {
      return a.hasGeneratedMetadata ? -1 : 1;
    }
    return b.examId.localeCompare(a.examId);
  });
}

export async function getExamTasksByDataset(examId: string) {
  const tasks = await prisma.taskItem.findMany({
    orderBy: [{ skill: "asc" }, { id: "asc" }],
  });

  if (examId === DEFAULT_EXAM_DATASET_ID) {
    return tasks.filter((task) => !readExamId(task.metadata));
  }

  return tasks.filter((task) => readExamId(task.metadata) === examId);
}

export async function getDashboardSnapshot() {
  const [attempts, recentSessions, dailyPlan] = await Promise.all([
    prisma.taskAttempt.findMany({
      where: { learnerId: DEFAULT_LEARNER_ID },
      include: { task: true },
      orderBy: { submittedAt: "desc" },
      take: 80,
    }),
    prisma.examSession.findMany({
      where: { learnerId: DEFAULT_LEARNER_ID, isFinished: true },
      orderBy: { endedAt: "desc" },
      take: 5,
      include: { sectionResults: true },
    }),
    buildDailyPlan(DEFAULT_LEARNER_ID),
  ]);

  const totals = attempts.reduce(
    (acc, row) => {
      acc.score += row.score;
      acc.max += row.maxScore;
      return acc;
    },
    { score: 0, max: 0 },
  );

  const accuracy = totals.max > 0 ? Number(((totals.score / totals.max) * 100).toFixed(1)) : 0;

  const topicWeakness = new Map<string, { score: number; max: number }>();
  for (const row of attempts) {
    const entry = topicWeakness.get(row.task.topic) ?? { score: 0, max: 0 };
    entry.score += row.score;
    entry.max += row.maxScore;
    topicWeakness.set(row.task.topic, entry);
  }

  const weakest = [...topicWeakness.entries()]
    .map(([topic, value]) => ({
      topic,
      accuracy: value.max > 0 ? (value.score / value.max) * 100 : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  return {
    accuracy,
    attemptsCount: attempts.length,
    recentSessions,
    dailyPlan,
    weakest,
  };
}

export async function getTrainerDataBySkill(
  skill: "LISTENING" | "READING" | "WRITING" | "SPEAKING",
  examId?: string,
) {
  const tasks = await prisma.taskItem.findMany({
    where: { skill: skill as Skill },
    orderBy: { id: "asc" },
  });

  if (!examId) return tasks;
  if (examId === DEFAULT_EXAM_DATASET_ID) {
    return tasks.filter((task) => !readExamId(task.metadata));
  }

  return tasks.filter((task) => readExamId(task.metadata) === examId);
}

export async function getReviewCards() {
  return prisma.reviewCard.findMany({
    where: { learnerId: DEFAULT_LEARNER_ID },
    include: { task: true },
    orderBy: [{ dueDate: "asc" }, { weaknessScore: "desc" }],
    take: 40,
  });
}

export async function getAnalyticsSnapshot() {
  const [attempts, sectionResults] = await Promise.all([
    prisma.taskAttempt.findMany({
      where: { learnerId: DEFAULT_LEARNER_ID },
      include: { task: true },
      orderBy: { submittedAt: "desc" },
      take: 200,
    }),
    prisma.sectionResult.findMany({
      where: { learnerId: DEFAULT_LEARNER_ID },
      orderBy: { submittedAt: "desc" },
      take: 40,
    }),
  ]);

  const byTask = new Map<string, { total: number; score: number; count: number }>();
  for (const row of attempts) {
    const key = `${row.skill}:${row.taskType}`;
    const prev = byTask.get(key) ?? { total: 0, score: 0, count: 0 };
    prev.total += row.maxScore;
    prev.score += row.score;
    prev.count += 1;
    byTask.set(key, prev);
  }

  return {
    attempts,
    sectionResults,
    byTask: [...byTask.entries()].map(([key, value]) => ({
      key,
      accuracy: value.total > 0 ? Number(((value.score / value.total) * 100).toFixed(1)) : 0,
      count: value.count,
    })),
  };
}
