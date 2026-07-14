import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/brand";
import { TopNav } from "@/components/top-nav";

type SchoolReportRow = {
  school_id: number;
  school_name: string;
  drived_users: number | string | null;
  drived_invited: number | string | null;
  drived_accepted: number | string | null;
  drived_logged: number | string | null;
  drived_studied: number | string | null;
  drived_latest_snapshot_date: string | null;
  vimeo_views: number | string | null;
  vimeo_unique_viewers: number | string | null;
  vimeo_avg_pct_watched: number | string | null;
  vimeo_finishes: number | string | null;
  product_fruits_active_users: number | string | null;
  product_fruits_teachers: number | string | null;
  product_fruits_admins: number | string | null;
  product_fruits_last_activity: string | null;
  lms_course_rows: number | string | null;
  total_lessons_completed: number | string | null;
  total_lessons_assigned: number | string | null;
  lms_avg_completion_pct: number | string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function fmt(v: number | string | null | undefined): string {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString();
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TH =
  "px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)] whitespace-nowrap";
const TD = "px-4 py-3 text-[13px] whitespace-nowrap";
const BORDER_R = "border-r border-[var(--brand-border)]";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_my_school_report");
  const rows = (data ?? []) as SchoolReportRow[];

  const latestSnapshot = rows
    .map((r) => r.drived_latest_snapshot_date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--on-surface)]">
      <TopNav active="dashboard" email={user?.email} />

      <main className="mx-auto max-w-[1440px] px-6 pb-12 pt-24">
        <header className="mb-8">
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">School Report</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Institutional performance across Drived, Vimeo, Product Fruits, and the LMS.
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
          <p className="text-sm text-[var(--on-surface-variant)]">
            No data available for this account.
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  {/* Grouped header row */}
                  <tr
                    className="border-b border-[var(--brand-border)]"
                    style={{ backgroundColor: "var(--brand-header-tint)" }}
                  >
                    <th className={`sticky left-0 z-20 ${BORDER_R}`} style={{ backgroundColor: "var(--brand-header-tint)" }} />
                    <th className={`${TH} text-center ${BORDER_R}`} colSpan={5}>Drived</th>
                    <th className={`${TH} text-center ${BORDER_R}`} colSpan={4}>Vimeo</th>
                    <th className={`${TH} text-center ${BORDER_R}`} colSpan={4}>Product Fruits</th>
                    <th className={`${TH} text-center`} colSpan={3}>LMS</th>
                  </tr>
                  {/* Column header row */}
                  <tr className="border-b border-[var(--brand-border)] bg-white">
                    <th className={`sticky left-0 z-20 bg-white ${TH} ${BORDER_R}`}>School</th>
                    <th className={TH}>Users</th>
                    <th className={TH}>Invited</th>
                    <th className={TH}>Accepted</th>
                    <th className={TH}>Logged in</th>
                    <th className={`${TH} ${BORDER_R}`}>Studied</th>
                    <th className={TH}>Views</th>
                    <th className={TH}>Unique</th>
                    <th className={TH}>Avg watched</th>
                    <th className={`${TH} ${BORDER_R}`}>Finishes</th>
                    <th className={TH}>Active</th>
                    <th className={TH}>Teachers</th>
                    <th className={TH}>Admins</th>
                    <th className={`${TH} ${BORDER_R}`}>Last activity</th>
                    <th className={TH}>Courses</th>
                    <th className={TH}>Lessons</th>
                    <th className={TH}>Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-border)]">
                  {rows.map((r) => (
                    <tr key={r.school_id} className="group transition-colors hover:bg-[var(--brand-bg)]">
                      <td
                        className={`sticky left-0 z-10 bg-white group-hover:bg-[var(--brand-bg)] ${TD} ${BORDER_R} font-semibold`}
                        style={{ color: "var(--brand-gold)" }}
                      >
                        {r.school_name}
                      </td>
                      <td className={TD}>{fmt(r.drived_users)}</td>
                      <td className={TD}>{fmt(r.drived_invited)}</td>
                      <td className={TD}>{fmt(r.drived_accepted)}</td>
                      <td className={TD}>{fmt(r.drived_logged)}</td>
                      <td className={`${TD} ${BORDER_R}`}>{fmt(r.drived_studied)}</td>
                      <td className={TD}>{fmt(r.vimeo_views)}</td>
                      <td className={TD}>{fmt(r.vimeo_unique_viewers)}</td>
                      <td className={TD}><StatusBadge value={num(r.vimeo_avg_pct_watched)} /></td>
                      <td className={`${TD} ${BORDER_R}`}>{fmt(r.vimeo_finishes)}</td>
                      <td className={TD}>{fmt(r.product_fruits_active_users)}</td>
                      <td className={TD}>{fmt(r.product_fruits_teachers)}</td>
                      <td className={TD}>{fmt(r.product_fruits_admins)}</td>
                      <td className={`${TD} ${BORDER_R} text-[var(--on-surface-variant)]`}>
                        {fmtDate(r.product_fruits_last_activity)}
                      </td>
                      <td className={TD}>{fmt(r.lms_course_rows)}</td>
                      <td className={TD}>
                        {fmt(r.total_lessons_completed)}
                        <span className="text-[var(--on-surface-variant)]"> / {fmt(r.total_lessons_assigned)}</span>
                      </td>
                      <td className={TD}><StatusBadge value={num(r.lms_avg_completion_pct)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex flex-col items-center justify-between gap-2 border-t border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-[13px] text-[var(--on-surface-variant)] sm:flex-row">
              <span>
                Showing {rows.length} {rows.length === 1 ? "school" : "schools"}
              </span>
              <span>Data as of {fmtDate(latestSnapshot ?? null)}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
