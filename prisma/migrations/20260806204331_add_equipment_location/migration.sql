-- CreateTable
CREATE TABLE "EquipmentLocation" (
    "serial" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "EquipmentLocation_pkey" PRIMARY KEY ("serial")
);
