// Column-mapping config for each data source. The uploaded CSV's headers are
// normalized (lowercased, non-alphanumerics stripped) and matched against the
// alias lists below, so small header variations still map to the right field.

export type SourceKey = "drived" | "vimeo" | "product_fruits" | "lms";

export type SourceConfig = {
  key: SourceKey;
  label: string;
  description: string;
  /** canonical field -> accepted normalized header aliases */
  fields: Record<string, string[]>;
  required: string[];
};

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const SOURCES: Record<SourceKey, SourceConfig> = {
  drived: {
    key: "drived",
    label: "Drive Ed",
    description: "Daily per-school tenant usage counts (CSV, one row per school).",
    fields: {
      core_id: ["coreid", "core", "id", "tenantid", "drivedcoreid", "drivedid"],
      name: ["name", "school", "schoolname", "tenant", "tenantname"],
      users: ["users", "totalusers", "usercount"],
      invited: ["invited", "invites"],
      accepted: ["accepted"],
      logged: ["logged", "loggedin", "logins"],
      studied: ["studied", "studying"],
    },
    required: ["core_id"],
  },
  vimeo: {
    key: "vimeo",
    label: "Vimeo",
    description: "Per-school video engagement analytics (CSV).",
    fields: {
      source_url: ["sourceurl", "url", "source", "domain", "videourl", "page", "referrer"],
      views: ["views", "plays"],
      impressions: ["impressions"],
      unique_impressions: ["uniqueimpressions"],
      unique_viewers: ["uniqueviewers", "viewers"],
      total_time_watched_seconds: ["totaltimewatchedseconds", "totaltimewatched", "timewatched"],
      avg_time_watched_seconds: ["avgtimewatchedseconds", "averagetimewatched", "avgtimewatched"],
      avg_pct_watched: ["avgpctwatched", "averagepercentwatched", "avgpercentwatched", "percentwatched", "avgwatched"],
      finishes: ["finishes", "completes", "completions"],
      downloads: ["downloads"],
    },
    required: ["source_url"],
  },
  product_fruits: {
    key: "product_fruits",
    label: "Product Fruits",
    description: "Login / activity records (CSV, one row per user event).",
    fields: {
      email: ["email", "emailaddress", "useremail"],
      username: ["username", "user"],
      first_name: ["firstname", "first"],
      surname: ["surname", "lastname", "last"],
      full_name: ["fullname", "name"],
      event_datetime_raw: ["eventdatetime", "datetime", "date", "lastseen", "lastactivity", "timestamp", "logindate", "lastlogin"],
      user_role: ["userrole", "userroles", "roles", "role"],
      school_name: ["schoolname", "school"],
      product_type: ["producttype", "product"],
      billing_status: ["billingstatus", "billing", "status"],
    },
    required: ["email"],
  },
  lms: {
    key: "lms",
    label: "Lesson Progress (LMS)",
    description: "Scraped per-school lesson/course progress (CSV).",
    fields: {
      teacher_name: ["teachername", "teacher", "name"],
      course_name: ["coursename", "course", "title"],
      course_url: ["courseurl", "url", "link"],
      course_image: ["courseimage", "image", "thumbnail"],
      lessons_completed_raw: ["lessonscompleted", "lessons", "progress", "completed", "completion"],
    },
    required: ["teacher_name", "lessons_completed_raw"],
  },
};

export type MappedResult = {
  /** canonical field -> matched original header (or null if not found) */
  mapping: Record<string, string | null>;
  rows: Record<string, string>[];
  missingRequired: string[];
  totalRows: number;
};

/** Given parsed CSV (headers + row objects keyed by original header), map to canonical fields. */
export function mapRows(
  config: SourceConfig,
  headers: string[],
  rawRows: Record<string, unknown>[],
): MappedResult {
  const normToOriginal = new Map<string, string>();
  for (const h of headers) normToOriginal.set(norm(h), h);

  const mapping: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(config.fields)) {
    let found: string | null = null;
    // exact field-name match first, then aliases
    if (normToOriginal.has(norm(field))) found = normToOriginal.get(norm(field))!;
    else {
      for (const a of aliases) {
        if (normToOriginal.has(a)) {
          found = normToOriginal.get(a)!;
          break;
        }
      }
    }
    mapping[field] = found;
  }

  const rows = rawRows.map((raw) => {
    const out: Record<string, string> = {};
    for (const [field, original] of Object.entries(mapping)) {
      out[field] = original != null ? String(raw[original] ?? "").trim() : "";
    }
    return out;
  });

  const missingRequired = config.required.filter((f) => !mapping[f]);
  return { mapping, rows, missingRequired, totalRows: rows.length };
}
