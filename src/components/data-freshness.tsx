"use client";

// A compact "how fresh is this data" indicator. Drive Ed and Product Fruits
// are uploaded manually, so it's easy to look at a stale snapshot and not
// realise it. This surfaces, per source, when it was last refreshed — and
// colours it amber/red once it's getting old — so nobody makes a call on
// stale numbers. Reads dates already present in the school-report rows, so it
// needs no extra fetch or backend change.

type Row = {
  drived_latest_snapshot_date: string | null;
  product_fruits_last_activity: string | null;
};

const AGING_DAYS = 7; // amber past a week
const STALE_DAYS = 14; // red past a fortnight

function latest(rows: Row[], key: keyof Row): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const r of rows) {
    const v = r[key];
    if (!v) continue;
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestIso = v;
    }
  }
  return bestIso;
}

function describe(iso: string | null): { text: string; tone: string; title: string } {
  if (!iso) {
    return { text: "not loaded yet", tone: "var(--on-surface-variant)", title: "No data has been uploaded for this source." };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { text: "unknown", tone: "var(--on-surface-variant)", title: "" };
  }
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  let text: string;
  if (days <= 0) text = "updated today";
  else if (days === 1) text = "updated yesterday";
  else if (days < STALE_DAYS) text = `updated ${days} days ago`;
  else if (days < 60) text = `updated ${Math.round(days / 7)} weeks ago`;
  else text = `updated ${Math.round(days / 30)} months ago`;

  const tone =
    days > STALE_DAYS ? "var(--status-danger)" : days > AGING_DAYS ? "var(--status-warning)" : "var(--on-surface-variant)";
  const title = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return { text, tone, title };
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function DataFreshness({ rows, className = "" }: { rows: Row[]; className?: string }) {
  const sources = [
    { label: "Drive Ed", ...describe(latest(rows, "drived_latest_snapshot_date")) },
    { label: "Product Fruits", ...describe(latest(rows, "product_fruits_last_activity")) },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--on-surface-variant)] ${className}`}>
      <span className="inline-flex items-center gap-1 font-medium">
        <ClockIcon />
        Data freshness
      </span>
      {sources.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5" title={s.title}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.tone }} />
          <span className="font-medium text-[var(--on-surface)]">{s.label}</span>
          <span style={{ color: s.tone }}>{s.text}</span>
        </span>
      ))}
    </div>
  );
}
