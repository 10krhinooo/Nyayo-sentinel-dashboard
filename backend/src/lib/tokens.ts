import { createHash, randomInt, randomUUID } from "crypto";

/**
 * Hashes a high-entropy token (invite, reset) for storage.
 *
 * SHA-256 rather than bcrypt: these are random UUIDs with no guessable
 * structure, so there is nothing to slow an attacker down about, and a fast
 * hash keeps the lookup a single indexed equality match instead of a table
 * scan comparing every row. Passwords and OTPs, which are low entropy, stay
 * on bcrypt.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Issues a random token plus the hash to store alongside it. */
export function issueToken(): { token: string; hash: string } {
  const token = randomUUID();
  return { token, hash: hashToken(token) };
}

/**
 * Six digit one-time code from a cryptographically secure source.
 *
 * Previously Math.random(), which is seeded predictably and is not intended
 * for anything security bearing.
 */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/** Maximum wrong OTP submissions before the code is burned. */
export const MAX_OTP_ATTEMPTS = 5;
