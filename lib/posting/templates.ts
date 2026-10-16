// Manual-input templates -> postings (SPEC §6). Pure: the caller looks the
// chosen accounts up (through RLS) and passes them in; nothing here does I/O.
// The RPCs only validate and store what this returns.
//
// Every builder checks that each account has the kind its role needs, so a
// tampered or buggy form cannot post an expense from an income account, and
// the two fixed accounts are checked by system_key, never by name.

import type { Enums } from "@/lib/supabase/database.types";
import { assertBalanced, type AccountRef, type Posting } from "@/lib/posting/posting";

/** A SPEC §6 template; also stored as transactions.template. */
export type TemplateKind = Enums<"transaction_template">;

/** The templates in SPEC §6 order, with the label the form shows. */
export const TEMPLATE_LABELS = {
  pengeluaran: "Pengeluaran",
  pemasukan: "Pemasukan",
  transfer: "Transfer antarakun sendiri",
  pinjamkan: "Pinjamkan ke orang",
  dipinjami: "Dipinjami orang",
  dibayari: "Dibayari orang",
  terima_pelunasan: "Terima pelunasan",
  bayar_utang: "Bayar utang",
  patungan: "Patungan",
  ikhlaskan_piutang: "Ikhlaskan piutang",
  biaya_reimburse: "Biaya reimburse",
  refund: "Refund/cashback",
} as const satisfies Record<TemplateKind, string>;

/** Accounts that builders require by role (seeded by ensure_default_accounts). */
export const SYSTEM_KEYS = {
  biayaBankAdmin: "expense.biaya_bank_admin",
  hadiahDonasi: "expense.hadiah_donasi",
} as const;

type SystemKey = (typeof SYSTEM_KEYS)[keyof typeof SYSTEM_KEYS];

/**
 * Patungan split equally is rounded to whole rupiah: nobody transfers sen.
 * The remainder goes to my own share (SPEC §6).
 */
export const PATUNGAN_UNIT_SEN = 100;

export type PatunganSplit =
  /** Equal shares for these persons and me. */
  | { mode: "equal"; persons: AccountRef[] }
  /** Each person's share as given; mine is what is left (may be 0). */
  | { mode: "custom"; shares: { person: AccountRef; amountSen: number }[] };

// Amounts are positive sen; the template decides each posting's sign.
export type TemplateInput =
  | { template: "pengeluaran"; source: AccountRef; category: AccountRef; amountSen: number }
  | { template: "pemasukan"; destination: AccountRef; category: AccountRef; amountSen: number }
  | {
      template: "transfer";
      source: AccountRef;
      destination: AccountRef;
      /** What arrives at the destination. */
      amountSen: number;
      /** Charged to the source on top of amountSen. 0 or absent: no fee. */
      feeSen?: number;
      /** "Biaya Bank & Admin"; required when there is a fee. */
      feeCategory?: AccountRef;
    }
  | { template: "pinjamkan"; source: AccountRef; person: AccountRef; amountSen: number }
  | { template: "dipinjami"; destination: AccountRef; person: AccountRef; amountSen: number }
  | { template: "dibayari"; category: AccountRef; person: AccountRef; amountSen: number }
  | { template: "terima_pelunasan"; destination: AccountRef; person: AccountRef; amountSen: number }
  | { template: "bayar_utang"; source: AccountRef; person: AccountRef; amountSen: number }
  | {
      template: "patungan";
      source: AccountRef;
      /** Category of my own share. */
      category: AccountRef;
      totalSen: number;
      split: PatunganSplit;
    }
  | {
      template: "ikhlaskan_piutang";
      person: AccountRef;
      /** Must be "Hadiah & Donasi" (SPEC §5, category 11). */
      category: AccountRef;
      amountSen: number;
    }
  | {
      template: "biaya_reimburse";
      source: AccountRef;
      /** The "Reimburse: <kegiatan>" person account. */
      person: AccountRef;
      amountSen: number;
    }
  | {
      template: "refund";
      destination: AccountRef;
      /** The expense category of the original purchase. */
      category: AccountRef;
      amountSen: number;
    };

