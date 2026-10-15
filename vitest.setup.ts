// `npm test` must run without a Supabase connection (SPEC §9). supabase-js
// talks to Supabase over fetch, so any test that reaches the network — e.g.
// by accidentally creating a real client — fails loudly here instead of
// hanging, or worse, touching a real project. Tests that need fetch must
// stub it themselves with vi.stubGlobal.
globalThis.fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);
  throw new Error(`Network access is disabled in tests (fetch ${url})`);
};
