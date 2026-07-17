import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { UploadCard } from "./upload-card";
import { SOURCES } from "./mappings";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "super_admin") {
    redirect("/analytics");
  }

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
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <UploadCard config={SOURCES.drived} />
        <UploadCard config={SOURCES.product_fruits} />
        <UploadCard config={SOURCES.lms} />
      </div>

      <p className="mt-6 text-[13px] text-[var(--on-surface-variant)]">
        Product Fruits and LMS also resolve people/schools via Match Review — unmatched teacher
        names from an LMS upload are queued there automatically.
      </p>
    </AppShell>
  );
}
