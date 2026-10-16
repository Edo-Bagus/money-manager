import { describe, expect, it } from "vitest";
import type { AccountRef } from "@/lib/posting/posting";
import {
  buildPostings,
  PATUNGAN_UNIT_SEN,
  splitEqually,
  TEMPLATE_LABELS,
  TemplateError,
  type TemplateInput,
  type TemplateKind,
} from "@/lib/posting/templates";

// Readable ids instead of uuids: the builders never look inside them.
const mandiri: AccountRef = { id: "asset-mandiri", kind: "asset", system_key: null };
const gopay: AccountRef = { id: "asset-gopay", kind: "asset", system_key: null };
const makan: AccountRef = { id: "exp-makan", kind: "expense", system_key: "expense.makan_minum" };
const belanja: AccountRef = { id: "exp-belanja", kind: "expense", system_key: "expense.belanja_pribadi" };
const biayaBank: AccountRef = { id: "exp-biaya", kind: "expense", system_key: "expense.biaya_bank_admin" };
const hadiah: AccountRef = { id: "exp-hadiah", kind: "expense", system_key: "expense.hadiah_donasi" };
const gaji: AccountRef = { id: "inc-gaji", kind: "income", system_key: "income.gaji_honor" };
const saldoAwal: AccountRef = { id: "eq-saldo-awal", kind: "equity", system_key: "equity.saldo_awal" };
const budi: AccountRef = { id: "person-budi", kind: "person", system_key: null };
const ani: AccountRef = { id: "person-ani", kind: "person", system_key: null };
const citra: AccountRef = { id: "person-citra", kind: "person", system_key: null };
const reimburseKonf: AccountRef = { id: "person-reimburse-konf", kind: "person", system_key: null };

const p = (account: AccountRef, amount_sen: number) => ({ account_id: account.id, amount_sen });
const rp = (rupiah: number) => rupiah * 100;

