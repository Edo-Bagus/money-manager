import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/lib/posting/posting";

const p = (account_id: string, amount_sen: number) => ({ account_id, amount_sen });

describe("assertBalanced", () => {
  it("accepts postings that sum to zero", () => {
    expect(() => assertBalanced([p("a", -2500000), p("b", 2500000)])).not.toThrow();
    expect(() => assertBalanced([p("a", -300), p("b", 100), p("c", 100), p("d", 100)])).not.toThrow();
  });

  it("rejects fewer than 2 postings, like the database does for drafts too", () => {
    expect(() => assertBalanced([])).toThrow(/at least 2 postings/);
    expect(() => assertBalanced([p("a", 100)])).toThrow(/at least 2 postings/);
  });

  it("rejects a zero, fractional or unsafe amount", () => {
    expect(() => assertBalanced([p("a", 0), p("b", 0)])).toThrow(/nonzero safe integer/);
    expect(() => assertBalanced([p("a", -0.5), p("b", 0.5)])).toThrow(/nonzero safe integer/);
    expect(() =>
      assertBalanced([p("a", -(Number.MAX_SAFE_INTEGER + 1)), p("b", Number.MAX_SAFE_INTEGER + 1)]),
    ).toThrow(/nonzero safe integer/);
  });

  it("rejects postings that do not sum to zero", () => {
    expect(() => assertBalanced([p("a", -2500000), p("b", 2499999)])).toThrow(/sum to -1 sen/);
  });

  it("rejects a running sum that leaves the safe range instead of trusting it", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(() => assertBalanced([p("a", max), p("b", max), p("c", -max), p("d", -max)])).toThrow(
      /safe integer range/,
    );
  });
});
