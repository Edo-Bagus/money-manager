"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const inputClass =
  "h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {
    error: initialError,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          defaultValue={state.email}
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-lg bg-neutral-900 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Masuk…" : "Masuk"}
      </button>
    </form>
  );
}
