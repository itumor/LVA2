import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { buildDailyPlan } from "@/lib/daily-plan";
import { prisma } from "@/lib/prisma";

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

export async function getTrainerDataBySkill(skill: "LISTENING" | "READING" | "WRITING" | "SPEAKING") {
  return prisma.taskItem.findMany({
    where: { skill },
    orderBy: { id: "asc" },
  });
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
