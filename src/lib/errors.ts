/**
 * A genuine backend fault (bad migration, transient DB issue) shouldn't leak
 * raw Postgres/Supabase error text -- which can include internal schema,
 * view, or column names -- to every authenticated role. A super-admin sees
 * the real message (useful for debugging); everyone else gets a generic one.
 */
export function safeErrorMessage(message: string, role: string | null | undefined): string {
  if (role === "super_admin") return message;
  return "Something went wrong loading this data. Please try again, or contact support if it persists.";
}
