import { TrainerWorkspace } from "@/components/TrainerWorkspace";
import { getTrainerDataBySkill } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ListeningTrainerPage() {
  const tasks = await getTrainerDataBySkill("LISTENING");
  const normalized = tasks.map((task) => ({ ...task, questions: task.questions as Array<Record<string, unknown>> }));

  return (
    <TrainerWorkspace
      title="Listening Trainer"
      description="Three exam-faithful listening task types with replay control and transcript reveal."
      tasks={normalized}
    />
  );
}
