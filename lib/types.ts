import type { Skill, TaskType } from "@prisma/client";

export type SupportedLanguage = "lv" | "en";

export type QuestionOption = {
  id?: string;
  label?: string;
  value?: string;
};

export type TaskQuestion = {
  id: string;
  stemLv?: string;
  stemEn?: string;
  options?: string[];
  correctAnswer?: string | boolean;
  evidenceRef?: string;
  evidenceSpan?: { start: number; end: number };
  hint?: string;
  imageHint?: string;
  imageUrl?: string;
  followUp?: string;
  bulletPoints?: string[];
  minWords?: number;
  promptLv?: string;
  adText?: string;
  target?: string;
  texts?: { id: string; contentLv: string; contentEn?: string }[];
  statements?: { id: string; textLv: string; answer: string; evidenceRef?: string }[];
  ads?: { id: string; textLv: string }[];
  situations?: { id: string; textLv: string; answer: string; evidenceRef?: string }[];
};

export type TaskPayload = {
  id: string;
  skill: Skill;
  taskType: TaskType;
  topic: string;
  promptLv: string;
  promptEn: string;
  audioRef?: string | null;
  transcript?: string | null;
  questions: TaskQuestion[];
  points: number;
  metadata: Record<string, unknown>;
};

export type SectionScore = {
  skill: Skill;
  score: number;
  maxScore: number;
  passed: boolean;
};

export type ExamStrictness = "OFFICIAL" | "PRACTICE";

export type RuleViolationCode =
  | "SECTION_LOCKED"
  | "INVALID_SECTION_TASK"
  | "REPLAY_LIMIT_EXCEEDED"
  | "INVALID_SESSION_MODE"
  | "SESSION_INCOMPLETE";

export type RemediationItem = {
  skill: Skill;
  taskType: TaskType;
  topic: string;
  taskId: string;
  reason: string;
  action: string;
};

export type SectionRemediation = {
  weakTaskTypes: TaskType[];
  weakTopics: string[];
  recommendedTaskIds: string[];
  items: RemediationItem[];
};

export type FailReasonDetailed = {
  skill: Skill;
  requiredScore: number;
  actualScore: number;
  maxScore: number;
  shortfall: number;
  criterion: string;
  explanation: string;
};

export type DailyPlanItem = {
  id: string;
  kind: "review" | "weakness" | "mixed";
  taskId: string;
  skill: Skill;
  taskType: TaskType;
  topic: string;
};
