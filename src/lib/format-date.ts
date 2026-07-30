/**
 * All schools are in South Africa (SAST, UTC+2, no DST) regardless of who is
 * viewing the dashboard or where the rendering code runs. Every date/time
 * shown in the app goes through these helpers so the same instant always
 * reads as the same calendar day and time everywhere -- previously, server
 * components formatted in the server's clock (UTC) while client components
 * formatted in the viewer's browser timezone, and a plain `new Date("2026-07-30")`
 * (a date-only string, parsed as UTC midnight) could shift a day earlier for
 * anyone west of UTC. Pinning the timezone explicitly removes both.
 */
const SAST = "Africa/Johannesburg";

function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: SAST }); // YYYY-MM-DD, SAST calendar day
}

/** "30 Jul 2026" */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: SAST });
}

/** "30 Jul" — compact axis label, no year. */
export function fmtAxisDate(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: SAST });
}

/** "30 Jul 2026, 14:32" */
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: SAST });
  return `${fmtDate(v)}, ${time}`;
}

/**
 * "Today, 14:32" / "Yesterday, 14:32" / "30 Jul 2026, 14:32". "Today" and
 * "Yesterday" are decided by SAST calendar day, not the server process's
 * (or browser's) local day, so this can never disagree with fmtDate/fmtDate
 * for the same timestamp.
 */
export function fmtDateTimeRelativeDay(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: SAST });

  if (dayKey(d) === dayKey(now)) return `Today, ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday, ${time}`;
  return `${fmtDate(v)}, ${time}`;
}

/** "3 hours ago" / "2 days ago" — an approximate age, not an exact calendar diff. */
export function fmtRelative(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Whole hours/days since v, for staleness thresholds — not a displayed date. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
