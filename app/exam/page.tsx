import { ExamRunner } from "@/components/ExamRunner";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ExamPage() {
  const tasks = await prisma.taskItem.findMany({
    orderBy: [{ skill: "asc" }, { id: "asc" }],
  });

  const normalized = tasks
    .map((task) => ({
      ...task,
      questions: task.questions as Array<Record<string, unknown>>,
      officialOrder:
        typeof (task.metadata as Record<string, unknown>)?.officialOrder === "number"
          ? Number((task.metadata as Record<string, unknown>).officialOrder)
          : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.officialOrder - b.officialOrder || a.id.localeCompare(b.id));

  const tasksBySkill = normalized.reduce<Record<string, typeof normalized>>((acc, task) => {
    acc[task.skill] = [...(acc[task.skill] ?? []), task];
    return acc;
  }, {});

  return <ExamRunner tasksBySkill={tasksBySkill} />;
}
