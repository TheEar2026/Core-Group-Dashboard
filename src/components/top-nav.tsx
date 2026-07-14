import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Wordmark } from "@/components/brand";

type NavKey = "dashboard" | "teachers";

const LINKS: { key: NavKey; href: string; label: string }[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "teachers", href: "/teachers", label: "Teachers" },
];

export function TopNav({
  active,
  email,
}: {
  active: NavKey;
  email?: string | null;
}) {
  return (
    <nav
      className="fixed left-0 top-0 z-50 flex h-16 w-full items-center justify-between bg-white px-6"
      style={{ borderBottom: "2px solid var(--brand-gold)" }}
    >
      <div className="flex items-center gap-8">
        <Wordmark />
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => {
            const isActive = link.key === active;
            return (
              <Link
                key={link.key}
                href={link.href}
                className="pb-1 text-base font-semibold transition-colors"
                style={
                  isActive
                    ? { color: "var(--brand-gold)", borderBottom: "2px solid var(--brand-gold)" }
                    : { color: "var(--on-surface-variant)" }
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {email && (
          <span className="hidden text-[13px] font-medium text-[var(--on-surface-variant)] sm:block">
            {email}
          </span>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium transition-all hover:bg-[var(--brand-bg)] active:scale-95"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
