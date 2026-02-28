import { Skill, TaskType } from "@prisma/client";
import type { TaskSeedInput } from "@/lib/content-schema";
import { parseSeedData } from "@/lib/content";
import {
  DEFAULT_BLUEPRINT_ID,
  DEFAULT_LEARNER_ID,
  MAX_POINTS_PER_SKILL,
  MIN_PASS_PER_SKILL,
  SECTION_DURATIONS_MINUTES,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { ExamTask, ExamVersion, VvppA2GeneratorOutput } from "@/lib/vvpp-a2-generator";

type ImportOptions = {
  examId?: string;
  replaceExisting?: boolean;
};

type ImportResult = {
  examId: string;
  versionLabel: string;
  importedTasks: number;
  replacedExisting: boolean;
};

type BatchImportOptions = {
  replaceExisting?: boolean;
};

type BatchImportItem = {
  payload: VvppA2GeneratorOutput;
  examId?: string;
};

type BatchImportItemResult =
  | {
      ok: true;
      examId: string;
      versionLabel: string;
      importedTasks: number;
      replacedExisting: boolean;
    }
  | {
      ok: false;
      error: string;
    };

const TASK_TYPE_MAP: Record<string, TaskType> = {
  MCQ: "MCQ",
  TRUE_FALSE: "TRUE_FALSE",
  FILL_BLANK: "FILL_BLANK",
  MATCHING: "MATCHING",
  CLOZE: "CLOZE",
  PICTURE_SENTENCE: "PICTURE_SENTENCE",
  WORD_FORM: "WORD_FORM",
  MESSAGE_ADVERT: "MESSAGE_ADVERT",
  INTERVIEW: "INTERVIEW",
  IMAGE_DESCRIPTION: "IMAGE_DESCRIPTION",
  AD_QUESTION: "AD_QUESTION",
  MCQ_ANNOUNCEMENTS: "MCQ",
  TRUE_FALSE_DIALOGUE: "TRUE_FALSE",
  GAP_FILL_DIALOGUES: "FILL_BLANK",
  SHORT_TEXT_STATEMENTS: "MATCHING",
  SITUATION_AD_MATCHING: "MATCHING",
  CLOZE_MCQ: "CLOZE",
  SMS_AD: "MESSAGE_ADVERT",
  SPEAKING_INTERVIEW: "INTERVIEW",
};

function skillToLower(skill: Skill): TaskSeedInput["skill"] {
  return skill.toLowerCase() as TaskSeedInput["skill"];
}

function taskTypeToSeed(taskType: TaskType): TaskSeedInput["taskType"] {
  return taskType.toLowerCase() as TaskSeedInput["taskType"];
}

function findAnswer(task: ExamTask, questionId: string): Record<string, unknown> | undefined {
  const items = task.answerKey?.items ?? [];
  return items.find((row) => String(row.questionId ?? row.situationId ?? "") === questionId);
}

function normalizeMcqClozeQuestions(task: ExamTask) {
  return task.questions.map((question, index) => {
    const id = String(question.id ?? `q${index + 1}`);
    const options = Array.isArray(question.optionsLv)
      ? question.optionsLv.map((row) => String(row))
      : Array.isArray(question.options)
        ? (question.options as unknown[]).map((row) => String(row))
        : [];
    const stemLv = String(question.stemLv ?? question.statementLv ?? `Jautājums ${index + 1}`);
    const answer = findAnswer(task, id);
    const answerIndex = Number(answer?.correctOptionIndex ?? -1);

    return {
      id,
      stemLv,
      options,
      correctAnswer: answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : "",
      evidenceRef: `item-${index + 1}`,
    };
  });
}

function normalizeTrueFalseQuestions(task: ExamTask) {
  return task.questions.map((question, index) => {
    const id = String(question.id ?? `q${index + 1}`);
    const stemLv = String(question.statementLv ?? question.stemLv ?? `Apgalvojums ${index + 1}`);
    const answer = findAnswer(task, id);

    return {
      id,
      stemLv,
      options: ["true", "false"],
      correctAnswer: Boolean(answer?.correct).toString(),
      evidenceRef: `dialogue-${index + 1}`,
    };
  });
}

function normalizeFillBlankQuestions(task: ExamTask) {
  const wordBank = Array.isArray(task.stimuli.wordBankLv)
    ? task.stimuli.wordBankLv.map((row) => String(row))
    : [];

  return task.questions.map((question, index) => {
    const id = String(question.id ?? `q${index + 1}`);
    const stemLv = String(question.stemLv ?? "");
    const answer = findAnswer(task, id);
    return {
      id,
      stemLv,
      options: wordBank,
      correctAnswer: String(answer?.correctWord ?? ""),
      evidenceRef: `dialogue-${index + 1}`,
    };
  });
}

function normalizeReadingShortTextsMatching(task: ExamTask) {
  const texts = task.questions.map((question, index) => ({
    id: String.fromCharCode(65 + index),
    contentLv: String(question.textLv ?? ""),
  }));

  const statements = task.questions.map((question, index) => {
    const id = `s${index + 1}`;
    const options = Array.isArray(question.optionsLv) ? question.optionsLv.map((row) => String(row)) : [];
    const answer = findAnswer(task, String(question.id ?? `q${index + 1}`));
    const answerIndex = Number(answer?.correctOptionIndex ?? -1);
    const textLv = answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : options[0] ?? "";

    return {
      id,
      textLv,
      answer: texts[index]?.id ?? "A",
      evidenceRef: texts[index]?.id ?? "A",
    };
  });

  return [
    {
      id: "q1",
      texts,
      statements,
    },
  ];
}

function normalizeReadingSituationAds(task: ExamTask) {
  const adsRaw = Array.isArray(task.stimuli.ads)
    ? (task.stimuli.ads as Array<Record<string, unknown>>)
    : [];

  const ads = adsRaw.map((ad, index) => ({
    id: String(ad.id ?? String.fromCharCode(65 + index)),
    textLv: String(ad.textLv ?? ""),
  }));

  const situations = task.questions.map((question, index) => {
    const id = String(question.id ?? `s${index + 1}`);
    const answer = findAnswer(task, id);

    return {
      id,
      textLv: String(question.textLv ?? `Situācija ${index + 1}`),
      answer: String(answer?.adId ?? "A"),
      evidenceRef: String(answer?.adId ?? "A"),
    };
  });

  return [
    {
      id: "q1",
      ads,
      situations,
    },
  ];
}

function normalizeWritingSpeakingQuestions(task: ExamTask, officialOrder: number) {
  if (officialOrder === 7) {
    return task.questions.map((question, index) => ({
      id: String(question.id ?? `q${index + 1}`),
      promptLv: String(question.promptLv ?? `Attēls ${index + 1}`),
      imageHint: String(question.promptLv ?? `Attēls ${index + 1}`),
      minWords: Number(question.minWords ?? 5),
    }));
  }

  if (officialOrder === 8) {
    return task.questions.map((question, index) => {
      const id = String(question.id ?? `q${index + 1}`);
      const answer = findAnswer(task, id);
      return {
        id,
        stemLv: String(question.stemLv ?? ""),
        correctAnswer: String(answer?.correctForm ?? ""),
      };
    });
  }

  if (officialOrder === 9) {
    const planPoints = Array.isArray(task.stimuli.planPointsLv)
      ? task.stimuli.planPointsLv.map((row) => String(row))
      : [];
    return [
      {
        id: "q1",
        promptLv: String(task.stimuli.scenarioLv ?? task.instructionLv),
        minWords: 35,
        bulletPoints: planPoints,
      },
    ];
  }

  if (officialOrder === 10) {
    return task.questions.map((question, index) => ({
      id: String(question.id ?? `q${index + 1}`),
      promptLv: String(question.promptLv ?? `Jautājums ${index + 1}`),
    }));
  }

  if (officialOrder === 11) {
    return task.questions.map((question, index) => ({
      id: String(question.id ?? `q${index + 1}`),
      promptLv: String(question.promptLv ?? `Jautājums ${index + 1}`),
      imageHint: String(question.promptLv ?? `Attēls ${index + 1}`),
    }));
  }

  return task.questions.map((question, index) => ({
    id: String(question.id ?? `q${index + 1}`),
    promptLv: String(question.promptLv ?? `Jautājums ${index + 1}`),
    adText: String(question.adTextLv ?? ""),
    target: String(question.targetLv ?? ""),
  }));
}

function mapTaskToSeed(exam: ExamVersion, skill: Skill, task: ExamTask): TaskSeedInput {
  const officialOrder = Number(task.officialOrder);
  const taskType = TASK_TYPE_MAP[task.taskType] ?? "MCQ";

  let questions: Array<Record<string, unknown>> = [];

  if (officialOrder === 1 || officialOrder === 6) {
    questions = normalizeMcqClozeQuestions(task);
  } else if (officialOrder === 2) {
    questions = normalizeTrueFalseQuestions(task);
  } else if (officialOrder === 3) {
    questions = normalizeFillBlankQuestions(task);
  } else if (officialOrder === 4) {
    questions = normalizeReadingShortTextsMatching(task);
  } else if (officialOrder === 5) {
    questions = normalizeReadingSituationAds(task);
  } else {
    questions = normalizeWritingSpeakingQuestions(task, officialOrder);
  }

  return {
    id: `${exam.examId}__t${String(officialOrder).padStart(2, "0")}`,
    skill: skillToLower(skill),
    taskType: taskTypeToSeed(taskType),
    topic: task.topic,
    promptLv: task.instructionLv,
    promptEn: task.uiLabelEn || task.taskType,
    audioRef: null,
    transcript: typeof task.stimuli.transcriptLv === "string" ? String(task.stimuli.transcriptLv) : null,
    questions,
    points: officialOrder === 10 ? 5 : Math.max(1, task.points),
    metadata: {
      officialPart: skill === "LISTENING" ? 1 : skill === "READING" ? 2 : skill === "WRITING" ? 3 : 4,
      officialOrder,
      answerKeyVersion: exam.versionLabel,
      source: "vvpp-generator",
      examId: exam.examId,
      versionLabel: exam.versionLabel,
      validation: exam.validation,
      rawTaskType: task.taskType,
      taskId: task.id,
      sourcePoints: task.points,
      rubric: task.rubric,
      sampleResponseLv: task.sampleResponseLv,
      commonErrorsLv: task.commonErrorsLv,
      stimuli: task.stimuli,
      answerKey: task.answerKey,
    },
  };
}

export function parseGeneratedOutput(raw: unknown): VvppA2GeneratorOutput {
  const parsed = raw as VvppA2GeneratorOutput;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.exams)) {
    throw new Error("Invalid VVPP generator JSON: missing exams[]");
  }
  return parsed;
}

