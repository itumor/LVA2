import type { Skill } from "@prisma/client";

export const DEFAULT_LEARNER_ID = "default_learner";
export const DEFAULT_BLUEPRINT_ID = "default";

export const EXAM_SECTION_ORDER: Skill[] = [
  "LISTENING",
  "READING",
  "WRITING",
  "SPEAKING",
];

export const SECTION_DURATIONS_MINUTES: Record<Skill, number> = {
  LISTENING: 25,
  READING: 30,
  WRITING: 35,
  SPEAKING: 15,
};

export const MAX_POINTS_PER_SKILL = 15;
export const MIN_PASS_PER_SKILL = 9;

export const SPACED_INTERVALS = [1, 3, 7, 14];

export const APP_TITLE = "VVPP A2 Trainer";
