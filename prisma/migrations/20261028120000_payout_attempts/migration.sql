-- AlterTable
ALTER TABLE "PayoutBatch" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "retryOfId" INTEGER;

-- AlterTable
ALTER TABLE "PayoutItem" ADD COLUMN     "transactionId" TEXT;

-- AddForeignKey
ALTER TABLE "PayoutBatch" ADD CONSTRAINT "PayoutBatch_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
