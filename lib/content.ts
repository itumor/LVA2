import { Skill, TaskType } from "@prisma/client";
import { prisma } from "./prisma";
import type { TaskSeedInput } from "./content-schema";
import { taskSeedCollectionSchema } from "./content-schema";

function sortByOfficialOrder<T extends { id: string; metadata: unknown }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = Number((a.metadata as Record<string, unknown>)?.officialOrder ?? Number.MAX_SAFE_INTEGER);
    const right = Number((b.metadata as Record<string, unknown>)?.officialOrder ?? Number.MAX_SAFE_INTEGER);
    return left - right || a.id.localeCompare(b.id);
  });
}

export function mapSkill(value: TaskSeedInput["skill"]): Skill {
  return value.toUpperCase() as Skill;
}

export function mapTaskType(value: TaskSeedInput["taskType"]): TaskType {
  return value.toUpperCase() as TaskType;
}

export function parseSeedData(raw: unknown): TaskSeedInput[] {
  return taskSeedCollectionSchema.parse(raw);
}

export async function getTasks(filters: {
  skill?: string;
  topic?: string;
  type?: string;
}) {
  const tasks = await prisma.taskItem.findMany({
    where: {
      skill: filters.skill ? (filters.skill.toUpperCase() as Skill) : undefined,
      topic: filters.topic,
      taskType: filters.type ? (filters.type.toUpperCase() as TaskType) : undefined,
    },
    orderBy: [{ skill: "asc" }, { id: "asc" }],
  });
  return sortByOfficialOrder(tasks);
}

export async function getTasksBySkill(skill: Skill) {
  const tasks = await prisma.taskItem.findMany({
    where: { skill },
    orderBy: { id: "asc" },
  });
  return sortByOfficialOrder(tasks);
}
