import type { NextRequest } from "next/server";

export const GUEST_MODE = process.env.GUEST_MODE === "true";
export const GUEST_USER_ID = "guest";

/**
 * GUEST_USER_ID in guest mode, otherwise the Supabase user id.
 *
 * Accepts either the Authorization header most callers send, or the cookie
 * session @supabase/ssr already maintains. The cookie path is what lets
 * /api/job-stream authenticate at all: it is consumed by EventSource, which
 * cannot set request headers.
 */
export async function resolveUserId(req: NextRequest): Promise<string | null> {
  if (GUEST_MODE) return GUEST_USER_ID;

  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const { supabaseAdmin } = await import("./supabase/admin");
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user?.id) return data.user.id;
  }

  try {
    const { createClient } = await import("./supabase/server");
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    // cookies() throws outside a request scope
    return null;
  }
}
