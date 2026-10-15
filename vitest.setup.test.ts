import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("blocks network access so tests never reach Supabase", async () => {
    await expect(fetch("https://example.supabase.co/auth/v1/user")).rejects.toThrow(
      /Network access is disabled in tests/,
    );
  });
});
