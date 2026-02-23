-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING', 'CLOZE', 'PICTURE_SENTENCE', 'WORD_FORM', 'MESSAGE_ADVERT', 'INTERVIEW', 'IMAGE_DESCRIPTION', 'AD_QUESTION');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('EXAM', 'TRAINING', 'DAILY_REVIEW');

-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttemptSource" AS ENUM ('EXAM', 'TRAINER', 'REVIEW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'MASTERED');

-- CreateTable
CREATE TABLE "LearnerProfile" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'lv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamBlueprint" (
    "id" TEXT NOT NULL,
    "sectionDurations" JSONB NOT NULL,
    "maxPointsPerSkill" INTEGER NOT NULL,
    "minPassPerSkill" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskItem" (
    "id" TEXT NOT NULL,
    "skill" "Skill" NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "topic" TEXT NOT NULL,
    "promptLv" TEXT NOT NULL,
    "promptEn" TEXT NOT NULL,
    "audioRef" TEXT,
    "transcript" TEXT,
    "questions" JSONB NOT NULL,
    "points" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "currentSection" "Skill",
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    "totalScore" DOUBLE PRECISION,
    "passAll" BOOLEAN,
    "failReasons" JSONB,
    "sectionStates" JSONB,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttempt" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "taskId" TEXT NOT NULL,
    "skill" "Skill" NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "isCorrect" BOOLEAN,
    "confidence" INTEGER,
    "source" "AttemptSource" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" JSONB,

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionResult" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "skill" "Skill" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "passed" BOOLEAN NOT NULL,
    "status" "SectionStatus" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCard" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "easiness" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "lastResult" INTEGER,
    "weaknessScore" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "ReviewStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakingRecording" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "taskId" TEXT,
    "objectKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "rubric" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakingRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlanLog" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "plannedItems" JSONB NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskItem_skill_idx" ON "TaskItem"("skill");

-- CreateIndex
CREATE INDEX "TaskItem_taskType_idx" ON "TaskItem"("taskType");

-- CreateIndex
CREATE INDEX "TaskItem_topic_idx" ON "TaskItem"("topic");

-- CreateIndex
CREATE INDEX "ExamSession_learnerId_startedAt_idx" ON "ExamSession"("learnerId", "startedAt");

-- CreateIndex
CREATE INDEX "TaskAttempt_learnerId_submittedAt_idx" ON "TaskAttempt"("learnerId", "submittedAt");

-- CreateIndex
CREATE INDEX "TaskAttempt_sessionId_idx" ON "TaskAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "TaskAttempt_taskId_idx" ON "TaskAttempt"("taskId");

-- CreateIndex
CREATE INDEX "SectionResult_learnerId_skill_idx" ON "SectionResult"("learnerId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "SectionResult_sessionId_skill_key" ON "SectionResult"("sessionId", "skill");

-- CreateIndex
CREATE INDEX "ReviewCard_learnerId_dueDate_idx" ON "ReviewCard"("learnerId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCard_learnerId_taskId_key" ON "ReviewCard"("learnerId", "taskId");

-- CreateIndex
CREATE INDEX "SpeakingRecording_learnerId_createdAt_idx" ON "SpeakingRecording"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyPlanLog_learnerId_planDate_idx" ON "DailyPlanLog"("learnerId", "planDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlanLog_learnerId_planDate_key" ON "DailyPlanLog"("learnerId", "planDate");

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionResult" ADD CONSTRAINT "SectionResult_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionResult" ADD CONSTRAINT "SectionResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingRecording" ADD CONSTRAINT "SpeakingRecording_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingRecording" ADD CONSTRAINT "SpeakingRecording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingRecording" ADD CONSTRAINT "SpeakingRecording_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlanLog" ADD CONSTRAINT "DailyPlanLog_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

