import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/security/safe-equal";

describe("safeEqual", () => {
  it("is true for identical strings", () => {
    expect(safeEqual("s3cret-token", "s3cret-token")).toBe(true);
  });

  it("is false for different strings of the same length", () => {
    expect(safeEqual("s3cret-token", "s3cret-tokeN")).toBe(false);
  });

  it("is false (and does not throw) for different lengths", () => {
    expect(safeEqual("short", "a-much-longer-value")).toBe(false);
    expect(safeEqual("", "s3cret-token")).toBe(false);
  });
});
