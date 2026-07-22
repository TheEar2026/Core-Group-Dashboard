"use client";

import { useActionState, useRef, useState } from "react";
import { resetPasswordAction, type ResetState } from "./admin-actions";

export type ResetAccount = { email: string; label: string; group: string };

const INPUT =
  "w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)] mb-1";
const BTN =
  "rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-60";

/** A readable suggestion, e.g. "Ear-7Kd2mQ4x". */
function suggestPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  return "Ear-" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function PasswordResetCard({ accounts }: { accounts: ResetAccount[] }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, undefined);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const groups = Array.from(new Set(accounts.map((a) => a.group)));

  async function copyPassword() {
    if (!state?.password) return;
    try {
      await navigator.clipboard.writeText(state.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the value is visible to copy by hand */
    }
  }

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
      <h2 className="text-base font-semibold">Reset a password</h2>
      <p className="mt-0.5 text-[13px] text-[var(--on-surface-variant)]">
        When a teacher or school admin emails you for a reset, set a new password here and send it back to them.
      </p>

      <form ref={formRef} action={action} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className={LABEL} htmlFor="reset-email">Account email</label>
          <input
            id="reset-email"
            name="email"
            type="email"
            list="reset-accounts"
            className={INPUT}
            placeholder="their sign-in email"
            required
          />
          <datalist id="reset-accounts">
            {accounts.map((a) => (
              <option key={a.email} value={a.email}>
                {a.label}
              </option>
            ))}
          </datalist>
        </div>

        <div>
          <label className={LABEL} htmlFor="reset-password">New password</label>
          <div className="flex gap-2">
            <input
              id="reset-password"
              name="password"
              className={INPUT}
              placeholder="At least 8 characters"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setPassword(suggestPassword())}
              className="shrink-0 rounded-lg border border-[var(--brand-border)] px-3 text-[13px] font-medium hover:bg-[var(--brand-bg)]"
            >
              Generate
            </button>
          </div>
        </div>

        <button type="submit" className={BTN} disabled={pending}>
          {pending ? "Resetting…" : "Reset password"}
        </button>
      </form>

      {accounts.length > 0 && (
        <p className="mt-2 text-[12px] text-[var(--on-surface-variant)]">
          {groups.join(" and ")} logins will suggest as you type.
        </p>
      )}

      {state && (
        <div className="mt-4">
          <p
            role="status"
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              color: state.ok ? "var(--status-success)" : "var(--status-danger)",
              backgroundColor: `color-mix(in srgb, ${state.ok ? "var(--status-success)" : "var(--status-danger)"} 10%, transparent)`,
            }}
          >
            {state.message}
          </p>
          {state.ok && state.password && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2">
              <span className="text-[12px] text-[var(--on-surface-variant)]">New password</span>
              <code className="font-mono text-sm font-semibold">{state.password}</code>
              <button
                type="button"
                onClick={copyPassword}
                className="ml-auto rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--surface)]"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
