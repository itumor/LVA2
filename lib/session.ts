import {
  AttemptSource,
  ExamStrictness,
  SectionStatus,
  SessionMode,
  Skill,
  TaskType,
} from "@prisma/client";
import {
  DEFAULT_LEARNER_ID,
  EXAM_SECTION_ORDER,
  MAX_POINTS_PER_SKILL,
  SECTION_DURATIONS_MINUTES,
} from "@/lib/constants";
import { upsertReviewCardFromAttempt } from "@/lib/daily-plan";
import { prisma } from "@/lib/prisma";
import { buildFailReasonsDetailed, buildSectionRemediation } from "@/lib/remediation";
import { computeExamOutcome, evaluateSectionPass, scoreAutoGradedTask, scoreRubricTask } from "@/lib/scoring";
import type { RawAnswers } from "@/lib/scoring";
import type { RuleViolationCode, SectionRemediation } from "@/lib/types";

const AUTO_GRADED_TYPES: TaskType[] = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "CLOZE"];
const LISTENING_REPLAY_LIMIT = 2;

type SectionEntry = { order: number; status: SectionStatus };
type SectionStateMap = Record<Skill, SectionEntry>;
type SessionRuntimeState = {
  sections: SectionStateMap;
  listeningPlays: Record<string, number>;
};
type SectionDeadlineMap = Partial<Record<Skill, string>>;

export class SessionRuleError extends Error {
  status: number;
  code: RuleViolationCode;

  constructor(code: RuleViolationCode, message?: string, status = 400) {
    super(message ?? code);
    this.name = "SessionRuleError";
    this.code = code;
    this.status = status;
  }
}

function createInitialSectionState(): SectionStateMap {
  return Object.fromEntries(
    EXAM_SECTION_ORDER.map((skill, index) => [
      skill,
      {
        order: index + 1,
        status: index === 0 ? SectionStatus.IN_PROGRESS : SectionStatus.NOT_STARTED,
      },
    ]),
  ) as SectionStateMap;
}

function parseSectionRuntime(raw: unknown): SessionRuntimeState {
  const fallback = {
    sections: createInitialSectionState(),
    listeningPlays: {},
  };

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const value = raw as Record<string, unknown>;
  const hasWrappedSections = typeof value.sections === "object" && value.sections !== null;

  const sectionsSource = hasWrappedSections
    ? (value.sections as Record<string, unknown>)
    : (value as Record<string, unknown>);

  const sections = { ...createInitialSectionState() };
  for (const skill of EXAM_SECTION_ORDER) {
    const row = sectionsSource[skill] as { order?: number; status?: SectionStatus } | undefined;
    if (!row || typeof row !== "object") continue;
    sections[skill] = {
      order: typeof row.order === "number" ? row.order : sections[skill].order,
      status:
        row.status && Object.values(SectionStatus).includes(row.status)
          ? row.status
          : sections[skill].status,
    };
  }

  const listeningPlays =
    hasWrappedSections && typeof value.listeningPlays === "object" && value.listeningPlays !== null
      ? Object.fromEntries(
          Object.entries(value.listeningPlays as Record<string, unknown>).map(([taskId, playCount]) => [
            taskId,
            Number(playCount) || 0,
          ]),
        )
      : {};

  return { sections, listeningPlays };
}

function parseSectionDeadlines(raw: unknown): SectionDeadlineMap {
  if (!raw || typeof raw !== "object") return {};
  const result: SectionDeadlineMap = {};

  for (const skill of EXAM_SECTION_ORDER) {
    const value = (raw as Record<string, unknown>)[skill];
    if (typeof value === "string") {
      result[skill] = value;
    }
  }

  return result;
}

function computeSectionDeadlines(startedAt: Date): SectionDeadlineMap {
  let cumulativeMs = 0;
  const entries = EXAM_SECTION_ORDER.map((skill) => {
    cumulativeMs += SECTION_DURATIONS_MINUTES[skill] * 60 * 1000;
    return [skill, new Date(startedAt.getTime() + cumulativeMs).toISOString()];
  });

  return Object.fromEntries(entries) as SectionDeadlineMap;
}

