const WIDTH = 1000;
const HEIGHT = 220;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export type Series = {
  label: string;
  color: string;
  values: (number | null)[];
};

function fmtAxisDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Minimal dependency-free SVG line/area chart. Handles sparse data (as few
 * as one point) without dividing by zero. `area` fills under the chart when
 * there's exactly one series.
 */
export function TrendChart({
  dates,
  series,
  area = false,
  valueSuffix = "",
}: {
  dates: string[];
  series: Series[];
  area?: boolean;
  valueSuffix?: string;
}) {
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const maxY = allValues.length > 0 ? Math.max(...allValues, 1) : 1;
  const niceMax = Math.ceil(maxY * 1.1);

  const n = dates.length;
  const x = (i: number) => (n <= 1 ? PAD_LEFT + plotW / 2 : PAD_LEFT + (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_TOP + plotH - (v / niceMax) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  // x-axis labels: show all if few, else first/middle/last
  const labelIndices =
    n <= 5 ? dates.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Trend chart">
      {/* gridlines + y labels */}
      {gridLines.map((f) => {
        const val = niceMax * f;
        const yy = PAD_TOP + plotH - f * plotH;
        return (
          <g key={f}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yy}
              y2={yy}
              stroke="var(--brand-border)"
              strokeWidth={1}
            />
            <text x={0} y={yy + 4} fontSize={10} fill="var(--on-surface-variant)">
              {Math.round(val)}
              {valueSuffix}
            </text>
          </g>
        );
      })}

      {/* series */}
      {series.map((s) => {
        const points = s.values
          .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
          .filter((p): p is string => p !== null);

        if (points.length === 0) return null;

        return (
          <g key={s.label}>
            {area && series.length === 1 && (
              <polygon
                points={`${PAD_LEFT},${PAD_TOP + plotH} ${points.join(" ")} ${x(n - 1)},${PAD_TOP + plotH}`}
                fill={s.color}
                fillOpacity={0.12}
                stroke="none"
              />
            )}
            <polyline points={points.join(" ")} fill="none" stroke={s.color} strokeWidth={2} />
            {s.values.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />
              ),
            )}
          </g>
        );
      })}

      {/* x-axis labels */}
      {labelIndices.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={HEIGHT - 6}
          fontSize={10}
          textAnchor="middle"
          fill="var(--on-surface-variant)"
        >
          {fmtAxisDate(dates[i])}
        </text>
      ))}
    </svg>
  );
}

export function ChartLegend({ series }: { series: { label: string; color: string }[] }) {
  if (series.length <= 1) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-3">
      {series.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-[var(--on-surface-variant)]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
