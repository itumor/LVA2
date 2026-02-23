import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_BLUEPRINT_ID,
  DEFAULT_LEARNER_ID,
  MAX_POINTS_PER_SKILL,
  MIN_PASS_PER_SKILL,
  SECTION_DURATIONS_MINUTES,
} from "../lib/constants";
import { mapSkill, mapTaskType, parseSeedData } from "../lib/content";

const prisma = new PrismaClient();

async function run() {
  const raw = readFileSync(join(process.cwd(), "prisma", "seed-data", "tasks.json"), "utf-8");
  const parsed = parseSeedData(JSON.parse(raw));

  await prisma.learnerProfile.upsert({
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

  await prisma.examBlueprint.upsert({
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

  for (const item of parsed) {
    await prisma.taskItem.upsert({
      where: { id: item.id },
      update: {
        skill: mapSkill(item.skill),
        taskType: mapTaskType(item.taskType),
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
        skill: mapSkill(item.skill),
        taskType: mapTaskType(item.taskType),
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

  console.log(`Seed complete. Upserted ${parsed.length} tasks.`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
