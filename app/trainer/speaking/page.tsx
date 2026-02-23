import { SpeakingRecorder } from "@/components/SpeakingRecorder";
import { TrainerWorkspace } from "@/components/TrainerWorkspace";
import { getTrainerDataBySkill } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SpeakingTrainerPage() {
  const tasks = await getTrainerDataBySkill("SPEAKING");
  const normalized = tasks.map((task) => ({ ...task, questions: task.questions as Array<Record<string, unknown>> }));

  return (
    <div className="grid">
      <TrainerWorkspace
        title="Speaking Trainer"
        description="Interview, image description (KAS?/KO DARA?/KUR?), and ad-question prompts."
        tasks={normalized}
      />
      <SpeakingRecorder taskId={normalized[0]?.id} />
    </div>
  );
}
