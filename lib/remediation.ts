import { MIN_PASS_PER_SKILL } from "@/lib/constants";
import type { FailReasonDetailed, RemediationItem, SectionRemediation } from "@/lib/types";
import type { Skill, TaskType } from "@prisma/client";

type AttemptForRemediation = {
  score: number;
  maxScore: number;
  task: {
    id: string;
    skill: Skill;
    taskType: TaskType;
    topic: string;
  };
};

type TaskCandidate = {
  id: string;
  skill: Skill;
  taskType: TaskType;
  topic: string;
};

function accuracy(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return score / maxScore;
}

function weakestEntries(entries: Map<string, { score: number; max: number }>, threshold: number, limit: number) {
  return [...entries.entries()]
    .map(([key, value]) => ({
      key,
      accuracy: accuracy(value.score, value.max),
    }))
    .filter((entry) => entry.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
    .map((entry) => entry.key);
}

export function buildSectionRemediation(params: {
  skill: Skill;
  attempts: AttemptForRemediation[];
  candidateTasks: TaskCandidate[];
}): SectionRemediation {
  const { skill, attempts, candidateTasks } = params;

  const typeScores = new Map<string, { score: number; max: number }>();
  const topicScores = new Map<string, { score: number; max: number }>();

  for (const attempt of attempts) {
    const typeKey = attempt.task.taskType;
    const topicKey = attempt.task.topic;

    const typeRow = typeScores.get(typeKey) ?? { score: 0, max: 0 };
    typeRow.score += attempt.score;
    typeRow.max += attempt.maxScore;
    typeScores.set(typeKey, typeRow);

    const topicRow = topicScores.get(topicKey) ?? { score: 0, max: 0 };
    topicRow.score += attempt.score;
    topicRow.max += attempt.maxScore;
    topicScores.set(topicKey, topicRow);
  }

  const weakTaskTypes = weakestEntries(typeScores, 0.75, 3) as TaskType[];
  const weakTopics = weakestEntries(topicScores, 0.75, 4);

  const weakAttempts = attempts
    .map((attempt) => ({
      attempt,
      accuracy: accuracy(attempt.score, attempt.maxScore),
    }))
    .filter((entry) => entry.accuracy < 0.75)
    .sort((a, b) => a.accuracy - b.accuracy);

  const recommendedTaskIds: string[] = [];
  for (const entry of weakAttempts) {
    if (!recommendedTaskIds.includes(entry.attempt.task.id)) {
      recommendedTaskIds.push(entry.attempt.task.id);
    }
    if (recommendedTaskIds.length >= 6) break;
  }

  if (recommendedTaskIds.length < 6) {
    const backups = candidateTasks
      .filter((task) => task.skill === skill)
      .filter(
        (task) =>
          weakTaskTypes.includes(task.taskType) ||
          weakTopics.includes(task.topic) ||
          weakTaskTypes.length === 0,
      )
      .map((task) => task.id);

    for (const taskId of backups) {
      if (!recommendedTaskIds.includes(taskId)) {
        recommendedTaskIds.push(taskId);
      }
      if (recommendedTaskIds.length >= 6) break;
    }
  }

  const items: RemediationItem[] = recommendedTaskIds.map((taskId) => {
    const task = candidateTasks.find((row) => row.id === taskId);
    return {
      skill,
      taskId,
      taskType: task?.taskType ?? weakTaskTypes[0] ?? "MCQ",
      topic: task?.topic ?? weakTopics[0] ?? "general",
      reason:
        weakTaskTypes.length > 0
          ? `Low accuracy in ${weakTaskTypes[0].toLowerCase()}`
          : "Reinforce this section before the next simulation",
      action: `Practice task ${taskId} now`,
    };
  });

  return {
    weakTaskTypes,
    weakTopics,
    recommendedTaskIds,
    items,
  };
}

export function buildFailReasonsDetailed(params: {
  sectionScores: Array<{ skill: Skill; score: number; maxScore: number; passed: boolean }>;
}): FailReasonDetailed[] {
  return params.sectionScores
    .filter((row) => !row.passed)
    .map((row) => {
      const shortfall = Number((MIN_PASS_PER_SKILL - row.score).toFixed(2));
      return {
        skill: row.skill,
        requiredScore: MIN_PASS_PER_SKILL,
        actualScore: row.score,
        maxScore: row.maxScore,
        shortfall,
        criterion: `Per-skill pass threshold is ${MIN_PASS_PER_SKILL}/${row.maxScore}`,
        explanation: `${row.skill} is short by ${shortfall} point${shortfall === 1 ? "" : "s"}. Raise task accuracy in this section and retry.`,
      };
    });
}
