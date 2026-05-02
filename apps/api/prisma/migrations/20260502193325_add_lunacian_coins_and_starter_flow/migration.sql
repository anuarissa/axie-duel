-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "isStarter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "starterArchetype" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lunacianCoins" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "starterArchetype" TEXT,
ADD COLUMN     "starterPicked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LunacianTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LunacianTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LunacianTransaction_userId_createdAt_idx" ON "LunacianTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LunacianTransaction_kind_idx" ON "LunacianTransaction"("kind");

-- CreateIndex
CREATE INDEX "User_lunacianCoins_idx" ON "User"("lunacianCoins");

-- AddForeignKey
ALTER TABLE "LunacianTransaction" ADD CONSTRAINT "LunacianTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
