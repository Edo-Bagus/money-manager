import type { Tables } from "@/lib/supabase/database.types";

/**
 * One posting exactly as create_transaction / update_transaction take it:
 * those RPCs reject any other key. Sign convention (SPEC §5): positive means
 * an asset or expense grows (or a person owes me more), negative means
 * income or a source of funds.
 */
export type Posting = { account_id: string; amount_sen: number };

/** What the posting builders need to know about an account. */
export type AccountRef = Pick<Tables<"accounts">, "id" | "kind" | "system_key">;

/**
 * Throws unless the postings satisfy what the database enforces for every
 * transaction, drafts included (SPEC §5): at least 2, each a nonzero safe
 * integer of sen, summing to 0. The RPC checks the same; checking here as
 * well turns a builder bug into a failing unit test instead of a refused save.
 */
export function assertBalanced(postings: readonly Posting[]): void {
  if (postings.length < 2) {
    throw new Error(`a transaction needs at least 2 postings, got ${postings.length}`);
  }
  let sum = 0;
  for (const [index, posting] of postings.entries()) {
    if (!Number.isSafeInteger(posting.amount_sen) || posting.amount_sen === 0) {
      throw new Error(`posting ${index}: amount_sen must be a nonzero safe integer, got ${posting.amount_sen}`);
    }
    sum += posting.amount_sen;
    // Past the safe range the running sum is no longer exact and could
    // come out as 0 by accident.
    if (!Number.isSafeInteger(sum)) throw new Error("postings sum out of the safe integer range");
  }
  if (sum !== 0) throw new Error(`postings sum to ${sum} sen; they must sum to 0`);
}
