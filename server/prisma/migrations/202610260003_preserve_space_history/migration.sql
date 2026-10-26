ALTER TABLE "Space" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);

-- Space archival removes access while retaining items, requests, stock activity,
-- audits, and photos for a complete historical record.
CREATE OR REPLACE FUNCTION hestia_guard_membership_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE removing_admin BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hestia.deleting_space', true) = OLD."spaceId"::text
     AND EXISTS (SELECT 1 FROM "Space" WHERE id = OLD."spaceId" AND "archivedAt" IS NOT NULL) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' THEN
    removing_admin := OLD.role = 'admin';
    IF EXISTS (SELECT 1 FROM "Item" WHERE "spaceId" = OLD."spaceId" AND "ownerId" = OLD."userId" AND "deletedAt" IS NULL) THEN
      RAISE EXCEPTION 'transfer or archive owned items first';
    END IF;
    IF EXISTS (SELECT 1 FROM "BorrowRequest" r JOIN "Item" i ON i.id = r."itemId" WHERE i."spaceId" = OLD."spaceId" AND r."borrowerId" = OLD."userId" AND r.state IN ('Requested', 'Reserved', 'Borrowed', 'Ready to return')) THEN
      RAISE EXCEPTION 'settle requests before removing member';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    removing_admin := OLD.role = 'admin' AND NEW.role <> 'admin';
  END IF;
  IF removing_admin AND
     (SELECT count(*) FROM "Membership" WHERE "spaceId" = OLD."spaceId" AND role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'last admin cannot leave';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION hestia_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only';
END $$;

CREATE TABLE "AppNotification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "itemId" UUID,
  "requestId" UUID,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(3),
  CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppNotification_dedupeKey_key" ON "AppNotification"("dedupeKey");
CREATE INDEX "AppNotification_userId_createdAt_id_idx" ON "AppNotification"("userId", "createdAt" DESC, "id" DESC);
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BorrowRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NotificationDelivery" (
  "id" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "deviceTokenId" UUID NOT NULL,
  "state" "DeliveryState" NOT NULL DEFAULT 'pending',
  "claimedAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "expoTicketId" TEXT,
  "receiptCheckedAt" TIMESTAMPTZ(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3),
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_deviceTokenId_key" ON "NotificationDelivery"("notificationId", "deviceTokenId");
CREATE INDEX "NotificationDelivery_state_claimedAt_idx" ON "NotificationDelivery"("state", "claimedAt");
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AppNotification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "DeviceToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDelivery" ENABLE ROW LEVEL SECURITY;
