import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets. Both sides are hashed first
 * so inputs of different lengths compare in constant time too, without
 * leaking the secret's length (timingSafeEqual throws on unequal lengths).
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