export function convertExamToTaskSeeds(exam: ExamVersion): TaskSeedInput[] {
  const tasks: TaskSeedInput[] = [];

  for (const section of exam.sections) {
    const skill = section.skill as Skill;
    for (const task of section.tasks) {
      tasks.push(mapTaskToSeed(exam, skill, task));
    }
  }

  const validated = parseSeedData(tasks);
  if (validated.length !== 12) {
    throw new Error(`Expected 12 tasks for exam ${exam.examId}, got ${validated.length}`);
  }

  return validated;
}

async function upsertDefaultsTx(tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => unknown ? T : never) {
  await tx.learnerProfile.upsert({
    where: { id: DEFAULT_LEARNER_ID },
    update: {
      displayName: "Local Learner",
      preferredLanguage: "lv",
    },
    create: {
      id: DEFAULT_LEARNER_ID,
      displayName: "Local Learner",
      preferredLanguage: "lv",
    },
  });

  await tx.examBlueprint.upsert({
    where: { id: DEFAULT_BLUEPRINT_ID },
    update: {
      sectionDurations: SECTION_DURATIONS_MINUTES as unknown as object,
      maxPointsPerSkill: MAX_POINTS_PER_SKILL,
      minPassPerSkill: MIN_PASS_PER_SKILL,
    },
    create: {
      id: DEFAULT_BLUEPRINT_ID,
      sectionDurations: SECTION_DURATIONS_MINUTES as unknown as object,
      maxPointsPerSkill: MAX_POINTS_PER_SKILL,
      minPassPerSkill: MIN_PASS_PER_SKILL,
    },
  });
}