function isDeadlineExpired(deadline: string | undefined, now = new Date()): boolean {
  if (!deadline) return false;
  return now.getTime() > new Date(deadline).getTime();
}

async function markSectionExpiredIfNeeded(session: {
  id: string;
  mode: SessionMode;
  currentSection: Skill | null;
  sectionStates: unknown;
  sectionDeadlines: unknown;
}) {
  if (session.mode !== SessionMode.EXAM || !session.currentSection) {
    return { runtime: parseSectionRuntime(session.sectionStates), expired: false };
  }

  const runtime = parseSectionRuntime(session.sectionStates);
  const deadlines = parseSectionDeadlines(session.sectionDeadlines);
  const deadline = deadlines[session.currentSection];
  const expired = isDeadlineExpired(deadline);

  if (!expired) {
    return { runtime, expired: false };
  }

  const section = runtime.sections[session.currentSection];
  if (section.status === SectionStatus.IN_PROGRESS) {
    runtime.sections[session.currentSection] = {
      ...section,
      status: SectionStatus.EXPIRED,
    };

    await prisma.examSession.update({
      where: { id: session.id },
      data: {
        sectionStates: runtime as unknown as object,
      },
    });
  }

  return { runtime, expired: true };
}

function evaluateEvidenceFeedback(taskType: TaskType, answers: RawAnswers) {
  if (taskType !== "MATCHING") return null;

  const rows = Object.keys(answers)
    .filter((key) => key.startsWith("evidence::"))
    .map((key) => {
      const rowId = key.replace("evidence::", "");
      return {
        rowId,
        selectedEvidence: String(answers[key] ?? ""),
        selectedAnswer: String(answers[rowId] ?? ""),
      };
    });

  if (rows.length === 0) return null;

  const mismatches = rows.filter(
    (row) => row.selectedEvidence && row.selectedAnswer && row.selectedEvidence !== row.selectedAnswer,
  );

  return {
    rows,
    mismatches,
    consistent: mismatches.length === 0,
  };
}

async function loadSessionOrThrow(sessionId: string) {
  const session = await prisma.examSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new Error("Session not found");
  }
  return session;
}

export async function ensureDefaultLearner() {
  return prisma.learnerProfile.upsert({
    where: { id: DEFAULT_LEARNER_ID },
    update: {},
    create: {
      id: DEFAULT_LEARNER_ID,
      displayName: "Local Learner",
      preferredLanguage: "lv",
    },
  });
}

function resolveStrictness(mode: SessionMode, strictness?: ExamStrictness): ExamStrictness {
  if (strictness) return strictness;
  return mode === SessionMode.EXAM ? ExamStrictness.OFFICIAL : ExamStrictness.PRACTICE;
}

export async function startSession(
  mode: SessionMode,
  strictness?: ExamStrictness,
  learnerId = DEFAULT_LEARNER_ID,
) {
  await ensureDefaultLearner();

  const resolvedStrictness = resolveStrictness(mode, strictness);
  const startedAt = new Date();
  const sectionDeadlines = mode === SessionMode.EXAM ? computeSectionDeadlines(startedAt) : {};
  const sectionStates = mode === SessionMode.EXAM ? parseSectionRuntime(null) : null;

  return prisma.examSession.create({
    data: {
      learnerId,
      mode,
      strictness: resolvedStrictness,
      startedAt,
      currentSection: mode === SessionMode.EXAM ? EXAM_SECTION_ORDER[0] : null,
      sectionStates: sectionStates as unknown as object,
      sectionDeadlines: sectionDeadlines as unknown as object,
    },
  });
}

