import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DataFreshness } from "@/components/data-freshness";
import { UploadCard } from "./upload-card";
import { SOURCES } from "./mappings";
import type { SchoolReportRow } from "@/app/dashboard/page";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: role }, reportRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_school_report"),
  ]);
  if (role !== "super_admin") {
    redirect("/analytics");
  }
  const rows = (reportRes.data ?? []) as SchoolReportRow[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">Settings — Data uploads</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Upload each source&apos;s daily export as CSV or Excel (.xlsx). Each file is previewed and
          column-matched before loading, then the dashboard refreshes. Re-uploading the same
          day&apos;s file replaces that day&apos;s data. Exports can list every school in the
          company &mdash; only rows for your 12 Core Group schools are loaded, and the result
          tells you how many were skipped.
        </p>
        {rows.length > 0 && <DataFreshness rows={rows} className="mt-3" />}
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <UploadCard config={SOURCES.drived} />
        <UploadCard config={SOURCES.product_fruits} />
      </div>

      <p className="mt-6 text-[13px] text-[var(--on-surface-variant)]">
        Product Fruits also resolves people/schools via Match Review. Lesson and course progress is
        no longer uploaded — teachers tick their own lessons off on My Courses, and that drives the
        completion figures across the app.
      </p>
    </AppShell>
  );
}
