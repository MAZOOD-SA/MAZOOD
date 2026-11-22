-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'app',
ADD COLUMN     "device_name" TEXT;
