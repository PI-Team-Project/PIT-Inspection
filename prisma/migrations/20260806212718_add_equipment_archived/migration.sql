-- CreateTable
CREATE TABLE "EquipmentArchived" (
    "serial" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedBy" TEXT,

    CONSTRAINT "EquipmentArchived_pkey" PRIMARY KEY ("serial")
);
