-- CreateTable
CREATE TABLE "Equipment" (
    "serial" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "flNumber" TEXT NOT NULL,
    "makeColor" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "retiredBy" TEXT,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("serial")
);