async function clearGeneratedDataTx(tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => unknown ? T : never) {
  await tx.taskAttempt.deleteMany({});
  await tx.reviewCard.deleteMany({});
  await tx.speakingRecording.deleteMany({});
  await tx.taskItem.deleteMany({});
}

async function upsertTaskSeedsTx(
  tx: Parameters<typeof prisma.$transaction>[0] extends (arg: infer T) => unknown ? T : never,
  tasks: TaskSeedInput[],
) {
  for (const item of tasks) {
    const skill = item.skill.toUpperCase() as Skill;
    const taskType = item.taskType.toUpperCase() as TaskType;

    await tx.taskItem.upsert({
      where: { id: item.id },
      update: {
        skill,
        taskType,
        topic: item.topic,
        promptLv: item.promptLv,
        promptEn: item.promptEn,
        audioRef: item.audioRef,
        transcript: item.transcript,
        questions: item.questions as unknown as object,
        points: item.points,
        metadata: item.metadata as unknown as object,
      },
      create: {
        id: item.id,
        skill,
        taskType,
        topic: item.topic,
        promptLv: item.promptLv,
        promptEn: item.promptEn,
        audioRef: item.audioRef,
        transcript: item.transcript,
        questions: item.questions as unknown as object,
        points: item.points,
        metadata: item.metadata as unknown as object,
      },
    });
  }
}

