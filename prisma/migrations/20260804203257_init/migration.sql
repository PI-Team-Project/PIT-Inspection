-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL DEFAULT 'Unknown',
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "equipmentLabel" TEXT NOT NULL,
    "equipmentSerial" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "review" JSONB,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);
