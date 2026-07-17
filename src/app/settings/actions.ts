"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SourceKey } from "./mappings";

const RPC: Record<SourceKey, string> = {
  drived: "admin_ingest_drived",
  product_fruits: "admin_ingest_product_fruits",
  lms: "admin_ingest_lms",
};

export type IngestResult = { ok: boolean; message: string };

export async function ingestRows(
  source: SourceKey,
  snapshotDate: string,
  rows: Record<string, string>[],
): Promise<IngestResult> {
  if (!snapshotDate) return { ok: false, message: "Please choose a snapshot date." };
  if (!rows || rows.length === 0) return { ok: false, message: "No rows to load." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC[source], {
    p_rows: rows,
    p_snapshot_date: snapshotDate,
  });

  if (error) return { ok: false, message: error.message };

  // Refresh the pages that read this data.
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  revalidatePath("/teachers");
  revalidatePath("/manage");

  // Drive Ed / Product Fruits return a { loaded, skipped, unmatched_schools }
  // summary (rows for other schools are skipped); LMS still returns a count.
  if (data && typeof data === "object" && "loaded" in data) {
    const loaded = Number((data as { loaded?: number }).loaded ?? 0);
    const skipped = Number((data as { skipped?: number }).skipped ?? 0);
    const unmatched = ((data as { unmatched_schools?: unknown }).unmatched_schools ?? []) as string[];

    let message = `Loaded ${loaded.toLocaleString()} row${loaded === 1 ? "" : "s"} for your schools.`;
    if (skipped > 0) {
      const names = unmatched.slice(0, 6).join(", ");
      const more = unmatched.length > 6 ? `, +${unmatched.length - 6} more` : "";
      message += ` Skipped ${skipped.toLocaleString()} row${skipped === 1 ? "" : "s"} from ${
        unmatched.length
      } other school${unmatched.length === 1 ? "" : "s"}${names ? ` (${names}${more})` : ""}.`;
    }
    return { ok: true, message };
  }

  const n = typeof data === "number" ? data : rows.length;
  return { ok: true, message: `Loaded ${n} row${n === 1 ? "" : "s"} into the dashboard.` };
}
