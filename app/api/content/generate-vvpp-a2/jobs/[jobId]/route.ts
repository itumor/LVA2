import { fail, ok } from "@/lib/http";
import { getVvppA2GenerationJob } from "@/lib/vvpp-a2-generation-jobs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const snapshot = getVvppA2GenerationJob(jobId);

    if (!snapshot) {
      return fail("Generation job not found", 404, "JOB_NOT_FOUND");
    }

    return ok(snapshot);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load generation job", 400, "JOB_STATUS_FAILED");
  }
}
