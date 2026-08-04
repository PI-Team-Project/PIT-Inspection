/*
  Warnings:

  - Added the required column `shift` to the `Inspection` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL DEFAULT 'Unknown',
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "equipmentLabel" TEXT NOT NULL,
    "equipmentSerial" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "review" JSONB
);
INSERT INTO "new_Inspection" ("answers", "createdAt", "date", "equipmentLabel", "equipmentSerial", "firstName", "id", "lastName", "review") SELECT "answers", "createdAt", "date", "equipmentLabel", "equipmentSerial", "firstName", "id", "lastName", "review" FROM "Inspection";
DROP TABLE "Inspection";
ALTER TABLE "new_Inspection" RENAME TO "Inspection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
