import { ExamDatasetSelector } from "@/components/ExamDatasetSelector";
import { SpeakingRecorder } from "@/components/SpeakingRecorder";
import { TrainerWorkspace } from "@/components/TrainerWorkspace";
import { getExamDatasetOptions, getTrainerDataBySkill, resolveSelectedExamId } from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ examId?: string }>;
};

export default async function ListeningTrainerPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const options = await getExamDatasetOptions();
  const selectedExamId = resolveSelectedExamId(options, params.examId);
  const tasks = await getTrainerDataBySkill("LISTENING", selectedExamId);
  const normalized = tasks.map((task) => ({ ...task, questions: task.questions as Array<Record<string, unknown>> }));

  return (
    <div className="grid">
      <ExamDatasetSelector basePath="/trainer/listening" selectedExamId={selectedExamId} options={options} />
      <TrainerWorkspace
        title="Listening Trainer"
        description="Three exam-faithful listening task types with replay control and transcript reveal."
        tasks={normalized}
      />
      <SpeakingRecorder taskId={normalized[0]?.id} />
    </div>
  );
}
