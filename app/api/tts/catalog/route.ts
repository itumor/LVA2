import { fail, ok } from "@/lib/http";
import { fetchRaivisModels } from "@/lib/hf-models";

export async function GET() {
  try {
    const models = await fetchRaivisModels();
    return ok({ models });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to fetch catalog", 502, "HF_FETCH_FAILED");
  }
}
