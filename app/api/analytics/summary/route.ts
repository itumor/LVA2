import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const bySkill = await prisma.taskAttempt.groupBy({
      by: ["skill"],
      where: { learnerId: DEFAULT_LEARNER_ID },
      _avg: {
        score: true,
        maxScore: true,
      },
      _count: {
        _all: true,
      },
    });

    const byTaskType = await prisma.taskAttempt.groupBy({
      by: ["taskType"],
      where: { learnerId: DEFAULT_LEARNER_ID },
      _avg: {
        score: true,
        maxScore: true,
      },
      _count: {
        _all: true,
      },
    });

    const weakTopics = await prisma.taskAttempt.findMany({
      where: {
        learnerId: DEFAULT_LEARNER_ID,
      },
      include: {
        task: true,
      },
      orderBy: {
        submittedAt: "desc",
      },
      take: 200,
    });

    const topicMap = new Map<string, { total: number; score: number }>();
    for (const attempt of weakTopics) {
      const entry = topicMap.get(attempt.task.topic) ?? { total: 0, score: 0 };
      entry.total += attempt.maxScore;
      entry.score += attempt.score;
      topicMap.set(attempt.task.topic, entry);
    }

    const topicRanking = [...topicMap.entries()]
      .map(([topic, value]) => ({
        topic,
        accuracy: value.total > 0 ? Number(((value.score / value.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6);

    return ok({ bySkill, byTaskType, topicRanking });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load analytics");
  }
}
