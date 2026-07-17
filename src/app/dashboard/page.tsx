import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { SchoolReportTable } from "./school-report-table";

// Re-exported so /analytics and /schools/[id] can keep importing the row shape
// from this route.
export type { SchoolReportRow } from "./school-report-table";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: role } = await supabase.rpc("get_my_role");
  const { data, error } = await supabase.rpc("get_my_school_report");
  const rows = (data ?? []) as import("./school-report-table").SchoolReportRow[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">School Report</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Institutional performance across Drived, Product Fruits, and the LMS.
        </p>
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