/**
 * Invalid input, with a message the form can show as is. field is the input
 * key it is about, e.g. "source", "amountSen" or "split.shares.1.amountSen".
 */
export class TemplateError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

/**
 * The postings for a template, ready for create_transaction /
 * update_transaction. Throws TemplateError for invalid input.
 */
export function buildPostings(input: TemplateInput): Posting[] {
  const postings = postingsFor(input);
  assertBalanced(postings);
  return postings;
}

/**
 * Equal Patungan shares for otherPeople persons and me, in whole rupiah;
 * the remainder (less than one rupiah per person, plus any sen) is mine.
 * Exported so the form can preview the shares before saving.
 */
export function splitEqually(
  totalSen: number,
  otherPeople: number,
): { perPersonSen: number; ownSen: number } {
  if (!Number.isSafeInteger(totalSen) || totalSen < 0) {
    throw new RangeError(`totalSen must be a non-negative safe integer, got ${totalSen}`);
  }
  if (!Number.isSafeInteger(otherPeople) || otherPeople < 1) {
    throw new RangeError(`otherPeople must be a positive integer, got ${otherPeople}`);
  }
  const units = Math.floor(totalSen / ((otherPeople + 1) * PATUNGAN_UNIT_SEN));
  const perPersonSen = units * PATUNGAN_UNIT_SEN;
  return { perPersonSen, ownSen: totalSen - perPersonSen * otherPeople };
}

function postingsFor(input: TemplateInput): Posting[] {
  switch (input.template) {
    case "pengeluaran": {
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("source", input.source, "asset"), -amount),
        post(account("category", input.category, "expense"), amount),
      ];
    }
    case "pemasukan": {
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("destination", input.destination, "asset"), amount),
        post(account("category", input.category, "income"), -amount),
      ];
    }
    case "transfer":
      return transfer(input);
    case "pinjamkan":
    case "bayar_utang":
    case "biaya_reimburse": {
      // Same postings; the templates differ only in meaning (and in which
      // person accounts the form offers).
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("source", input.source, "asset"), -amount),
        post(account("person", input.person, "person"), amount),
      ];
    }
    case "dipinjami":
    case "terima_pelunasan": {
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("destination", input.destination, "asset"), amount),
        post(account("person", input.person, "person"), -amount),
      ];
    }
    case "dibayari": {
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("category", input.category, "expense"), amount),
        post(account("person", input.person, "person"), -amount),
      ];
    }
    case "patungan":
      return patungan(input);
    case "ikhlaskan_piutang": {
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("person", input.person, "person"), -amount),
        post(account("category", input.category, "expense", SYSTEM_KEYS.hadiahDonasi), amount),
      ];
    }
    case "refund": {
      const amount = positive("amountSen", input.amountSen);
      return [
        post(account("destination", input.destination, "asset"), amount),
        post(account("category", input.category, "expense"), -amount),
      ];
    }
    default: {
      const unknown: never = input;
      throw new Error(`unknown template: ${(unknown as { template: string }).template}`);
    }
  }
}

function transfer(input: Extract<TemplateInput, { template: "transfer" }>): Posting[] {
  const amount = positive("amountSen", input.amountSen);
  const fee = input.feeSen ?? 0;
  if (!Number.isSafeInteger(fee)) throw new TemplateError("feeSen", WHOLE_SEN);
  if (fee < 0) throw new TemplateError("feeSen", "Biaya tidak boleh negatif.");

  const source = account("source", input.source, "asset");
  const destination = account("destination", input.destination, "asset");
  if (source === destination) {
    throw new TemplateError("destination", "Akun sumber dan tujuan tidak boleh sama.");
  }
  if (fee === 0) return [post(source, -amount), post(destination, amount)];

  if (!input.feeCategory) {
    throw new TemplateError("feeCategory", SYSTEM_MESSAGES[SYSTEM_KEYS.biayaBankAdmin]);
  }
  const feeAccount = account("feeCategory", input.feeCategory, "expense", SYSTEM_KEYS.biayaBankAdmin);
  const total = amount + fee;
  if (!Number.isSafeInteger(total)) throw new TemplateError("amountSen", TOO_LARGE);
  return [post(source, -total), post(destination, amount), post(feeAccount, fee)];
}

