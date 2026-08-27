-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "pendingLocation" TEXT,
ADD COLUMN     "pendingLocationReportedAt" TIMESTAMP(3),
ADD COLUMN     "pendingLocationReportedBy" TEXT;
