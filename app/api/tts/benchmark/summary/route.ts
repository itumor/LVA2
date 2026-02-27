import { ok } from "@/lib/http";
import { getTtsBenchmarkSummary } from "@/lib/tts-benchmark";

export async function GET() {
  const rows = await getTtsBenchmarkSummary();
  return ok({ rows });
}
