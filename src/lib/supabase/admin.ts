import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for privileged server-only operations
 * (e.g. creating auth users). NEVER import this into client components.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the server environment.
 * Returns null when it isn't, so callers can surface a clear setup message
 * instead of crashing.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
