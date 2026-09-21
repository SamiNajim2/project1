// Public Supabase settings. Both values are safe in the browser; access is enforced by RLS.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/projects"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
