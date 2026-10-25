-- CreateEnum
CREATE TYPE "SpaceRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('consumable', 'returnable');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('shared', 'private');

-- CreateEnum
CREATE TYPE "BorrowState" AS ENUM ('Requested', 'Reserved', 'Borrowed', 'Ready to return', 'Returned', 'Rejected', 'Cancelled', 'Lost or damaged');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('system', 'light', 'dark');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('upcoming', 'overdue');

-- CreateEnum
CREATE TYPE "DeliveryState" AS ENUM ('pending', 'sending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Member',
    "theme" "Theme" NOT NULL DEFAULT 'system',
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "selectedSpaceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "spaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("spaceId","userId")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "custodianId" UUID,
    "name" TEXT NOT NULL,
    "kind" "ItemKind" NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL,
    "photoPath" TEXT,
    "quantity" INTEGER,
    "unit" TEXT,
    "lowThreshold" INTEGER,
    "damaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorrowRequest" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "borrowerId" UUID NOT NULL,
    "state" "BorrowState" NOT NULL DEFAULT 'Requested',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BorrowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "before" INTEGER,
    "after" INTEGER,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationReceipt" (
    "actorId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "status" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY ("actorId","key")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "deviceTokenId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "state" "DeliveryState" NOT NULL DEFAULT 'pending',
    "expoTicketId" TEXT,
    "receiptCheckedAt" TIMESTAMPTZ(3),
    "claimedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoUpload" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PhotoUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Item_spaceId_deletedAt_createdAt_id_idx" ON "Item"("spaceId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Item_spaceId_category_idx" ON "Item"("spaceId", "category");

-- CreateIndex
CREATE INDEX "Item_spaceId_location_idx" ON "Item"("spaceId", "location");

-- CreateIndex
CREATE INDEX "BorrowRequest_itemId_state_requestedAt_idx" ON "BorrowRequest"("itemId", "state", "requestedAt");

-- CreateIndex
CREATE INDEX "BorrowRequest_borrowerId_state_idx" ON "BorrowRequest"("borrowerId", "state");

-- CreateIndex
CREATE INDEX "Activity_itemId_at_id_idx" ON "Activity"("itemId", "at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Audit_spaceId_at_idx" ON "Audit"("spaceId", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_dedupeKey_key" ON "Reminder"("dedupeKey");

-- CreateIndex
CREATE INDEX "Reminder_state_scheduledFor_idx" ON "Reminder"("state", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoUpload_path_key" ON "PhotoUpload"("path");

-- CreateIndex
CREATE INDEX "PhotoUpload_itemId_actorId_idx" ON "PhotoUpload"("itemId", "actorId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BorrowRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "DeviceToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoUpload" ADD CONSTRAINT "PhotoUpload_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

