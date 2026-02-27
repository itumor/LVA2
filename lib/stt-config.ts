import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type SttProvider = "browser" | "whisper-ct2" | "whisper-transformers" | "whisper-cpp";

export type ActiveSttConfig = {
  provider: SttProvider;
  modelId: string;
  updatedAt?: string;
};

export async function getActiveSttConfig(learnerId = DEFAULT_LEARNER_ID): Promise<ActiveSttConfig | null> {
  try {
    const cfg = await prisma.learnerSttConfig.findUnique({ where: { learnerId } });
    if (!cfg) return null;
    return {
      provider: cfg.provider as SttProvider,
      modelId: cfg.modelId,
      updatedAt: cfg.updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function upsertActiveSttConfig(params: {
  learnerId?: string;
  provider: SttProvider;
  modelId: string;
}) {
  const learnerId = params.learnerId ?? DEFAULT_LEARNER_ID;
  const cfg = await prisma.learnerSttConfig.upsert({
    where: { learnerId },
    update: { provider: params.provider, modelId: params.modelId },
    create: { learnerId, provider: params.provider, modelId: params.modelId },
  });
  return {
    provider: cfg.provider as SttProvider,
    modelId: cfg.modelId,
    updatedAt: cfg.updatedAt.toISOString(),
  };
}
