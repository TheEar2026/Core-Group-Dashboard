"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="admin@theearacademy.com"
          className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-sm outline-none transition-all placeholder:text-black/30 focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-sm outline-none transition-all placeholder:text-black/30 focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-gold)] py-3 text-base font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border p-3 text-sm"
          style={{
            color: "var(--status-danger)",
            borderColor: "color-mix(in srgb, var(--status-danger) 20%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--status-danger) 8%, transparent)",
          }}
        >
          {state.error}
        </div>
      )}
    </form>
  );
}
