import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { MatchesReview, type QueueItem, type PersonOption } from "./matches-review";

export default async function MatchesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "super_admin") {
    redirect("/dashboard");
  }

  const [queueRes, teachersRes] = await Promise.all([
    supabase.rpc("admin_list_match_queue"),
    supabase.rpc("admin_list_teachers"),
  ]);

  const items = (queueRes.data ?? []) as QueueItem[];
  const people = ((teachersRes.data ?? []) as { id: number; teacher_name: string | null }[]).map(
    (t): PersonOption => ({ id: t.id, teacher_name: t.teacher_name }),
  );

  return (
    <AppShell email={user?.email} role={role}>
      <Link
        href="/manage"
        className="mb-4 inline-block text-sm font-medium"
        style={{ color: "var(--brand-gold)" }}
      >
        ← Back to Manage
      </Link>

      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">Match review</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Resolve unmatched source records (e.g. scraped LMS teacher names) into people so their
          data attributes correctly.
        </p>
      </header>

      <MatchesReview items={items} people={people} />
    </AppShell>
  );
}
