import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DataFreshness } from "@/components/data-freshness";
import { SchoolReportTable } from "./school-report-table";

// Re-exported so /analytics and /schools/[id] can keep importing the row shape
// from this route.
export type { SchoolReportRow } from "./school-report-table";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch auth, role and data in one parallel wave instead of a serial
  // waterfall — none depend on each other's JS result (the RPCs resolve the
  // user server-side via auth.uid()), and the RPCs are self-gating.
  const [{ data: { user } }, { data: role }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_school_report"),
  ]);
  if (role === "teacher") redirect("/my-courses");
  const rows = (data ?? []) as import("./school-report-table").SchoolReportRow[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">School Report</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Institutional performance across Drived, Product Fruits, and the LMS.
        </p>
        {rows.length > 0 && <DataFreshness rows={rows} className="mt-3" />}
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border p-3 text-sm"
          style={{
            color: "var(--status-danger)",
            borderColor: "color-mix(in srgb, var(--status-danger) 20%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--status-danger) 8%, transparent)",
          }}
        >
          Couldn&apos;t load the report: {error.message}
        </div>
      )}

      {!error && rows.length === 0 && (
        <p className="text-sm text-[var(--on-surface-variant)]">No data available for this account.</p>
      )}

      {rows.length > 0 && <SchoolReportTable rows={rows} />}
    </AppShell>
  );
}
