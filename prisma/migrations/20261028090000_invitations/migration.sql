-- AlterEnum
ALTER TYPE "Actor" ADD VALUE 'crew';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "inviteMessage" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

