-- Auth hardening.
--
-- Invite and reset tokens were stored in the clear on unindexed, non-unique
-- columns and looked up with findFirst. A database read was therefore enough
-- to take over any account with a pending invite or reset.
--
-- Existing values are hashed in place rather than dropped, so invites and
-- reset links already in flight keep working. sha256() is built in from
-- PostgreSQL 11, so this needs no extension. These tokens are random UUIDs,
-- so a fast hash is the right choice: there is nothing to brute force, and
-- the lookup stays a single indexed equality match.

ALTER TABLE "User" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenHash"  TEXT;
ALTER TABLE "User" ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "User"
   SET "inviteTokenHash" = encode(sha256(convert_to("inviteToken", 'UTF8')), 'hex')
 WHERE "inviteToken" IS NOT NULL;

UPDATE "User"
   SET "resetTokenHash" = encode(sha256(convert_to("resetToken", 'UTF8')), 'hex')
 WHERE "resetToken" IS NOT NULL;

-- Two accounts holding the same token would be a pre-existing correctness bug,
-- so fail loudly here rather than letting the unique index error out with no
-- explanation of what went wrong.
DO $$
DECLARE dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT "inviteTokenHash" FROM "User"
     WHERE "inviteTokenHash" IS NOT NULL
     GROUP BY "inviteTokenHash" HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'Duplicate inviteToken values found in % group(s); resolve before migrating', dupes;
  END IF;

  SELECT COUNT(*) INTO dupes FROM (
    SELECT "resetTokenHash" FROM "User"
     WHERE "resetTokenHash" IS NOT NULL
     GROUP BY "resetTokenHash" HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'Duplicate resetToken values found in % group(s); resolve before migrating', dupes;
  END IF;
END $$;

ALTER TABLE "User" DROP COLUMN "inviteToken";
ALTER TABLE "User" DROP COLUMN "resetToken";

CREATE UNIQUE INDEX "User_inviteTokenHash_key" ON "User"("inviteTokenHash");
CREATE UNIQUE INDEX "User_resetTokenHash_key"  ON "User"("resetTokenHash");

-- Refresh tokens were stateless and unrevocable: logout cleared cookies only,
-- so a stolen token stayed valid for its full lifetime. Tokens now carry a jti
-- and are denylisted on rotation and on logout.
CREATE TABLE "RevokedToken" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevokedToken_jti_key" ON "RevokedToken"("jti");
CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");
CREATE INDEX "RevokedToken_userId_idx" ON "RevokedToken"("userId");

ALTER TABLE "RevokedToken" ADD CONSTRAINT "RevokedToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
