import { ExamDatasetSelector } from "@/components/ExamDatasetSelector";
import { ExamRunner } from "@/components/ExamRunner";
import {
  getExamDatasetOptions,
  getExamTasksByDataset,
  resolveSelectedExamId,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ examId?: string }>;
};

export default async function ExamPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const options = await getExamDatasetOptions();
  const selectedExamId = resolveSelectedExamId(options, params.examId);
  const tasks = await getExamTasksByDataset(selectedExamId);

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

  return (
    <div className="grid">
      <ExamDatasetSelector basePath="/exam" selectedExamId={selectedExamId} options={options} />
      <ExamRunner tasksBySkill={tasksBySkill} />
    </div>
  );
}
