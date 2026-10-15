import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "@/lib/auth/allowed-email";

describe("isAllowedEmail", () => {
  it("accepts the configured email", () => {
    expect(isAllowedEmail("me@example.com", "me@example.com")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isAllowedEmail(" Me@Example.COM ", "me@example.com\n")).toBe(true);
  });

  it("rejects any other email", () => {
    expect(isAllowedEmail("someone@example.com", "me@example.com")).toBe(false);
  });

  it("rejects a missing user email", () => {
    expect(isAllowedEmail(undefined, "me@example.com")).toBe(false);
    expect(isAllowedEmail("", "me@example.com")).toBe(false);
  });

  it("fails closed when ALLOWED_EMAIL is unset or blank", () => {
    expect(isAllowedEmail("me@example.com", undefined)).toBe(false);
    expect(isAllowedEmail("me@example.com", "")).toBe(false);
    expect(isAllowedEmail("", "  ")).toBe(false);
  });
});
