import { ok } from "@/lib/http";
import { listSttModels } from "@/lib/stt-models";
import { getActiveSttConfig } from "@/lib/stt-config";

export async function GET() {
  const [models, activeConfig] = await Promise.all([listSttModels(), getActiveSttConfig()]);
  return ok({ models, activeConfig });
}
