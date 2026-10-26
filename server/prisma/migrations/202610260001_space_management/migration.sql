CREATE TYPE "SpaceKind" AS ENUM ('household', 'dorm', 'student_org', 'small_office');
ALTER TABLE "Space" ADD COLUMN "kind" "SpaceKind" NOT NULL DEFAULT 'household';

-- A full Space deletion removes memberships only after its items and requests.
-- The deletion transaction sets this local flag after checking admin access.
CREATE OR REPLACE FUNCTION hestia_guard_membership_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE removing_admin BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hestia.deleting_space', true) = OLD."spaceId"::text THEN
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

-- History remains append-only during normal operation. A confirmed full
-- Space deletion may remove only the history belonging to that Space.
CREATE OR REPLACE FUNCTION hestia_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'Audit' AND
     current_setting('hestia.deleting_space', true) = OLD."spaceId"::text THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'Activity' AND
     EXISTS (SELECT 1 FROM "Item" i WHERE i.id = OLD."itemId" AND
             i."spaceId"::text = current_setting('hestia.deleting_space', true)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'history is append-only';
END $$;
