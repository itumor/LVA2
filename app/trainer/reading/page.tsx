import { SpeakingRecorder } from "@/components/SpeakingRecorder";
import { TrainerWorkspace } from "@/components/TrainerWorkspace";
import { getTrainerDataBySkill } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReadingTrainerPage() {
  const tasks = await getTrainerDataBySkill("READING");
  const normalized = tasks.map((task) => ({ ...task, questions: task.questions as Array<Record<string, unknown>> }));

  return (
    <div className="grid">
      <TrainerWorkspace
        title="Reading Trainer"
        description="Short text statements, ad matching, and cloze practice with evidence-first habits."
        tasks={normalized}
      />
      <SpeakingRecorder taskId={normalized[0]?.id} />
    </div>
  );
}
