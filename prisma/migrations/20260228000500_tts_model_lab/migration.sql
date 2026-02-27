-- CreateTable
CREATE TABLE "LearnerTtsConfig" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerTtsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsBenchmarkRun" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "promptId" TEXT,
    "promptText" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "audioUrl" TEXT,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsBenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsBenchmarkRating" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "naturalness" INTEGER NOT NULL,
    "pronunciation" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsBenchmarkRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnerTtsConfig_learnerId_key" ON "LearnerTtsConfig"("learnerId");

-- CreateIndex
CREATE INDEX "LearnerTtsConfig_learnerId_idx" ON "LearnerTtsConfig"("learnerId");

-- CreateIndex
CREATE INDEX "TtsBenchmarkRun_learnerId_modelId_createdAt_idx" ON "TtsBenchmarkRun"("learnerId", "modelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TtsBenchmarkRun_learnerId_idx" ON "TtsBenchmarkRun"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "TtsBenchmarkRating_runId_key" ON "TtsBenchmarkRating"("runId");

-- AddForeignKey
ALTER TABLE "LearnerTtsConfig" ADD CONSTRAINT "LearnerTtsConfig_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtsBenchmarkRun" ADD CONSTRAINT "TtsBenchmarkRun_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtsBenchmarkRating" ADD CONSTRAINT "TtsBenchmarkRating_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TtsBenchmarkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
