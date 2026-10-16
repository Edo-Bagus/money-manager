// Rupiah text <-> sen (SPEC §5): amounts are whole numbers of sen in a plain
// JS number, never a float of rupiah. Both directions are written by hand
// rather than with Intl, so the output does not shift with the ICU version
// and parsing does not depend on the locale.

/** Thrown when text is not a rupiah amount parseRupiah understands. */
export class RupiahFormatError extends Error {
  constructor(readonly input: string) {
    super(`Nominal tidak dikenali: "${input}". Contoh yang benar: 25000, 25.000, atau 1.250,50.`);
    this.name = "RupiahFormatError";
  }
}

// Indonesian notation only: "." groups thousands (exactly 3 digits per group),
// "," starts at most 2 digits of sen. Anything else is rejected rather than
// guessed: "25.5" could be 25,50 or a typo for 25.500, and "1,250.00" is
// English notation.
const PREFIX = /^(?:rp\.?|idr)\s*/i;
const BODY = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Parses an Indonesian rupiah amount into sen.
 *
 *   parseRupiah("Rp 1.116.250,00") // 111625000
 *   parseRupiah("25000")           // 2500000
 *   parseRupiah("1.250,5")         // 125050
 *
 * Accepts an optional "Rp", "Rp." or "IDR" prefix and surrounding spaces
 * (including non-breaking ones). Rejects negatives: the template decides the
 * direction of money, not the sign the user typed.
 */
export function parseRupiah(input: string): number {
  // trim() and \s both cover non-breaking spaces (U+00A0, U+202F).
  const body = input.trim().replace(PREFIX, "");
  const match = BODY.exec(body);
  if (!match) throw new RupiahFormatError(input);

  const rupiahDigits = match[1]!.replace(/\./g, "");
  const senDigits = (match[2] ?? "").padEnd(2, "0");
  // Built as one digit string so no step multiplies a rounded value.
  const sen = Number(rupiahDigits + senDigits);
  if (!Number.isSafeInteger(sen)) throw new RupiahFormatError(input);
  return sen;
}

/**
 * Formats sen for display: "Rp 1.116.250", "Rp 1.250,50", "-Rp 5.000".
 * Sen are shown only when there are any. The result parses back with
 * parseRupiah (except negatives, which parseRupiah rejects by design).
 */
export function formatRupiah(sen: number): string {
  if (!Number.isSafeInteger(sen)) {
    throw new RangeError(`formatRupiah expects a safe integer of sen, got ${sen}`);
  }
  const abs = Math.abs(sen);
  const rupiah = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+$)/g, ".");
  const cents = abs % 100;
  const fraction = cents === 0 ? "" : `,${String(cents).padStart(2, "0")}`;
  return `${sen < 0 ? "-" : ""}Rp ${rupiah}${fraction}`;
}
