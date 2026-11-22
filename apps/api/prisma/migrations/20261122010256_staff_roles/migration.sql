-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('owner', 'general_manager', 'verification', 'support', 'finance');

-- CreateTable
CREATE TABLE "staff_members" (
    "user_id" UUID NOT NULL,
    "role" "StaffRole" NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("user_id","role")
);

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