export async function submitAnswer(params: {
  sessionId: string;
  taskId: string;
  answers: RawAnswers;
  confidence?: number;
  source?: AttemptSource;
}) {
  const task = await prisma.taskItem.findUnique({ where: { id: params.taskId } });
  if (!task) {
    throw new Error("Task not found");
  }

  const session = await loadSessionOrThrow(params.sessionId);

  if (session.mode === SessionMode.EXAM) {
    if (session.currentSection !== task.skill) {
      throw new SessionRuleError(
        "INVALID_SECTION_TASK",
        `Task ${task.id} does not belong to active section ${session.currentSection}`,
        400,
      );
    }

    const { runtime, expired } = await markSectionExpiredIfNeeded(session);
    const sectionState = runtime.sections[task.skill];
    if (expired || sectionState.status !== SectionStatus.IN_PROGRESS) {
      throw new SessionRuleError(
        "SECTION_LOCKED",
        `Section ${task.skill} is locked or expired and cannot accept answers`,
        409,
      );
    }

    if (session.strictness === ExamStrictness.OFFICIAL && task.skill === Skill.LISTENING) {
      const playsUsed = runtime.listeningPlays[task.id] ?? 0;
      if (playsUsed > LISTENING_REPLAY_LIMIT) {
        throw new SessionRuleError(
          "REPLAY_LIMIT_EXCEEDED",
          `Listening replay limit exceeded for task ${task.id}`,
          400,
        );
      }
    }
  }

  const parsedQuestions = task.questions as unknown as Array<Record<string, unknown>>;
  const source = params.source ?? AttemptSource.TRAINER;

  const baseScore = AUTO_GRADED_TYPES.includes(task.taskType)
    ? scoreAutoGradedTask(task.taskType, parsedQuestions, params.answers)
    : scoreRubricTask({ taskType: task.taskType, points: task.points, answers: params.answers });

  const scaledScore =
    baseScore.maxScore > 0
      ? Number(((baseScore.score / baseScore.maxScore) * task.points).toFixed(2))
      : 0;

  const evidenceFeedback = evaluateEvidenceFeedback(task.taskType, params.answers);
  const ruleViolations: Array<{ code: string; detail: string }> = [];

  if (
    session.strictness === ExamStrictness.PRACTICE &&
    task.skill === Skill.READING &&
    evidenceFeedback &&
    !evidenceFeedback.consistent
  ) {
    ruleViolations.push({
      code: "EVIDENCE_MISMATCH",
      detail: `${evidenceFeedback.mismatches.length} answer(s) do not match selected evidence`,
    });
  }

  const attempt = await prisma.taskAttempt.create({
    data: {
      learnerId: DEFAULT_LEARNER_ID,
      sessionId: params.sessionId,
      taskId: task.id,
      skill: task.skill,
      taskType: task.taskType,
      answers: params.answers as unknown as object,
      score: scaledScore,
      maxScore: task.points,
      isCorrect: typeof baseScore.isCorrect === "boolean" ? baseScore.isCorrect : undefined,
      confidence: params.confidence,
      source,
      feedback: {
        autoGraded: baseScore.isAutoGraded,
        rawScore: baseScore.score,
        rawMax: baseScore.maxScore,
        evidenceFeedback:
          session.strictness === ExamStrictness.PRACTICE && evidenceFeedback
            ? {
                consistent: evidenceFeedback.consistent,
                mismatches: evidenceFeedback.mismatches,
              }
            : undefined,
      },
      ruleViolations: ruleViolations.length > 0 ? (ruleViolations as unknown as object) : undefined,
    },
  });

  const isCorrect = scaledScore >= task.points * 0.7;
  await upsertReviewCardFromAttempt({
    learnerId: DEFAULT_LEARNER_ID,
    taskId: task.id,
    isCorrect,
  });

  return {
    attempt,
    score: scaledScore,
    maxScore: task.points,
    autoGraded: baseScore.isAutoGraded,
    strictness: session.strictness,
    transcriptAllowed:
      task.skill !== Skill.LISTENING
        ? true
        : session.strictness === ExamStrictness.PRACTICE
          ? true
          : false,
    guidance:
      session.strictness === ExamStrictness.PRACTICE && evidenceFeedback
        ? {
            evidenceConsistent: evidenceFeedback.consistent,
            mismatches: evidenceFeedback.mismatches,
          }
        : undefined,
  };
}

