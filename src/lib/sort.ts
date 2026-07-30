/**
 * Comparator for table sorting where a missing value (null) always sorts to
 * the end, regardless of ascending/descending direction. Without this, a
 * numeric fallback like `?? -1` only sorts "no data" last when ascending —
 * flip the arrow and "no data" jumps to the front, reading as the worst
 * performer rather than as unknown.
 */
export function compareNullsLast<T extends number | string>(
  av: T | null,
  bv: T | null,
  asc: boolean,
): number {
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av < bv) return asc ? -1 : 1;
  if (av > bv) return asc ? 1 : -1;
  return 0;
}
