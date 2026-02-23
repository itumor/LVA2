-- CreateEnum
CREATE TYPE "ExamStrictness" AS ENUM ('OFFICIAL', 'PRACTICE');

-- AlterTable
ALTER TABLE "ExamSession"
ADD COLUMN "strictness" "ExamStrictness" NOT NULL DEFAULT 'PRACTICE',
ADD COLUMN "sectionDeadlines" JSONB;

-- AlterTable
ALTER TABLE "TaskAttempt"
ADD COLUMN "ruleViolations" JSONB;

-- AlterTable
ALTER TABLE "SectionResult"
ADD COLUMN "remediation" JSONB;
