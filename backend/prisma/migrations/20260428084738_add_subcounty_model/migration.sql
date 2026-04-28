-- AlterTable
ALTER TABLE "SentimentEvent" ADD COLUMN     "subCountyId" TEXT;

-- CreateTable
CREATE TABLE "SubCounty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,

    CONSTRAINT "SubCounty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubCounty_code_key" ON "SubCounty"("code");

-- CreateIndex
CREATE INDEX "SubCounty_countyId_idx" ON "SubCounty"("countyId");

-- CreateIndex
CREATE INDEX "SentimentEvent_subCountyId_idx" ON "SentimentEvent"("subCountyId");

-- AddForeignKey
ALTER TABLE "SubCounty" ADD CONSTRAINT "SubCounty_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentEvent" ADD CONSTRAINT "SentimentEvent_subCountyId_fkey" FOREIGN KEY ("subCountyId") REFERENCES "SubCounty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
