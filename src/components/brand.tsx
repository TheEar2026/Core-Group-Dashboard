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
 * Completion / watch-% badge. Traffic-light palette, independent of the gold
 * brand: green >= 80, amber 60-79, red < 60. Pairs color with an icon so the
 * status is not conveyed by color alone (accessibility).
 *
 * `value` is a 0-100 percentage. Null/undefined renders a neutral dash.
 */
export function StatusBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="text-[var(--on-surface-variant)]">—</span>;
  }

  const pct = Math.round(value);
  let color: string;
  let Icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element;
  let srLabel: string;

  if (pct >= 80) {
    color = "var(--status-success)";
    Icon = CheckIcon;
    srLabel = "on track";
  } else if (pct >= 60) {
    color = "var(--status-warning)";
    Icon = FlatIcon;
    srLabel = "needs attention";
  } else {
    color = "var(--status-danger)";
    Icon = WarnIcon;
    srLabel = "underperforming";
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon aria-hidden />
      {pct}%<span className="sr-only"> {srLabel}</span>
    </span>
  );
}

/** Traffic-light progress bar, same thresholds as StatusBadge. */
export function ProgressBar({ value }: { value: number | null | undefined }) {
  const pct =
    value === null || value === undefined || Number.isNaN(value)
      ? 0
      : Math.max(0, Math.min(100, value));

  const color =
    pct >= 80
      ? "var(--status-success)"
      : pct >= 60
        ? "var(--status-warning)"
        : "var(--status-danger)";

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: "var(--brand-header-tint)" }}
      role="progressbar"
      aria-valuenow={pct}
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
