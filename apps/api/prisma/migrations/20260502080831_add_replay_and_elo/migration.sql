-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "eloDeltas" JSONB,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "replayLog" JSONB;
