-- CreateIndex
CREATE INDEX "Inspection_createdAt_idx" ON "Inspection"("createdAt");

-- CreateIndex
CREATE INDEX "Inspection_equipmentSerial_createdAt_idx" ON "Inspection"("equipmentSerial", "createdAt");
