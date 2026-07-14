"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { Wordmark } from "@/components/brand";

const NAV = [
  { href: "/dashboard", label: "Dashboard", match: (p: string) => p === "/dashboard" || p.startsWith("/schools") },
  { href: "/teachers", label: "Teachers", match: (p: string) => p.startsWith("/teachers") || p.startsWith("/courses") },
];

function iconProps(size = 20) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Hydrate UI state from storage / the DOM after mount.
  useEffect(() => {
    const storedSidebar = localStorage.getItem("sidebar");
    if (storedSidebar !== null) setSidebarOpen(storedSidebar === "open");
    const current = (document.documentElement.dataset.theme as "light" | "dark") || "light";
    setTheme(current);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar", next ? "open" : "closed");
      return next;
    });
  }

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("theme", next);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--on-surface)]">
      {/* Top bar */}
      <header
        className="fixed left-0 top-0 z-50 flex h-14 w-full items-center justify-between bg-[var(--surface)] px-4"
        style={{ borderBottom: "2px solid var(--brand-gold)" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Hide menu" : "Show menu"}
            aria-expanded={sidebarOpen}
            className="rounded-lg p-2 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--brand-bg)]"
          >
            <svg {...iconProps()}>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href="/dashboard" aria-label="The Ear Academy — Dashboard">
            <Wordmark className="h-7 w-auto" />
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-lg p-2 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--brand-bg)]"
          >
            {theme === "dark" ? (
              <svg {...iconProps()}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg {...iconProps()}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          {email && (
            <span className="hidden text-[13px] font-medium text-[var(--on-surface-variant)] sm:block">
              {email}
            </span>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium transition-all hover:bg-[var(--brand-bg)] active:scale-95"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-14 z-40 w-56 border-r border-[var(--brand-border)] bg-[var(--surface)] p-3 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                style={
                  active
                    ? { backgroundColor: "color-mix(in srgb, var(--brand-gold) 15%, transparent)", color: "var(--brand-gold)" }
                    : { color: "var(--on-surface-variant)" }
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile backdrop when the sidebar is open */}
      {sidebarOpen && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={toggleSidebar}
          className="fixed inset-0 top-14 z-30 bg-black/30 lg:hidden"
        />
      )}

      {/* Main content */}
      <main
        className={`px-4 pb-12 pt-20 transition-[padding] duration-200 sm:px-6 ${
          sidebarOpen ? "lg:pl-60" : "lg:pl-6"
        }`}
      >
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}
