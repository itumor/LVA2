import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type ActiveTtsConfig = {
  provider: "piper" | "f5";
  modelId: string;
  rate: number;
  updatedAt?: string;
};

export async function getActiveTtsConfig(learnerId = DEFAULT_LEARNER_ID): Promise<ActiveTtsConfig | null> {
  try {
    const config = await prisma.learnerTtsConfig.findUnique({ where: { learnerId } });
    if (!config) return null;
    return {
      provider: config.provider === "f5" ? "f5" : "piper",
      modelId: config.modelId,
      rate: config.rate,
      updatedAt: config.updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function upsertActiveTtsConfig(params: {
  learnerId?: string;
  provider: "piper" | "f5";
  modelId: string;
  rate: number;
}) {
  const learnerId = params.learnerId ?? DEFAULT_LEARNER_ID;
  const record = await prisma.learnerTtsConfig.upsert({
    where: { learnerId },
    update: { provider: params.provider, modelId: params.modelId, rate: params.rate },
    create: { learnerId, provider: params.provider, modelId: params.modelId, rate: params.rate },
  });

  return {
    provider: record.provider === "f5" ? "f5" : "piper",
    modelId: record.modelId,
    rate: record.rate,
    updatedAt: record.updatedAt.toISOString(),
  };
}
