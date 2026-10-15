import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
};
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth, rpc }),
}));

// Like Next's redirect(): it throws, so nothing after it runs.
class RedirectError extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectError(location);
  },
}));

const { login } = await import("./actions");

const ALLOWED = "me@example.com";

function form(email: string, password = "secret"): FormData {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

function signedInAs(email: string) {
  auth.signInWithPassword.mockResolvedValue({ data: { user: { email } }, error: null });
}

describe("login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("ALLOWED_EMAIL", ALLOWED);
    auth.signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: 0, error: null });
  });

  it("creates the default accounts, then redirects home", async () => {
    signedInAs(ALLOWED);

    await expect(login({}, form(ALLOWED))).rejects.toEqual(new RedirectError("/"));

    expect(rpc).toHaveBeenCalledExactlyOnceWith("ensure_default_accounts");
  });

  it("still logs in when creating the default accounts fails", async () => {
    signedInAs(ALLOWED);
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(login({}, form(ALLOWED))).rejects.toEqual(new RedirectError("/"));

    expect(error).toHaveBeenCalledWith(
      "login: ensure_default_accounts failed",
      "PGRST202",
      "Could not find the function",
    );
    error.mockRestore();
  });

  it("does not create accounts for an email other than ALLOWED_EMAIL", async () => {
    signedInAs("someone@example.com");

    const state = await login({}, form("someone@example.com"));

    expect(state.error).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not create accounts when the password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const state = await login({}, form(ALLOWED, "wrong"));

    expect(state).toEqual({ error: "Email atau password salah.", email: ALLOWED });
    expect(rpc).not.toHaveBeenCalled();
  });
});
