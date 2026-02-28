import { fail, ok } from "@/lib/http";
import {
  runVvppA2Generation,
  VvppA2GenerationServiceError,
  type VvppA2GenerationRequest,
} from "@/lib/vvpp-a2-generation-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VvppA2GenerationRequest;
    const result = await runVvppA2Generation(body);
    return ok(result);
  } catch (error) {
    if (error instanceof VvppA2GenerationServiceError) {
      return fail(error.message, error.status, error.code);
    }
    return fail(error instanceof Error ? error.message : "Generation failed", 400, "GENERATION_FAILED");
  }
}
