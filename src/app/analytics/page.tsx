import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { AnalyticsCharts } from "./analytics-charts";
import { AttentionPanel, type AttentionTeacher } from "./attention-panel";
import type { SchoolReportRow } from "@/app/dashboard/page";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: role }, schoolRes, teacherRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_role"),
    supabase.rpc("get_my_school_report"),
    supabase.rpc("get_my_teacher_report"),
  ]);
  if (role === "teacher") redirect("/my-courses");
  const { data, error } = schoolRes;
  const rows = (data ?? []) as SchoolReportRow[];
  const teachers = (teacherRes.data ?? []) as AttentionTeacher[];

  return (
    <AppShell email={user?.email} role={role}>
      <header className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.02em]">Analytics</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          A visual overview of engagement across the reporting group, drawn from the same live data
          as the School Report.
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
          Couldn&apos;t load analytics: {error.message}
        </div>
      )}

      {!error && rows.length === 0 && (
        <p className="text-sm text-[var(--on-surface-variant)]">No data available for this account yet.</p>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-6">
          <AttentionPanel schools={rows} teachers={teachers} canManage={role === "super_admin"} />
          <AnalyticsCharts rows={rows} />
        </div>
      )}
    </AppShell>
  );
}
