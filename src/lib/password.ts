// Password hashing and session-token handling.
//
// Audit S1: there was no authentication of any kind. This module is the
// primitive layer underneath it.
//
// Design notes, because "rolled your own auth" is a fair question to ask:
//   * The KDF is Node's built-in scrypt — a memory-hard, standardised
//     construction. Nothing cryptographic is invented here; the only code is
//     parameter selection, encoding, and constant-time comparison.
//   * Session tokens are opaque 256-bit random values, not JWTs. There is no
//     signature to verify, no algorithm confusion, and no revocation problem:
//     deleting the row ends the session immediately.
//   * Only the SHA-256 of a token is stored. A dump of the session table
//     yields no usable sessions.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

// N=2^15 keeps a single hash near ~100ms on modest hardware — slow enough to
// matter for offline cracking, fast enough for an interactive login.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;
const SALT_BYTES = 16;

/** Encoded as scrypt$N$r$p$salt$hash so parameters can be raised later without invalidating old hashes. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("password must be at least 8 characters");
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });
  } catch {
    return false;
  }
  // Lengths are equal by construction above, so this is safe to call and the
  // comparison itself does not leak via timing.
  return timingSafeEqual(actual, expected);
}

/** A fresh opaque session token. The raw value is only ever sent to the client. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What we persist. Never store the raw token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
