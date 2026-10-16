import { describe, expect, it } from "vitest";
import { formatRupiah, parseRupiah, RupiahFormatError } from "@/lib/money/rupiah";

describe("parseRupiah", () => {
  it.each([
    ["Rp 1.116.250,00", 111625000],
    ["Rp1.116.250,00", 111625000],
    ["Rp. 25.000", 2500000],
    ["rp 25.000", 2500000],
    ["IDR 25.000", 2500000],
    ["25000", 2500000],
    ["25.000", 2500000],
    ["1.000.000", 100000000],
    ["999", 99900],
    ["0", 0],
    ["1.250,5", 125050],
    ["1.250,05", 125005],
    ["1250,50", 125050],
    ["0,01", 1],
    ["007", 700],
  ])("parses %j as %i sen", (input, sen) => {
    expect(parseRupiah(input)).toBe(sen);
  });

  it("ignores surrounding spaces, including non-breaking ones", () => {
    expect(parseRupiah("  Rp 25.000\n")).toBe(2500000);
    expect(parseRupiah("Rp 25.000")).toBe(2500000);
    expect(parseRupiah(" 25.000 ")).toBe(2500000);
  });

  it.each([
    [""],
    ["   "],
    ["Rp"],
    ["abc"],
    // Ambiguous or English notation: rejected, never guessed.
    ["25.5"],
    ["25.50"],
    ["1,116,250.00"],
    ["1.116.250.00"],
    ["1234.56"],
    // Malformed grouping.
    ["1.00"],
    ["1.0000"],
    ["10.00.000"],
    [".500"],
    ["1.000."],
    // Malformed sen.
    ["25.000,"],
    [",50"],
    ["25.000,505"],
    ["25,000,00"],
    // Inner spaces and stray characters.
    ["25 000"],
    ["Rp 25.000 rb"],
    ["25rb"],
    ["1e5"],
    // Sign belongs to the template, not to the typed amount.
    ["-25.000"],
    ["Rp -25.000"],
    ["+25000"],
  ])("rejects %j", (input) => {
    expect(() => parseRupiah(input)).toThrow(RupiahFormatError);
  });

  it("keeps the largest safe amount exact and rejects anything above it", () => {
    // Number.MAX_SAFE_INTEGER sen = 90.071.992.547.409,91 rupiah.
    expect(parseRupiah("90.071.992.547.409,91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => parseRupiah("90.071.992.547.409,92")).toThrow(RupiahFormatError);
    expect(() => parseRupiah("999999999999999999999")).toThrow(RupiahFormatError);
  });

  it("gives a message the form can show as is", () => {
    expect(() => parseRupiah("25.5")).toThrow(/^Nominal tidak dikenali: "25\.5"/);
  });
});

describe("formatRupiah", () => {
  it.each([
    [0, "Rp 0"],
    [1, "Rp 0,01"],
    [50, "Rp 0,50"],
    [99900, "Rp 999"],
    [100000, "Rp 1.000"],
    [2500000, "Rp 25.000"],
    [125050, "Rp 1.250,50"],
    [125005, "Rp 1.250,05"],
    [111625000, "Rp 1.116.250"],
    [-500000, "-Rp 5.000"],
    [-1, "-Rp 0,01"],
    [Number.MAX_SAFE_INTEGER, "Rp 90.071.992.547.409,91"],
    [Number.MIN_SAFE_INTEGER, "-Rp 90.071.992.547.409,91"],
  ])("formats %i sen as %j", (sen, text) => {
    expect(formatRupiah(sen)).toBe(text);
  });

  it.each([[1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [Number.MAX_SAFE_INTEGER + 1]])(
    "refuses %d, which is not a safe integer of sen",
    (sen) => {
      expect(() => formatRupiah(sen)).toThrow(RangeError);
    },
  );

  it("round-trips through parseRupiah", () => {
    const samples = [0, 1, 9, 10, 99, 100, 101, 99999, 100000, 123456789, 111625000];
    for (let sen = 0; sen < 100_000; sen += 7) samples.push(sen * 1013);
    samples.push(Number.MAX_SAFE_INTEGER);
    for (const sen of samples) {
      expect(parseRupiah(formatRupiah(sen))).toBe(sen);
    }
  });
});
