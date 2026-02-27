import { prisma } from "@/lib/prisma";
import { DEFAULT_LEARNER_ID } from "@/lib/constants";

export type TtsLeaderboardRow = {
  modelId: string;
  samples: number;
  avgNaturalness: number;
  avgPronunciation: number;
  avgLatencyMs: number;
  qualityScore: number;
  speedScore: number;
  compositeScore: number;
  lastTestedAt: string;
};

function round(num: number, digits = 2) {
  const p = 10 ** digits;
  return Math.round(num * p) / p;
}

export async function getTtsBenchmarkSummary(learnerId = DEFAULT_LEARNER_ID): Promise<TtsLeaderboardRow[]> {
  const runs = await prisma.ttsBenchmarkRun.findMany({
    where: { learnerId, error: null },
    include: { rating: true },
    orderBy: { createdAt: "desc" },
  });

  const grouped = new Map<string, typeof runs>();
  for (const run of runs) {
    const arr = grouped.get(run.modelId) ?? [];
    arr.push(run);
    grouped.set(run.modelId, arr);
  }

  const latencyValues = runs.map((r) => r.latencyMs ?? 0).filter((n) => n > 0);
  const minLatency = latencyValues.length ? Math.min(...latencyValues) : 1;
  const maxLatency = latencyValues.length ? Math.max(...latencyValues) : 1;

  const results: TtsLeaderboardRow[] = [];

  for (const [modelId, modelRuns] of grouped.entries()) {
    const ratings = modelRuns.map((r) => r.rating).filter((r): r is NonNullable<typeof r> => Boolean(r));
    const samples = modelRuns.length;

    const avgNaturalness = ratings.length
      ? ratings.reduce((sum, r) => sum + r.naturalness, 0) / ratings.length
      : 0;
    const avgPronunciation = ratings.length
      ? ratings.reduce((sum, r) => sum + r.pronunciation, 0) / ratings.length
      : 0;

    const latencies = modelRuns.map((r) => r.latencyMs ?? 0).filter((n) => n > 0);
    const avgLatencyMs = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    const qualityScore = ((avgNaturalness + avgPronunciation) / 2 / 5) * 100;

    let speedScore = 0;
    if (avgLatencyMs > 0) {
      if (maxLatency === minLatency) {
        speedScore = 100;
      } else {
        speedScore = ((maxLatency - avgLatencyMs) / (maxLatency - minLatency)) * 100;
      }
    }

    const compositeScore = 0.8 * qualityScore + 0.2 * speedScore;
    const lastTestedAt = modelRuns[0]?.createdAt.toISOString() ?? new Date(0).toISOString();

    results.push({
      modelId,
      samples,
      avgNaturalness: round(avgNaturalness),
      avgPronunciation: round(avgPronunciation),
      avgLatencyMs: round(avgLatencyMs),
      qualityScore: round(qualityScore),
      speedScore: round(speedScore),
      compositeScore: round(compositeScore),
      lastTestedAt,
    });
  }

  results.sort((a, b) => b.compositeScore - a.compositeScore || a.modelId.localeCompare(b.modelId));
  return results;
}