export async function submitSection(params: {
  sessionId: string;
  skill: Skill;
}) {
  const session = await loadSessionOrThrow(params.sessionId);
  if (session.mode === SessionMode.EXAM && session.currentSection !== params.skill) {
    throw new SessionRuleError(
      "INVALID_SECTION_TASK",
      `Section ${params.skill} is not the active section`,
      400,
    );
  }

  const attempts = await prisma.taskAttempt.findMany({
    where: { sessionId: params.sessionId, skill: params.skill },
    include: { task: true },
  });

  const score = Number(attempts.reduce((acc, row) => acc + row.score, 0).toFixed(2));
  const section = evaluateSectionPass(params.skill, score);

  const { runtime, expired } = await markSectionExpiredIfNeeded(session);

  const status = session.mode === SessionMode.EXAM && expired ? SectionStatus.EXPIRED : SectionStatus.SUBMITTED;

  const candidateTasks = await prisma.taskItem.findMany({
    where: { skill: params.skill },
    select: {
      id: true,
      skill: true,
      taskType: true,
      topic: true,
    },
    orderBy: { id: "asc" },
  });

  const remediation = buildSectionRemediation({
    skill: params.skill,
    attempts,
    candidateTasks,
  });

  const result = await prisma.sectionResult.upsert({
    where: {
      sessionId_skill: {
        sessionId: params.sessionId,
        skill: params.skill,
      },
    },
    update: {
      score: section.score,
      maxScore: MAX_POINTS_PER_SKILL,
      passed: section.passed,
      status,
      submittedAt: new Date(),
      remediation: remediation as unknown as object,
    },
    create: {
      learnerId: DEFAULT_LEARNER_ID,
      sessionId: params.sessionId,
      skill: params.skill,
      score: section.score,
      maxScore: MAX_POINTS_PER_SKILL,
      passed: section.passed,
      status,
      remediation: remediation as unknown as object,
    },
  });

  const currentIndex = EXAM_SECTION_ORDER.findIndex((skill) => skill === params.skill);
  const nextSection = EXAM_SECTION_ORDER[currentIndex + 1] ?? null;

  runtime.sections[params.skill] = {
    ...(runtime.sections[params.skill] ?? { order: currentIndex + 1 }),
    status,
  };

  if (nextSection && runtime.sections[nextSection].status === SectionStatus.NOT_STARTED) {
    runtime.sections[nextSection] = {
      ...runtime.sections[nextSection],
      status: SectionStatus.IN_PROGRESS,
    };
  }

  await prisma.examSession.update({
    where: { id: params.sessionId },
    data: {
      currentSection: nextSection,
      sectionStates: runtime as unknown as object,
    },
  });

  return {
    sectionResult: result,
    weakTaskTypes: remediation.weakTaskTypes,
    weakTopics: remediation.weakTopics,
    recommendedTaskIds: remediation.recommendedTaskIds,
    remediation,
  };
}

export async function recordListeningPlay(params: {
  sessionId: string;
  taskId: string;
  playEventAt?: string;
}) {
  const [session, task] = await Promise.all([
    loadSessionOrThrow(params.sessionId),
    prisma.taskItem.findUnique({ where: { id: params.taskId } }),
  ]);

  if (!task || task.skill !== Skill.LISTENING) {
    throw new Error("Task not found or not a listening task");
  }

  const { runtime, expired } = await markSectionExpiredIfNeeded(session);
  const sectionState = runtime.sections[Skill.LISTENING];

  const sectionLocked =
    session.mode === SessionMode.EXAM &&
    (session.currentSection !== Skill.LISTENING || expired || sectionState.status !== SectionStatus.IN_PROGRESS);

  const currentPlays = runtime.listeningPlays[params.taskId] ?? 0;

  if (sectionLocked) {
    return {
      playsUsed: currentPlays,
      playsRemaining: Math.max(0, LISTENING_REPLAY_LIMIT - currentPlays),
      locked: true,
      strictness: session.strictness,
      playEventAt: params.playEventAt ?? new Date().toISOString(),
    };
  }

  const nextPlays = currentPlays + 1;
  runtime.listeningPlays[params.taskId] = nextPlays;

  await prisma.examSession.update({
    where: { id: params.sessionId },
    data: {
      sectionStates: runtime as unknown as object,
    },
  });

  const locked =
    session.strictness === ExamStrictness.OFFICIAL && nextPlays > LISTENING_REPLAY_LIMIT;

  return {
    playsUsed: nextPlays,
    playsRemaining:
      session.strictness === ExamStrictness.OFFICIAL
        ? Math.max(0, LISTENING_REPLAY_LIMIT - nextPlays)
        : -1,
    locked,
    strictness: session.strictness,
    playEventAt: params.playEventAt ?? new Date().toISOString(),
  };
}

