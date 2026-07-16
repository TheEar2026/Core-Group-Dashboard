"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { mapRows, type SourceConfig, type MappedResult } from "./mappings";
import { ingestRows, type IngestResult } from "./actions";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function UploadCard({ config }: { config: SourceConfig }) {
  const [snapshot, setSnapshot] = useState(todayISO());
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<MappedResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function applyPreview(headers: string[], rows: Record<string, unknown>[]) {
    if (headers.length === 0) {
      setParseError("Couldn't read any columns from that file. Is there a header row?");
      return;
    }
    setPreview(mapRows(config, headers, rows));
  }

  function handleFile(file: File) {
    setResult(null);
    setParseError(null);
    setPreview(null);
    setFileName(file.name);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      // Excel: parse the first sheet with SheetJS (dynamically imported so it
      // only loads when an Excel file is actually chosen).
      file
        .arrayBuffer()
        .then(async (buf) => {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) {
            setParseError("That workbook has no sheets.");
            return;
          }
          const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
          const headers = ((aoa[0] as unknown[]) ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
          applyPreview(headers, rows);
        })
        .catch((e) => setParseError(e instanceof Error ? e.message : "Couldn't read that Excel file."));
      return;
    }

    // CSV
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => applyPreview(res.meta.fields ?? [], res.data),
      error: (err) => setParseError(err.message),
    });
  }

  function reset() {
    setPreview(null);
    setFileName(null);
    setResult(null);
    setParseError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function load() {
    if (!preview) return;
    startTransition(async () => {
      const r = await ingestRows(config.key, snapshot, preview.rows);
      setResult(r);
      if (r.ok) reset();
    });
  }

  const fields = Object.keys(config.fields);

  return (
    <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface)] p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{config.label}</h2>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: "var(--brand-gold)", backgroundColor: "color-mix(in srgb, var(--brand-gold) 12%, transparent)" }}>
          CSV / Excel
        </span>
      </div>
      <p className="mb-4 text-sm text-[var(--on-surface-variant)]">{config.description}</p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]" htmlFor={`date-${config.key}`}>
            Snapshot date
          </label>
          <input
            id={`date-${config.key}`}
            type="date"
            value={snapshot}
            onChange={(e) => setSnapshot(e.target.value)}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-gold)]"
          />
        </div>
        <label className="cursor-pointer rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium transition-all hover:bg-[var(--brand-bg)]">
          {fileName ? "Choose a different file" : "Choose file"}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        {fileName && <span className="text-sm text-[var(--on-surface-variant)]">{fileName}</span>}
      </div>

      {parseError && (
        <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ color: "var(--status-danger)", backgroundColor: "color-mix(in srgb, var(--status-danger) 10%, transparent)" }}>
          {parseError}
        </p>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          {/* Column mapping */}
          <div className="rounded-lg border border-[var(--brand-border)] p-3 text-[13px]">
            <p className="mb-2 font-semibold">
              {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} · column mapping
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {fields.map((f) => {
                const matched = preview.mapping[f];
                const isReq = config.required.includes(f);
                return (
                  <div key={f} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--on-surface-variant)]">
                      {f}
                      {isReq && <span style={{ color: "var(--status-danger)" }}> *</span>}
                    </span>
                    <span style={{ color: matched ? "var(--status-success)" : "var(--on-surface-variant)" }}>
                      {matched ? `← ${matched}` : "— not found"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {preview.missingRequired.length > 0 && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ color: "var(--status-danger)", backgroundColor: "color-mix(in srgb, var(--status-danger) 10%, transparent)" }}>
              Missing required column(s): {preview.missingRequired.join(", ")}. Rename them in the file or check it&apos;s the right export.
            </p>
          )}

          {/* Sample preview */}
          <div className="overflow-x-auto rounded-lg border border-[var(--brand-border)]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr style={{ backgroundColor: "var(--brand-header-tint)" }}>
                  {fields.map((f) => (
                    <th key={f} className="whitespace-nowrap px-2 py-1.5 font-semibold text-[var(--on-surface-variant)]">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--brand-border)]">
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {fields.map((f) => (
                      <td key={f} className="whitespace-nowrap px-2 py-1.5">{row[f] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={pending || preview.missingRequired.length > 0}
            className="rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--brand-gold-hover)] active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? "Loading…" : `Load ${preview.totalRows} rows`}
          </button>
        </div>
      )}

      {result && (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-sm"
          style={{
            color: result.ok ? "var(--status-success)" : "var(--status-danger)",
            backgroundColor: `color-mix(in srgb, ${result.ok ? "var(--status-success)" : "var(--status-danger)"} 10%, transparent)`,
          }}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