function patungan(input: Extract<TemplateInput, { template: "patungan" }>): Posting[] {
  const total = positive("totalSen", input.totalSen);
  const source = account("source", input.source, "asset");
  const category = account("category", input.category, "expense");

  const shares: Posting[] = [];
  const seen = new Set<string>();
  const addPerson = (field: string, person: AccountRef, amountSen: number) => {
    const id = account(field, person, "person");
    if (seen.has(id)) throw new TemplateError(field, "Orang yang sama tercantum dua kali.");
    seen.add(id);
    shares.push(post(id, amountSen));
  };

  const { split } = input;
  let ownSen: number;
  if (split.mode === "equal") {
    if (split.persons.length === 0) throw new TemplateError("split", NO_PERSONS);
    const equal = splitEqually(total, split.persons.length);
    if (equal.perPersonSen === 0) {
      throw new TemplateError(
        "totalSen",
        `Total terlalu kecil untuk dibagi rata ke ${split.persons.length + 1} orang.`,
      );
    }
    split.persons.forEach((person, i) => addPerson(`split.persons.${i}`, person, equal.perPersonSen));
    ownSen = equal.ownSen;
  } else {
    if (split.shares.length === 0) throw new TemplateError("split", NO_PERSONS);
    let othersSen = 0;
    split.shares.forEach((share, i) => {
      const amount = positive(`split.shares.${i}.amountSen`, share.amountSen);
      othersSen += amount;
      if (othersSen > total) {
        throw new TemplateError(`split.shares.${i}.amountSen`, "Jumlah bagian orang lain melebihi total.");
      }
      addPerson(`split.shares.${i}.person`, share.person, amount);
    });
    ownSen = total - othersSen;
  }

  // My share is 0 when I only paid for others; postings must not be 0.
  const own = ownSen === 0 ? [] : [post(category, ownSen)];
  return [post(source, -total), ...own, ...shares];
}

const WHOLE_SEN = "Nominal harus bilangan bulat sen.";
const TOO_LARGE = "Nominal terlalu besar.";
const NO_PERSONS = "Tambahkan minimal satu orang.";

// Shown next to the field, so they name what to pick rather than the role.
const KIND_MESSAGES: Record<Enums<"account_kind">, string> = {
  asset: "Pilih akun aset (bank, e-wallet, investasi, atau tunai).",
  person: "Pilih akun orang.",
  expense: "Pilih kategori pengeluaran.",
  income: "Pilih kategori pemasukan.",
  equity: "Pilih akun ekuitas.",
};

const SYSTEM_MESSAGES: Record<SystemKey, string> = {
  [SYSTEM_KEYS.biayaBankAdmin]: 'Pilih kategori "Biaya Bank & Admin".',
  [SYSTEM_KEYS.hadiahDonasi]: 'Pilih kategori "Hadiah & Donasi".',
};

/** The account's id, after checking it fits the role. */
function account(
  field: string,
  ref: AccountRef,
  kind: Enums<"account_kind">,
  systemKey?: SystemKey,
): string {
  if (ref.kind !== kind) throw new TemplateError(field, KIND_MESSAGES[kind]);
  if (systemKey !== undefined && ref.system_key !== systemKey) {
    throw new TemplateError(field, SYSTEM_MESSAGES[systemKey]);
  }
  return ref.id;
}

function positive(field: string, amountSen: number): number {
  if (!Number.isSafeInteger(amountSen)) throw new TemplateError(field, WHOLE_SEN);
  if (amountSen <= 0) throw new TemplateError(field, "Nominal harus lebih dari Rp 0.");
  return amountSen;
}

function post(account_id: string, amount_sen: number): Posting {
  return { account_id, amount_sen };
}
