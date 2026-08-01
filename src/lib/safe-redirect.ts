/** Chỉ chấp nhận đường dẫn nội bộ, tránh open redirect. */
export function safeRedirect(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}
