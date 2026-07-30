import type { SVGProps } from "react";
import Image from "next/image";

/** The Ear Academy logo. */
export function Wordmark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/ear-academy-logo.png"
      alt="The Ear Academy"
      width={452}
      height={240}
      priority
      className={className}
    />
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" width="12" height="12" {...props}>
      <path
        d="M13.5 4.5 6.5 11.5 3 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" width="12" height="12" {...props}>
      <path
        d="M3 8h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" width="12" height="12" {...props}>
      <path
        d="M8 2 1.5 13.5h13L8 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

/**
 * Shared completion-percentage semantics, used everywhere a 0-100 value is
 * shown (badges, bars, charts, leaderboards) so the same number always gets
 * the same color and the same displayed text no matter which component
 * renders it.
 *
 * The color band is decided from the RAW value, before any rounding, so a
 * badge and a bar for the identical number can never disagree and rounding
 * can't push a value across the 80/60 boundary (e.g. 79.6 staying amber
 * everywhere instead of rounding up to a green "80%" in one place only).
 *
 * Display text never shows a bare "0%"/"100%" unless the value truly is 0 or
 * 100 — real-but-tiny progress shows "<1%" instead of looking like nothing
 * happened, and 99.6% shows "99%" instead of looking finished.
 */
export type CompletionBand = "success" | "warning" | "danger";

const BAND_COLOR: Record<CompletionBand, string> = {
  success: "var(--status-success)",
  warning: "var(--status-warning)",
  danger: "var(--status-danger)",
};

export function completionBand(value: number | null | undefined): CompletionBand | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value >= 80) return "success";
  if (value >= 60) return "warning";
  return "danger";
}

/** CSS color for a 0-100 value, matching completionBand. Falls back to danger for null/undefined. */
export function completionColor(value: number | null | undefined): string {
  return BAND_COLOR[completionBand(value) ?? "danger"];
}

export function completionLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value <= 0) return "0%";
  if (value >= 100) return "100%";
  const rounded = Math.round(value);
  if (rounded <= 0) return "<1%";
  if (rounded >= 100) return "99%";
  return `${rounded}%`;
}

/**
 * Completion / watch-% badge. Traffic-light palette, independent of the gold
 * brand: green >= 80, amber 60-79, red < 60. Pairs color with an icon so the
 * status is not conveyed by color alone (accessibility).
 *
 * `value` is a 0-100 percentage. Null/undefined renders a neutral dash.
 */
export function StatusBadge({ value }: { value: number | null | undefined }) {
  const band = completionBand(value);
  if (!band) {
    return <span className="text-[var(--on-surface-variant)]">—</span>;
  }

  const color = BAND_COLOR[band];
  const Icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element =
    band === "success" ? CheckIcon : band === "warning" ? FlatIcon : WarnIcon;
  const srLabel =
    band === "success" ? "on track" : band === "warning" ? "needs attention" : "underperforming";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon aria-hidden />
      {completionLabel(value)}<span className="sr-only"> {srLabel}</span>
    </span>
  );
}

/** Traffic-light progress bar, same thresholds and colors as StatusBadge. */
export function ProgressBar({ value }: { value: number | null | undefined }) {
  const band = completionBand(value);
  const pct = band === null ? 0 : Math.max(0, Math.min(100, value as number));
  const color = band ? BAND_COLOR[band] : "var(--brand-header-tint)";

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: "var(--brand-header-tint)" }}
      role="progressbar"
      aria-valuenow={band ? pct : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
