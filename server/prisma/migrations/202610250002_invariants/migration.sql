-- Prisma cannot express a conditional unique index. This makes one item have
-- at most one reservation/loan even if application transactions race.
CREATE UNIQUE INDEX "BorrowRequest_one_active_per_item" ON "BorrowRequest"("itemId")
WHERE "state" IN ('Reserved', 'Borrowed', 'Ready to return');
-- One borrower cannot create duplicate pending requests for the same item.
CREATE UNIQUE INDEX "BorrowRequest_one_pending_per_borrower" ON "BorrowRequest"("itemId", "borrowerId")
WHERE "state" = 'Requested';

-- Prisma cannot express cross-column CHECK constraints. Integer stock mirrors
-- the current mobile contract; all stock values are nonnegative.
ALTER TABLE "Item" ADD CONSTRAINT "Item_stock_shape" CHECK (
  ("kind" = 'consumable' AND "quantity" IS NOT NULL AND "quantity" >= 0 AND "lowThreshold" IS NOT NULL AND "lowThreshold" >= 0 AND "unit" IS NOT NULL)
  OR ("kind" = 'returnable' AND "quantity" IS NULL AND "lowThreshold" IS NULL AND "unit" IS NULL)
);
ALTER TABLE "Item" ADD CONSTRAINT "Item_private_no_custodian" CHECK ("visibility" = 'shared' OR "custodianId" IS NULL);
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_quantity_pair" CHECK (("before" IS NULL AND "after" IS NULL) OR ("before" IS NOT NULL AND "after" IS NOT NULL AND "before" >= 0 AND "after" >= 0));
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_usage_bounds" CHECK ("maxUses" > 0 AND "uses" >= 0 AND "uses" <= "maxUses");

-- Prisma cannot express cross-table membership checks. This rejects direct
-- inserts or transfers to a user outside the item's Space.
CREATE FUNCTION hestia_check_item_members() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Membership" WHERE "spaceId" = NEW."spaceId" AND "userId" = NEW."ownerId") THEN
    RAISE EXCEPTION 'item owner must be a Space member';
  END IF;
  IF NEW."custodianId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Membership" WHERE "spaceId" = NEW."spaceId" AND "userId" = NEW."custodianId") THEN
    RAISE EXCEPTION 'item custodian must be a Space member';
  END IF;
  IF EXISTS (SELECT 1 FROM "BorrowRequest" WHERE "itemId" = NEW.id AND state IN ('Requested', 'Reserved', 'Borrowed', 'Ready to return') AND "borrowerId" IN (NEW."ownerId", NEW."custodianId")) THEN
    RAISE EXCEPTION 'keeper cannot be an active borrower';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER item_member_guard BEFORE INSERT OR UPDATE OF "spaceId", "ownerId", "custodianId" ON "Item" FOR EACH ROW EXECUTE FUNCTION hestia_check_item_members();
REVOKE ALL ON FUNCTION hestia_check_item_members() FROM PUBLIC;

-- A membership cannot disappear while it is needed by owned items or open
-- requests. The API settles pending requests and custodians before removal.
CREATE FUNCTION hestia_guard_membership_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE removing_admin BOOLEAN := false;
BEGIN
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
CREATE TRIGGER membership_guard BEFORE DELETE OR UPDATE OF role ON "Membership" FOR EACH ROW EXECUTE FUNCTION hestia_guard_membership_change();
REVOKE ALL ON FUNCTION hestia_guard_membership_change() FROM PUBLIC;

-- Prisma cannot declare a state-machine or a cross-table borrower rule.
-- The server still checks actor authority; this is a consistency backstop.
CREATE FUNCTION hestia_check_borrow_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_item "Item"%ROWTYPE;
BEGIN
  SELECT * INTO current_item FROM "Item" WHERE id = NEW."itemId";
  IF NOT FOUND OR current_item.kind <> 'returnable' OR current_item.visibility <> 'shared' OR current_item."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'only active shared returnables can be requested';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Membership" WHERE "spaceId" = current_item."spaceId" AND "userId" = NEW."borrowerId") THEN
    RAISE EXCEPTION 'borrower must be a Space member';
  END IF;
  IF NEW."borrowerId" IN (current_item."ownerId", current_item."custodianId") THEN
    RAISE EXCEPTION 'keeper cannot borrow own item';
  END IF;
  IF current_item.damaged AND (TG_OP = 'INSERT' OR NEW.state = 'Reserved') THEN
    RAISE EXCEPTION 'damaged item cannot be requested or reserved';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state = 'Requested' AND NEW.state IN ('Reserved', 'Rejected', 'Cancelled')) OR
    (OLD.state = 'Reserved' AND NEW.state = 'Borrowed') OR
    (OLD.state = 'Borrowed' AND NEW.state IN ('Ready to return', 'Lost or damaged')) OR
    (OLD.state = 'Ready to return' AND NEW.state IN ('Returned', 'Lost or damaged'))
  ) THEN
    RAISE EXCEPTION 'invalid borrowing transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER borrow_request_guard BEFORE INSERT OR UPDATE ON "BorrowRequest" FOR EACH ROW EXECUTE FUNCTION hestia_check_borrow_request();
REVOKE ALL ON FUNCTION hestia_check_borrow_request() FROM PUBLIC;

-- A database trigger makes an activity row mandatory for every real stock
-- UPDATE. The Express transaction sets actor and event kind with SET LOCAL;
-- transaction pooling is safe because these settings never outlive the tx.
CREATE FUNCTION hestia_log_stock_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_text TEXT; event_kind TEXT;
BEGIN
  IF NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN RETURN NEW; END IF;
  actor_text := current_setting('hestia.actor_id', true);
  event_kind := current_setting('hestia.stock_kind', true);
  IF actor_text IS NULL OR actor_text = '' OR event_kind NOT IN ('Used', 'Restocked', 'Undid quantity change') THEN
    RAISE EXCEPTION 'stock changes require actor and event kind';
  END IF;
  INSERT INTO "Activity" (id, "itemId", "actorId", kind, "before", "after", at)
  VALUES (gen_random_uuid(), NEW.id, actor_text::uuid, event_kind, OLD.quantity, NEW.quantity, clock_timestamp());
  RETURN NEW;
END $$;
CREATE TRIGGER stock_ledger AFTER UPDATE OF quantity ON "Item" FOR EACH ROW EXECUTE FUNCTION hestia_log_stock_change();
REVOKE ALL ON FUNCTION hestia_log_stock_change() FROM PUBLIC;

-- Prisma has no append-only table declaration. The trigger protects item and
-- audit history against UPDATE/DELETE even from accidental server code.
CREATE FUNCTION hestia_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only';
END $$;
CREATE TRIGGER activity_append_only BEFORE UPDATE OR DELETE ON "Activity" FOR EACH ROW EXECUTE FUNCTION hestia_reject_history_change();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "Audit" FOR EACH ROW EXECUTE FUNCTION hestia_reject_history_change();
REVOKE ALL ON FUNCTION hestia_reject_history_change() FROM PUBLIC;

-- The API server uses the privileged Postgres role, so these RLS settings
-- deny direct anon/authenticated Data API reads if credentials leak. Express
-- remains the primary authorization boundary; RLS does not protect its role.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BorrowRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MutationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhotoUpload" ENABLE ROW LEVEL SECURITY;

-- Supabase Storage owns this schema, which Prisma cannot model. Create a
-- private bucket with server-enforced MIME and file-size limits when present.
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('item-photos', 'item-photos', false, 5000000, ARRAY['image/jpeg','image/png','image/webp'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5000000, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];
  END IF;
END $$;
