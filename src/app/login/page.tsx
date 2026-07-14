import { Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--brand-bg)] p-6">
      <div className="z-10 w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Wordmark className="h-20 w-auto" />
          </div>
          <p className="text-[13px] font-medium uppercase tracking-wider text-[var(--on-surface-variant)]">
            Core Group Dashboard
          </p>
        </header>

        <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-8 shadow-sm">
          <LoginForm />
        </section>

        <footer className="mt-8 text-center">
          <p className="text-[13px] text-[var(--on-surface-variant)]/70">
            The Ear Academy — reporting for educational excellence.
          </p>
        </footer>
      </div>
    </main>
  );
}