function templateError(build: () => unknown): TemplateError {
  try {
    build();
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error("expected a TemplateError, but nothing was thrown");
}

describe("TEMPLATE_LABELS", () => {
  it("lists the 12 templates of SPEC §6 in order", () => {
    expect(Object.values(TEMPLATE_LABELS)).toEqual([
      "Pengeluaran",
      "Pemasukan",
      "Transfer antarakun sendiri",
      "Pinjamkan ke orang",
      "Dipinjami orang",
      "Dibayari orang",
      "Terima pelunasan",
      "Bayar utang",
      "Patungan",
      "Ikhlaskan piutang",
      "Biaya reimburse",
      "Refund/cashback",
    ]);
  });
});

describe("buildPostings, one template at a time (SPEC §6)", () => {
  it("Pengeluaran: source -, category +", () => {
    expect(
      buildPostings({ template: "pengeluaran", source: mandiri, category: makan, amountSen: rp(25000) }),
    ).toEqual([p(mandiri, -rp(25000)), p(makan, rp(25000))]);
  });

  it("Pemasukan: destination +, income category -", () => {
    expect(
      buildPostings({ template: "pemasukan", destination: mandiri, category: gaji, amountSen: rp(5000000) }),
    ).toEqual([p(mandiri, rp(5000000)), p(gaji, -rp(5000000))]);
  });

  it("Transfer without a fee: source -, destination +", () => {
    expect(
      buildPostings({ template: "transfer", source: mandiri, destination: gopay, amountSen: rp(100000) }),
    ).toEqual([p(mandiri, -rp(100000)), p(gopay, rp(100000))]);
    expect(
      buildPostings({
        template: "transfer",
        source: mandiri,
        destination: gopay,
        amountSen: rp(100000),
        feeSen: 0,
        feeCategory: biayaBank,
      }),
    ).toEqual([p(mandiri, -rp(100000)), p(gopay, rp(100000))]);
  });

  it("Transfer with a fee: the source also pays the fee, to Biaya Bank & Admin", () => {
    expect(
      buildPostings({
        template: "transfer",
        source: mandiri,
        destination: gopay,
        amountSen: rp(100000),
        feeSen: rp(1000),
        feeCategory: biayaBank,
      }),
    ).toEqual([p(mandiri, -rp(101000)), p(gopay, rp(100000)), p(biayaBank, rp(1000))]);
  });

  it("Pinjamkan ke orang: source -, person +", () => {
    expect(
      buildPostings({ template: "pinjamkan", source: mandiri, person: budi, amountSen: rp(200000) }),
    ).toEqual([p(mandiri, -rp(200000)), p(budi, rp(200000))]);
  });

  it("Dipinjami orang: destination +, person -", () => {
    expect(
      buildPostings({ template: "dipinjami", destination: mandiri, person: budi, amountSen: rp(200000) }),
    ).toEqual([p(mandiri, rp(200000)), p(budi, -rp(200000))]);
  });

  it("Dibayari orang: category +, person -", () => {
    expect(
      buildPostings({ template: "dibayari", category: makan, person: budi, amountSen: rp(45000) }),
    ).toEqual([p(makan, rp(45000)), p(budi, -rp(45000))]);
  });

  it("Terima pelunasan: destination +, person -", () => {
    expect(
      buildPostings({ template: "terima_pelunasan", destination: gopay, person: budi, amountSen: rp(50000) }),
    ).toEqual([p(gopay, rp(50000)), p(budi, -rp(50000))]);
  });

  it("Bayar utang: source -, person +", () => {
    expect(
      buildPostings({ template: "bayar_utang", source: gopay, person: budi, amountSen: rp(45000) }),
    ).toEqual([p(gopay, -rp(45000)), p(budi, rp(45000))]);
  });

  it("Patungan: source - total, category + own share, each person + theirs", () => {
    expect(
      buildPostings({
        template: "patungan",
        source: mandiri,
        category: makan,
        totalSen: rp(90000),
        split: { mode: "equal", persons: [budi, ani] },
      }),
    ).toEqual([p(mandiri, -rp(90000)), p(makan, rp(30000)), p(budi, rp(30000)), p(ani, rp(30000))]);
  });

  it("Ikhlaskan piutang: person -, Hadiah & Donasi +", () => {
    expect(
      buildPostings({ template: "ikhlaskan_piutang", person: budi, category: hadiah, amountSen: rp(15000) }),
    ).toEqual([p(budi, -rp(15000)), p(hadiah, rp(15000))]);
  });

  it("Biaya reimburse: source -, the Reimburse person +", () => {
    expect(
      buildPostings({
        template: "biaya_reimburse",
        source: mandiri,
        person: reimburseKonf,
        amountSen: rp(1500000),
      }),
    ).toEqual([p(mandiri, -rp(1500000)), p(reimburseKonf, rp(1500000))]);
  });

  it("Refund/cashback: account +, original expense category -", () => {
    expect(
      buildPostings({ template: "refund", destination: gopay, category: belanja, amountSen: rp(12500) }),
    ).toEqual([p(gopay, rp(12500)), p(belanja, -rp(12500))]);
  });
});

describe("every template", () => {
  const samples: Record<TemplateKind, TemplateInput> = {
    pengeluaran: { template: "pengeluaran", source: mandiri, category: makan, amountSen: 1 },
    pemasukan: { template: "pemasukan", destination: mandiri, category: gaji, amountSen: 1 },
    transfer: {
      template: "transfer",
      source: mandiri,
      destination: gopay,
      amountSen: 1,
      feeSen: 1,
      feeCategory: biayaBank,
    },
    pinjamkan: { template: "pinjamkan", source: mandiri, person: budi, amountSen: 1 },
    dipinjami: { template: "dipinjami", destination: mandiri, person: budi, amountSen: 1 },
    dibayari: { template: "dibayari", category: makan, person: budi, amountSen: 1 },
    terima_pelunasan: { template: "terima_pelunasan", destination: mandiri, person: budi, amountSen: 1 },
    bayar_utang: { template: "bayar_utang", source: mandiri, person: budi, amountSen: 1 },
    patungan: {
      template: "patungan",
      source: mandiri,
      category: makan,
      totalSen: 1,
      split: { mode: "custom", shares: [{ person: budi, amountSen: 1 }] },
    },
    ikhlaskan_piutang: { template: "ikhlaskan_piutang", person: budi, category: hadiah, amountSen: 1 },
    biaya_reimburse: { template: "biaya_reimburse", source: mandiri, person: reimburseKonf, amountSen: 1 },
    refund: { template: "refund", destination: mandiri, category: makan, amountSen: 1 },
  };

  it.each(Object.entries(samples))("%s gives balanced postings in the RPC's exact shape", (kind, input) => {
    expect(input.template).toBe(kind);
    const postings = buildPostings(input);
    expect(postings.length).toBeGreaterThanOrEqual(2);
    expect(postings.reduce((sum, posting) => sum + posting.amount_sen, 0)).toBe(0);
    for (const posting of postings) {
      // replace_postings refuses any key besides these two.
      expect(Object.keys(posting).sort()).toEqual(["account_id", "amount_sen"]);
      expect(Number.isSafeInteger(posting.amount_sen)).toBe(true);
      expect(posting.amount_sen).not.toBe(0);
    }
    expect(JSON.parse(JSON.stringify(postings))).toEqual(postings);
  });

  it.each(Object.entries(samples))("%s rejects a 0, negative, fractional or unsafe amount", (_, input) => {
    const field = input.template === "patungan" ? "totalSen" : "amountSen";
    for (const bad of [0, -100, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      const error = templateError(() => buildPostings({ ...input, [field]: bad } as TemplateInput));
      expect(error.field).toBe(field);
    }
  });

  it("handles the largest safe amount exactly", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(
      buildPostings({ template: "pengeluaran", source: mandiri, category: makan, amountSen: max }),
    ).toEqual([p(mandiri, -max), p(makan, max)]);
  });

  it("throws on a template it does not know (input that skipped the types)", () => {
    expect(() => buildPostings({ template: "hibah" } as unknown as TemplateInput)).toThrow(
      /unknown template: hibah/,
    );
  });
});

describe("account checks", () => {
  // A tampered or buggy form must not get an account into the wrong role.
  it.each<[string, TemplateInput, string]>([
    ["income as source", { template: "pengeluaran", source: gaji, category: makan, amountSen: 1 }, "source"],
    ["person as source", { template: "pengeluaran", source: budi, category: makan, amountSen: 1 }, "source"],
    ["income as expense category", { template: "pengeluaran", source: mandiri, category: gaji, amountSen: 1 }, "category"],
    ["equity as expense category", { template: "pengeluaran", source: mandiri, category: saldoAwal, amountSen: 1 }, "category"],
    ["expense as income category", { template: "pemasukan", destination: mandiri, category: makan, amountSen: 1 }, "category"],
    ["expense as destination", { template: "pemasukan", destination: makan, category: gaji, amountSen: 1 }, "destination"],
    ["person as transfer destination", { template: "transfer", source: mandiri, destination: budi, amountSen: 1 }, "destination"],
    ["asset as person", { template: "pinjamkan", source: mandiri, person: gopay, amountSen: 1 }, "person"],
    ["asset as person", { template: "dipinjami", destination: mandiri, person: gopay, amountSen: 1 }, "person"],
    ["income as dibayari category", { template: "dibayari", category: gaji, person: budi, amountSen: 1 }, "category"],
    ["asset as person", { template: "terima_pelunasan", destination: mandiri, person: gopay, amountSen: 1 }, "person"],
    ["expense as source", { template: "bayar_utang", source: makan, person: budi, amountSen: 1 }, "source"],
    ["income as refund category", { template: "refund", destination: mandiri, category: gaji, amountSen: 1 }, "category"],
    ["asset as reimburse person", { template: "biaya_reimburse", source: mandiri, person: gopay, amountSen: 1 }, "person"],
  ])("rejects %s (%#)", (_, input, field) => {
    expect(templateError(() => buildPostings(input)).field).toBe(field);
  });

  it("says what to pick, in Indonesian", () => {
    const error = templateError(() =>
      buildPostings({ template: "pengeluaran", source: gaji, category: makan, amountSen: 1 }),
    );
    expect(error.message).toBe("Pilih akun aset (bank, e-wallet, investasi, atau tunai).");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TemplateError");
  });

  it("Ikhlaskan piutang only goes to Hadiah & Donasi, found by system_key", () => {
    const error = templateError(() =>
      buildPostings({ template: "ikhlaskan_piutang", person: budi, category: makan, amountSen: 1 }),
    );
    expect(error.field).toBe("category");
    expect(error.message).toBe('Pilih kategori "Hadiah & Donasi".');
    // A user category that happens to be named "Hadiah & Donasi" is not it.
    const lookalike: AccountRef = { id: "exp-hadiah-2", kind: "expense", system_key: null };
    expect(
      templateError(() =>
        buildPostings({ template: "ikhlaskan_piutang", person: budi, category: lookalike, amountSen: 1 }),
      ).field,
    ).toBe("category");
    // Only person accounts can be forgiven.
    expect(
      templateError(() =>
        buildPostings({ template: "ikhlaskan_piutang", person: mandiri, category: hadiah, amountSen: 1 }),
      ).field,
    ).toBe("person");
  });
});

describe("Transfer", () => {
  const base = { template: "transfer", source: mandiri, destination: gopay, amountSen: rp(100000) } as const;

  it("refuses the same account on both sides", () => {
    const error = templateError(() => buildPostings({ ...base, destination: mandiri }));
    expect(error.field).toBe("destination");
    expect(error.message).toBe("Akun sumber dan tujuan tidak boleh sama.");
  });

  it("needs Biaya Bank & Admin, by system_key, when there is a fee", () => {
    expect(templateError(() => buildPostings({ ...base, feeSen: rp(2500) })).field).toBe("feeCategory");
    expect(
      templateError(() => buildPostings({ ...base, feeSen: rp(2500), feeCategory: makan })).message,
    ).toBe('Pilih kategori "Biaya Bank & Admin".');
    expect(
      templateError(() => buildPostings({ ...base, feeSen: rp(2500), feeCategory: gaji })).field,
    ).toBe("feeCategory");
  });

  it("rejects a negative or fractional fee", () => {
    for (const feeSen of [-1, 0.5, Number.NaN]) {
      expect(
        templateError(() => buildPostings({ ...base, feeSen, feeCategory: biayaBank })).field,
      ).toBe("feeSen");
    }
  });

  it("rejects an amount plus fee beyond the safe range", () => {
    const error = templateError(() =>
      buildPostings({ ...base, amountSen: Number.MAX_SAFE_INTEGER, feeSen: 1, feeCategory: biayaBank }),
    );
    expect(error.field).toBe("amountSen");
  });
});

describe("Patungan, split equally", () => {
  const patungan = (totalSen: number, persons: AccountRef[]): TemplateInput => ({
    template: "patungan",
    source: mandiri,
    category: makan,
    totalSen,
    split: { mode: "equal", persons },
  });

  it("rounds each person's share to whole rupiah; the remainder is mine", () => {
    // Rp100.000 / 3 = Rp33.333 each for Budi and Ani, Rp33.334 for me.
    expect(buildPostings(patungan(rp(100000), [budi, ani]))).toEqual([
      p(mandiri, -rp(100000)),
      p(makan, rp(33334)),
      p(budi, rp(33333)),
      p(ani, rp(33333)),
    ]);
  });

  it("gives me the sen of the total too", () => {
    // Rp100.000,50 / 2: Budi Rp50.000, me Rp50.000,50.
    expect(buildPostings(patungan(rp(100000) + 50, [budi]))).toEqual([
      p(mandiri, -(rp(100000) + 50)),
      p(makan, rp(50000) + 50),
      p(budi, rp(50000)),
    ]);
  });

  it("splits Rp3 three ways, but not Rp2,99", () => {
    expect(buildPostings(patungan(300, [budi, ani]))).toEqual([
      p(mandiri, -300),
      p(makan, 100),
      p(budi, 100),
      p(ani, 100),
    ]);
    const error = templateError(() => buildPostings(patungan(299, [budi, ani])));
    expect(error.field).toBe("totalSen");
    expect(error.message).toBe("Total terlalu kecil untuk dibagi rata ke 3 orang.");
  });

  it("needs at least one person, each once, each a person account", () => {
    expect(templateError(() => buildPostings(patungan(rp(90000), []))).field).toBe("split");
    const duplicate = templateError(() => buildPostings(patungan(rp(90000), [budi, ani, budi])));
    expect(duplicate.field).toBe("split.persons.2");
    expect(duplicate.message).toBe("Orang yang sama tercantum dua kali.");
    expect(templateError(() => buildPostings(patungan(rp(90000), [budi, gopay]))).field).toBe(
      "split.persons.1",
    );
  });

  it("rejects a category that is not an expense", () => {
    const input = { ...patungan(rp(90000), [budi]), category: gaji } as TemplateInput;
    expect(templateError(() => buildPostings(input)).field).toBe("category");
  });

  it("keeps every share exact and fair across many totals and group sizes", () => {
    const totals = [100, 101, 199, 1000, 99999, 100001, rp(33333) + 33, rp(1116250), 123456789];
    for (let total = 1000; total < 200000; total += 997) totals.push(total);
    totals.push(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1);

    for (const totalSen of totals) {
      for (let others = 1; others <= 12; others++) {
        const people = others + 1;
        const { perPersonSen, ownSen } = splitEqually(totalSen, others);
        expect(perPersonSen % PATUNGAN_UNIT_SEN).toBe(0);
        // Exact: checked with BigInt, which never rounds.
        expect(BigInt(perPersonSen) * BigInt(others) + BigInt(ownSen)).toBe(BigInt(totalSen));
        // My share is the largest, and by less than one rupiah per person.
        expect(ownSen - perPersonSen).toBeGreaterThanOrEqual(0);
        expect(ownSen - perPersonSen).toBeLessThan(people * PATUNGAN_UNIT_SEN);

        if (perPersonSen === 0) continue;
        const persons = Array.from({ length: others }, (_, i) => ({
          id: `person-${i}`,
          kind: "person" as const,
          system_key: null,
        }));
        const postings = buildPostings(patungan(totalSen, persons));
        expect(postings).toHaveLength(people + 1);
        expect(postings[0]).toEqual(p(mandiri, -totalSen));
        expect(postings[1]).toEqual(p(makan, ownSen));
      }
    }
  });
});

describe("Patungan, custom shares", () => {
  const patungan = (totalSen: number, shares: { person: AccountRef; amountSen: number }[]): TemplateInput => ({
    template: "patungan",
    source: mandiri,
    category: makan,
    totalSen,
    split: { mode: "custom", shares },
  });

  it("gives me what is left after the others' shares", () => {
    expect(
      buildPostings(
        patungan(rp(150000), [
          { person: budi, amountSen: rp(60000) },
          { person: ani, amountSen: rp(40000) },
        ]),
      ),
    ).toEqual([p(mandiri, -rp(150000)), p(makan, rp(50000)), p(budi, rp(60000)), p(ani, rp(40000))]);
  });

  it("leaves out my posting when I only paid for others", () => {
    expect(
      buildPostings(
        patungan(rp(100000), [
          { person: budi, amountSen: rp(60000) },
          { person: citra, amountSen: rp(40000) },
        ]),
      ),
    ).toEqual([p(mandiri, -rp(100000)), p(budi, rp(60000)), p(citra, rp(40000))]);
  });

  it("rejects shares that add up to more than the total", () => {
    const error = templateError(() =>
      buildPostings(
        patungan(rp(100000), [
          { person: budi, amountSen: rp(60000) },
          { person: ani, amountSen: rp(40001) },
        ]),
      ),
    );
    expect(error.field).toBe("split.shares.1.amountSen");
    expect(error.message).toBe("Jumlah bagian orang lain melebihi total.");
  });

  it("rejects a share that is 0, negative or fractional", () => {
    for (const amountSen of [0, -100, 0.5]) {
      expect(
        templateError(() => buildPostings(patungan(rp(100000), [{ person: budi, amountSen }]))).field,
      ).toBe("split.shares.0.amountSen");
    }
  });

  it("needs at least one person, each once, each a person account", () => {
    expect(templateError(() => buildPostings(patungan(rp(100000), []))).field).toBe("split");
    expect(
      templateError(() =>
        buildPostings(
          patungan(rp(100000), [
            { person: budi, amountSen: rp(10000) },
            { person: budi, amountSen: rp(10000) },
          ]),
        ),
      ).field,
    ).toBe("split.shares.1.person");
    expect(
      templateError(() => buildPostings(patungan(rp(100000), [{ person: makan, amountSen: rp(10000) }])))
        .field,
    ).toBe("split.shares.0.person");
  });
});

describe("splitEqually", () => {
  it("previews the shares the form will save", () => {
    expect(splitEqually(rp(100000), 2)).toEqual({ perPersonSen: rp(33333), ownSen: rp(33334) });
    expect(splitEqually(0, 3)).toEqual({ perPersonSen: 0, ownSen: 0 });
  });

  it("refuses arguments no form should send", () => {
    expect(() => splitEqually(-1, 1)).toThrow(RangeError);
    expect(() => splitEqually(0.5, 1)).toThrow(RangeError);
    expect(() => splitEqually(100, 0)).toThrow(RangeError);
    expect(() => splitEqually(100, 1.5)).toThrow(RangeError);
  });
});
