import { ExamDatasetSelector } from "@/components/ExamDatasetSelector";
import { SpeakingRecorder } from "@/components/SpeakingRecorder";
import { TrainerWorkspace } from "@/components/TrainerWorkspace";
import { getExamDatasetOptions, getTrainerDataBySkill, resolveSelectedExamId } from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ examId?: string }>;
};

export default async function SpeakingTrainerPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const options = await getExamDatasetOptions();
  const selectedExamId = resolveSelectedExamId(options, params.examId);
  const tasks = await getTrainerDataBySkill("SPEAKING", selectedExamId);
  const normalized = tasks.map((task) => ({ ...task, questions: task.questions as Array<Record<string, unknown>> }));

  return (
    <div className="grid">
      <ExamDatasetSelector basePath="/trainer/speaking" selectedExamId={selectedExamId} options={options} />
      <TrainerWorkspace
        title="Speaking Trainer"
        description="Interview, image description (KAS?/KO DARA?/KUR?), and ad-question prompts."
        tasks={normalized}
      />
      <SpeakingRecorder taskId={normalized[0]?.id} />
    </div>
  );
}