export async function finishSession(sessionId: string) {
  const sectionResults = await prisma.sectionResult.findMany({ where: { sessionId } });
  const mapped = sectionResults.map((row) => ({
    skill: row.skill,
    score: row.score,
    maxScore: row.maxScore,
    passed: row.passed,
  }));

  const outcome = computeExamOutcome(mapped);

  const session = await prisma.examSession.update({
    where: { id: sessionId },
    data: {
      isFinished: true,
      endedAt: new Date(),
      totalScore: outcome.totalScore,
      passAll: outcome.passAll,
      failReasons: {
        summary: outcome.failReasons,
        detailed: outcome.failReasonsDetailed,
      } as unknown as object,
    },
  });

  return {
    session,
    sectionResults,
    outcome,
  };
}

function parseStoredRemediation(raw: unknown): SectionRemediation | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as SectionRemediation;
  if (!Array.isArray(value.recommendedTaskIds)) return null;
  if (!Array.isArray(value.weakTopics)) return null;
  if (!Array.isArray(value.weakTaskTypes)) return null;
  return value;
}

export async function getSessionResult(sessionId: string) {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      sectionResults: true,
      attempts: {
        include: {
          task: true,
        },
        orderBy: {
          submittedAt: "asc",
        },
      },
    },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  const tasks = await prisma.taskItem.findMany({
    select: {
      id: true,
      skill: true,
      taskType: true,
      topic: true,
    },
  });

  const remediationPlan = EXAM_SECTION_ORDER.map((skill) => {
    const stored = session.sectionResults.find((row) => row.skill === skill);
    const storedRemediation = parseStoredRemediation(stored?.remediation);
    if (storedRemediation) {
      return {
        skill,
        ...storedRemediation,
      };
    }

    const attempts = session.attempts.filter((row) => row.skill === skill);
    const remediation = buildSectionRemediation({
      skill,
      attempts,
      candidateTasks: tasks.filter((task) => task.skill === skill),
    });

    return {
      skill,
      ...remediation,
    };
  });

  const sectionScores = session.sectionResults.map((row) => ({
    skill: row.skill,
    score: row.score,
    maxScore: row.maxScore,
    passed: row.passed,
  }));

  const persistedFail =
    session.failReasons && typeof session.failReasons === "object"
      ? (session.failReasons as { detailed?: unknown }).detailed
      : null;

  const failReasonsDetailed = Array.isArray(persistedFail)
    ? persistedFail
    : buildFailReasonsDetailed({ sectionScores });

  return {
    ...session,
    remediationPlan,
    failReasonsDetailed,
  };
}

export function parseSkill(input: string): Skill {
  const normalized = input.toUpperCase();
  if (!["LISTENING", "READING", "WRITING", "SPEAKING"].includes(normalized)) {
    throw new Error("Invalid skill");
  }
  return normalized as Skill;
}

export function parseMode(input: string): SessionMode {
  const normalized = input.toUpperCase();
  if (!["EXAM", "TRAINING", "DAILY_REVIEW"].includes(normalized)) {
    throw new Error("Invalid mode");
  }
  return normalized as SessionMode;
}

export function parseStrictness(input?: string): ExamStrictness | undefined {
  if (!input) return undefined;
  const normalized = input.toUpperCase();
  if (!["OFFICIAL", "PRACTICE"].includes(normalized)) {
    throw new Error("Invalid strictness");
  }
  return normalized as ExamStrictness;
}
