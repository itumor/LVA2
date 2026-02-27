-- AlterTable
ALTER TABLE "LearnerTtsConfig" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'piper';

-- CreateTable
CREATE TABLE "LearnerSttConfig" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerSttConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnerSttConfig_learnerId_key" ON "LearnerSttConfig"("learnerId");
CREATE INDEX "LearnerSttConfig_learnerId_idx" ON "LearnerSttConfig"("learnerId");

-- AddForeignKey
ALTER TABLE "LearnerSttConfig" ADD CONSTRAINT "LearnerSttConfig_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
