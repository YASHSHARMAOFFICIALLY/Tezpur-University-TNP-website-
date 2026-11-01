// scrypt from node:crypto: memory-hard, no native dependency to build on the university server.
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../config/env.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64, PARAMS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Empty or malformed stored hash (imported students before first reset) never matches. */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) {
    await scryptAsync(pw, randomBytes(16), 64, PARAMS); // same cost, no timing hint
    return false;
  }
  const expected = Buffer.from(hash, "base64");
  const got = await scryptAsync(pw, Buffer.from(salt, "base64"), 64, PARAMS);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Dummy hash for unknown emails so login time does not reveal whether an account exists. */
export const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export const randomPassword = () => randomBytes(9).toString("base64url");

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** Keyed hash: a DB leak alone cannot brute-force the 10^6 code space offline. */
export const otpHash = (userId: string, purpose: string, code: string) =>
  createHmac("sha256", env.OTP_SECRET).update(`${userId}|${purpose}|${code}`).digest("hex");
