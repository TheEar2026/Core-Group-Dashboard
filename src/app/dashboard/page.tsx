import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

type SchoolReportRow = {
  school_id: number;
  school_name: string;
  drived_users: number | null;
  drived_invited: number | null;
  drived_accepted: number | null;
  drived_logged: number | null;
  drived_studied: number | null;
  vimeo_views: number | null;
  vimeo_unique_viewers: number | null;
  vimeo_avg_pct_watched: number | null;
  product_fruits_active_users: number | null;
  lms_avg_completion_pct: number | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_my_school_report");
  const rows = (data ?? []) as SchoolReportRow[];

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">School Report</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            Sign out
          </button>
        </form>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Couldn&apos;t load report: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          No school data available for this account.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">School</th>
                <th className="py-2 pr-4 font-medium">Drived Users</th>
                <th className="py-2 pr-4 font-medium">Invited</th>
                <th className="py-2 pr-4 font-medium">Accepted</th>
                <th className="py-2 pr-4 font-medium">Logged In</th>
                <th className="py-2 pr-4 font-medium">Studied</th>
                <th className="py-2 pr-4 font-medium">Vimeo Views</th>
                <th className="py-2 pr-4 font-medium">Unique Viewers</th>
                <th className="py-2 pr-4 font-medium">Avg % Watched</th>
                <th className="py-2 pr-4 font-medium">Product Fruits Active</th>
                <th className="py-2 pr-4 font-medium">LMS Avg Completion %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.school_id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{row.school_name}</td>
                  <td className="py-2 pr-4">{row.drived_users ?? "-"}</td>
                  <td className="py-2 pr-4">{row.drived_invited ?? "-"}</td>
                  <td className="py-2 pr-4">{row.drived_accepted ?? "-"}</td>
                  <td className="py-2 pr-4">{row.drived_logged ?? "-"}</td>
                  <td className="py-2 pr-4">{row.drived_studied ?? "-"}</td>
                  <td className="py-2 pr-4">{row.vimeo_views ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {row.vimeo_unique_viewers ?? "-"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.vimeo_avg_pct_watched ?? "-"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.product_fruits_active_users ?? "-"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.lms_avg_completion_pct ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
