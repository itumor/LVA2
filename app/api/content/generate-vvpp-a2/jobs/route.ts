import { fail, ok } from "@/lib/http";
import {
  createVvppA2GenerationJob,
} from "@/lib/vvpp-a2-generation-jobs";
import type { VvppA2GenerationRequest } from "@/lib/vvpp-a2-generation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VvppA2GenerationRequest;
    const snapshot = createVvppA2GenerationJob(body);
    return ok(snapshot, { status: 202 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to start generation job", 400, "JOB_CREATE_FAILED");
  }
}
