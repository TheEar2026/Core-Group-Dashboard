"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/brand";

export type TeacherRow = {
  person_id: number;
  teacher_name: string | null;
  primary_email: string | null;
  course_rows: number | string | null;
  total_lessons_completed: number | string | null;
  total_lessons_assigned: number | string | null;
  avg_completion_pct: number | string | null;
  last_product_fruits_activity: string | null;
};

type SortKey =
  | "teacher_name"
  | "course_rows"
  | "avg_completion_pct"
  | "last_product_fruits_activity";

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
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const TH =
  "px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--on-surface-variant)] whitespace-nowrap";
const TD = "px-4 py-3 text-[13px] whitespace-nowrap";

export function TeacherTable({ rows }: { rows: TeacherRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("teacher_name");
  const [asc, setAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter(
          (r) =>
            (r.teacher_name ?? "").toLowerCase().includes(q) ||
            (r.primary_email ?? "").toLowerCase().includes(q),
        )
      : rows.slice();

    base.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "teacher_name") {
        av = (a.teacher_name ?? "").toLowerCase();
        bv = (b.teacher_name ?? "").toLowerCase();
      } else if (sortKey === "last_product_fruits_activity") {
        av = a.last_product_fruits_activity ?? "";
        bv = b.last_product_fruits_activity ?? "";
      } else {
        av = num(a[sortKey]) ?? -1;
        bv = num(b[sortKey]) ?? -1;
      }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return base;
  }, [rows, query, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  }

  function SortHeader({
    label,
    keyName,
    className = "",
  }: {
    label: string;
    keyName: SortKey;
    className?: string;
  }) {
    const activeSort = sortKey === keyName;
    return (
      <th className={`${TH} ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(keyName)}
          className="inline-flex items-center gap-1 hover:text-[var(--brand-gold)]"
        >
          {label}
          <span style={{ color: activeSort ? "var(--brand-gold)" : "transparent" }}>
            {activeSort && asc ? "▲" : "▼"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--brand-border)] p-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="w-full max-w-xs rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none transition-all placeholder:text-black/30 focus:border-[var(--brand-gold)] focus:shadow-[0_0_0_2px_rgba(168,136,76,0.15)]"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--brand-border)]" style={{ backgroundColor: "var(--brand-header-tint)" }}>
              <SortHeader label="Teacher" keyName="teacher_name" />
              <th className={TH}>Email</th>
              <SortHeader label="Courses" keyName="course_rows" />
              <th className={TH}>Lessons</th>
              <SortHeader label="Completion" keyName="avg_completion_pct" />
              <SortHeader label="Last activity" keyName="last_product_fruits_activity" />
              <th className={`${TH} w-8`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--brand-border)]">
            {filtered.map((r) => (
              <tr
                key={r.person_id}
                onClick={() => router.push(`/teachers/${r.person_id}`)}
                className="cursor-pointer transition-colors hover:bg-[var(--brand-bg)]"
              >
                <td className={`${TD} font-semibold`} style={{ color: "var(--brand-gold)" }}>
                  {r.teacher_name ?? "—"}
                </td>
                <td className={`${TD} text-[var(--on-surface-variant)]`}>{r.primary_email ?? "—"}</td>
                <td className={TD}>{fmt(r.course_rows)}</td>
                <td className={TD}>
                  {fmt(r.total_lessons_completed)}
                  <span className="text-[var(--on-surface-variant)]"> / {fmt(r.total_lessons_assigned)}</span>
                </td>
                <td className={TD}>
                  <StatusBadge value={num(r.avg_completion_pct)} />
                </td>
                <td className={`${TD} text-[var(--on-surface-variant)]`}>
                  {fmtDate(r.last_product_fruits_activity)}
                </td>
                <td className={`${TD} text-[var(--on-surface-variant)]`}>›</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--on-surface-variant)]">
                  {query ? "No teachers match your search." : "No teachers to show."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-[13px] text-[var(--on-surface-variant)]">
        Showing {filtered.length} of {rows.length} {rows.length === 1 ? "teacher" : "teachers"}
      </div>
    </div>
  );
}
