import { TrainerWorkspace } from "@/components/TrainerWorkspace";
import { getTrainerDataBySkill } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WritingTrainerPage() {
  const tasks = await getTrainerDataBySkill("WRITING");
  const normalized = tasks.map((task) => ({ ...task, questions: task.questions as Array<Record<string, unknown>> }));

  return (
    <TrainerWorkspace
      title="Writing Trainer"
      description="Picture sentences, word forms, and 35-word message planning with rubric checkpoints."
      tasks={normalized}
    />
  );
}