async function importExamWithOptionalReplace(
  payload: VvppA2GeneratorOutput,
  options: ImportOptions & { replaceInTransaction?: boolean } = {},
): Promise<ImportResult> {
  const replaceExisting = options.replaceExisting ?? true;
  const selectedExam = options.examId
    ? payload.exams.find((exam) => exam.examId === options.examId)
    : payload.exams[0];

  if (!selectedExam) {
    throw new Error(`Exam not found: ${options.examId ?? "(first exam)"}`);
  }

  const tasks = convertExamToTaskSeeds(selectedExam);

  await prisma.$transaction(async (tx) => {
    await upsertDefaultsTx(tx);

    if (replaceExisting && options.replaceInTransaction !== false) {
      await clearGeneratedDataTx(tx);
    }

    await upsertTaskSeedsTx(tx, tasks);
  });

  return {
    examId: selectedExam.examId,
    versionLabel: selectedExam.versionLabel,
    importedTasks: tasks.length,
    replacedExisting: replaceExisting,
  };
}

export async function importGeneratedExamToDb(
  payload: VvppA2GeneratorOutput,
  options: ImportOptions = {},
): Promise<ImportResult> {
  return importExamWithOptionalReplace(payload, { ...options, replaceInTransaction: true });
}

export async function importGeneratedExamsBatchToDb(
  items: BatchImportItem[],
  options: BatchImportOptions = {},
): Promise<BatchImportItemResult[]> {
  const replaceExisting = options.replaceExisting ?? true;

  if (replaceExisting) {
    await prisma.$transaction(async (tx) => {
      await upsertDefaultsTx(tx);
      await clearGeneratedDataTx(tx);
    });
  }

  const results: BatchImportItemResult[] = [];
  for (const item of items) {
    try {
      const result = await importExamWithOptionalReplace(item.payload, {
        examId: item.examId,
        replaceExisting,
        replaceInTransaction: false,
      });
      results.push({ ok: true, ...result });
    } catch (error) {
      results.push({ ok: false, error: error instanceof Error ? error.message : "Import failed" });
    }
  }

  return results;
}
