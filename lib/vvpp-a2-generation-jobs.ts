import {
  runVvppA2Generation,
  VvppA2GenerationServiceError,
  type VvppA2GenerationRequest,
  type VvppA2GenerationResult,
} from "@/lib/vvpp-a2-generation-service";
import type { VvppA2SmartProgressEvent } from "@/lib/vvpp-a2-smart-generator";

type JobStatus = "queued" | "running" | "completed" | "failed";

type JobPhase = "queued" | "start" | "preflight" | "generating" | "completed" | "failed";

export type VvppA2GenerationJobProgress = {
  phase: JobPhase;
  percent: number;
  totalExams: number;
  completedExams: number;
  llmCount: number;
  fallbackCount: number;
  currentExamId?: string;
};

export type VvppA2GenerationJobSnapshot = {
  jobId: string;
  status: JobStatus;
  progress: VvppA2GenerationJobProgress;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  result?: VvppA2GenerationResult;
  error?: string;
  code?: string;
};

type JobRecord = {
  jobId: string;
  status: JobStatus;
  progress: VvppA2GenerationJobProgress;
  input: VvppA2GenerationRequest;
  createdAt: Date;
  startedAt: Date | null;
  updatedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  result?: VvppA2GenerationResult;
  error?: string;
  code?: string;
};

const FINISHED_JOB_TTL_MS = 30 * 60 * 1000;

const globalJobs = globalThis as typeof globalThis & {
  __vvppA2GenerationJobs?: Map<string, JobRecord>;
};

function getStore(): Map<string, JobRecord> {
  if (!globalJobs.__vvppA2GenerationJobs) {
    globalJobs.__vvppA2GenerationJobs = new Map<string, JobRecord>();
  }
  return globalJobs.__vvppA2GenerationJobs;
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveTotalExams(input: VvppA2GenerationRequest): number {
  const n = sanitizePositiveInt(input.n, 3);
  const extraPracticeVariants = sanitizeNonNegativeInt(input.extraPracticeVariants, 0);
  return n + extraPracticeVariants;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function progressFromEvent(event: VvppA2SmartProgressEvent): VvppA2GenerationJobProgress {
  return {
    phase: event.phase,
    percent: clampPercent(event.percent),
    totalExams: event.totalExams,
    completedExams: event.completedExams,
    llmCount: event.llmCount,
    fallbackCount: event.fallbackCount,
    currentExamId: event.currentExamId,
  };
}

function snapshot(record: JobRecord): VvppA2GenerationJobSnapshot {
  return {
    jobId: record.jobId,
    status: record.status,
    progress: record.progress,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    result: record.result,
    error: record.error,
    code: record.code,
  };
}

function pruneExpiredJobs(now = new Date()) {
  const store = getStore();
  for (const [jobId, record] of store.entries()) {
    if (record.expiresAt && record.expiresAt.getTime() <= now.getTime()) {
      store.delete(jobId);
    }
  }
}

function markFinished(record: JobRecord, status: "completed" | "failed") {
  const now = new Date();
  record.status = status;
  record.updatedAt = now;
  record.completedAt = now;
  record.expiresAt = new Date(now.getTime() + FINISHED_JOB_TTL_MS);
}

async function runJob(jobId: string) {
  const store = getStore();
  const record = store.get(jobId);
  if (!record) return;

  const start = new Date();
  record.status = "running";
  record.startedAt = start;
  record.updatedAt = start;

  try {
    const result = await runVvppA2Generation(record.input, {
      onProgress: async (event) => {
        const current = store.get(jobId);
        if (!current) return;

        current.progress = progressFromEvent(event);
        current.updatedAt = new Date();
      },
    });

    const current = store.get(jobId);
    if (!current) return;

    current.result = result;
    current.progress = {
      ...current.progress,
      phase: "completed",
      percent: 100,
      totalExams: result.diagnostics.stats.total,
      completedExams: result.diagnostics.stats.total,
      llmCount: result.diagnostics.stats.llmCount,
      fallbackCount: result.diagnostics.stats.fallbackCount,
      currentExamId: undefined,
    };

    markFinished(current, "completed");
  } catch (error) {
    const current = store.get(jobId);
    if (!current) return;

    current.error = error instanceof Error ? error.message : "Generation failed";
    current.code =
      error instanceof VvppA2GenerationServiceError
        ? error.code
        : "GENERATION_FAILED";
    current.progress = {
      ...current.progress,
      phase: "failed",
      currentExamId: undefined,
    };

    markFinished(current, "failed");
  }
}

export function createVvppA2GenerationJob(input: VvppA2GenerationRequest): VvppA2GenerationJobSnapshot {
  pruneExpiredJobs();

  const now = new Date();
  const totalExams = resolveTotalExams(input);
  const record: JobRecord = {
    jobId: crypto.randomUUID(),
    status: "queued",
    input,
    progress: {
      phase: "queued",
      percent: 0,
      totalExams,
      completedExams: 0,
      llmCount: 0,
      fallbackCount: 0,
    },
    createdAt: now,
    startedAt: null,
    updatedAt: now,
    completedAt: null,
    expiresAt: null,
  };

  const store = getStore();
  store.set(record.jobId, record);

  queueMicrotask(() => {
    void runJob(record.jobId);
  });

  return snapshot(record);
}

export function getVvppA2GenerationJob(jobId: string): VvppA2GenerationJobSnapshot | null {
  pruneExpiredJobs();

  const record = getStore().get(jobId);
  if (!record) return null;

  return snapshot(record);
}

export function __resetVvppA2GenerationJobsForTests() {
  getStore().clear();
}
