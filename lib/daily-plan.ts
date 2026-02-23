import { AttemptSource, Skill } from "@prisma/client";
import { addDays, isBefore, startOfDay } from "date-fns";
import { SPACED_INTERVALS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { DailyPlanItem } from "@/lib/types";

export function computeNextInterval(lastGrade: number, repetitions: number) {
  if (lastGrade < 3) {
    return SPACED_INTERVALS[0];
  }

  const next = SPACED_INTERVALS[Math.min(repetitions, SPACED_INTERVALS.length - 1)];
  return next;
}

export async function upsertReviewCardFromAttempt(params: {
  learnerId: string;
  taskId: string;
  isCorrect: boolean;
  weaknessDelta?: number;
}) {
  const now = new Date();
  const existing = await prisma.reviewCard.findUnique({
    where: {
      learnerId_taskId: {
        learnerId: params.learnerId,
        taskId: params.taskId,
      },
    },
  });

  if (!existing) {
    return prisma.reviewCard.create({
      data: {
        learnerId: params.learnerId,
        taskId: params.taskId,
        dueDate: addDays(now, params.isCorrect ? 3 : 1),
        status: params.isCorrect ? "LEARNING" : "NEW",
        weaknessScore: params.isCorrect ? 0.6 : 1,
      },
    });
  }

  const repetitions = params.isCorrect ? existing.repetitions + 1 : 0;
  const intervalDays = params.isCorrect
    ? computeNextInterval(4, repetitions)
    : SPACED_INTERVALS[0];

  return prisma.reviewCard.update({
    where: { id: existing.id },
    data: {
      repetitions,
      intervalDays,
      dueDate: addDays(now, intervalDays),
      lastResult: params.isCorrect ? 4 : 1,
      status: params.isCorrect ? "REVIEW" : "LEARNING",
      weaknessScore: params.isCorrect
        ? Math.max(0.2, existing.weaknessScore - 0.2)
        : Math.min(2, existing.weaknessScore + (params.weaknessDelta ?? 0.35)),
    },
  });
}

export async function gradeReviewCard(params: {
  cardId: string;
  learnerId: string;
  grade: number;
}) {
  const card = await prisma.reviewCard.findFirst({
    where: { id: params.cardId, learnerId: params.learnerId },
  });

  if (!card) {
    throw new Error("Review card not found");
  }

  const grade = Math.max(0, Math.min(5, params.grade));
  const repetitions = grade >= 3 ? card.repetitions + 1 : 0;
  const intervalDays = computeNextInterval(grade, repetitions);

  return prisma.reviewCard.update({
    where: { id: params.cardId },
    data: {
      repetitions,
      intervalDays,
      dueDate: addDays(new Date(), intervalDays),
      lastResult: grade,
      status: grade >= 4 ? "MASTERED" : grade >= 3 ? "REVIEW" : "LEARNING",
      weaknessScore: grade >= 3 ? Math.max(0.2, card.weaknessScore - 0.25) : Math.min(2, card.weaknessScore + 0.4),
    },
  });
}

export async function buildDailyPlan(learnerId: string) {
  const today = startOfDay(new Date());

  const dueCards = await prisma.reviewCard.findMany({
    where: {
      learnerId,
      dueDate: { lte: today },
    },
    include: { task: true },
    orderBy: [{ weaknessScore: "desc" }, { dueDate: "asc" }],
    take: 10,
  });

  const attempts = await prisma.taskAttempt.groupBy({
    by: ["skill", "taskType"],
    where: {
      learnerId,
      source: { in: [AttemptSource.TRAINER, AttemptSource.EXAM] },
    },
    _avg: { score: true, maxScore: true },
    _count: { _all: true },
  });

  const weaknessRanking = attempts
    .map((row) => {
      const score = row._avg.score ?? 0;
      const max = row._avg.maxScore ?? 1;
      return {
        skill: row.skill,
        taskType: row.taskType,
        weakness: 1 - score / max,
      };
    })
    .sort((a, b) => b.weakness - a.weakness);

  const weaknessTargets = await Promise.all(
    weaknessRanking.slice(0, 3).map((row) =>
      prisma.taskItem.findFirst({
        where: {
          skill: row.skill,
          taskType: row.taskType,
        },
      }),
    ),
  );

  const mixedTargets = await prisma.taskItem.findMany({
    where: {
      skill: { in: [Skill.LISTENING, Skill.READING, Skill.SPEAKING] },
    },
    take: 3,
    orderBy: { updatedAt: "desc" },
  });

  const items: DailyPlanItem[] = [];

  for (const card of dueCards.slice(0, 5)) {
    items.push({
      id: `review-${card.id}`,
      kind: "review",
      taskId: card.task.id,
      skill: card.task.skill,
      taskType: card.task.taskType,
      topic: card.task.topic,
    });
  }

  for (const task of weaknessTargets.filter(Boolean)) {
    items.push({
      id: `weak-${task!.id}`,
      kind: "weakness",
      taskId: task!.id,
      skill: task!.skill,
      taskType: task!.taskType,
      topic: task!.topic,
    });
  }

  for (const task of mixedTargets) {
    items.push({
      id: `mixed-${task.id}`,
      kind: "mixed",
      taskId: task.id,
      skill: task.skill,
      taskType: task.taskType,
      topic: task.topic,
    });
  }

  const capped = items.slice(0, 10);

  await prisma.dailyPlanLog.upsert({
    where: {
      learnerId_planDate: {
        learnerId,
        planDate: today,
      },
    },
    update: {
      plannedItems: capped as unknown as object,
    },
    create: {
      learnerId,
      planDate: today,
      plannedItems: capped as unknown as object,
    },
  });

  return capped;
}

export function isCardDue(dueDate: Date) {
  return isBefore(dueDate, addDays(new Date(), 1));
}
