// course_url values are full URLs (with slashes/colons), so they can't be
// used directly as a single dynamic route segment. Base64url-encode them
// instead of hashing so the page can decode straight back to the RPC param.
export function encodeCourseKey(courseUrl: string): string {
  return Buffer.from(courseUrl, "utf8").toString("base64url");
}

export function decodeCourseKey(key: string): string | null {
  try {
    return Buffer.from(key, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
