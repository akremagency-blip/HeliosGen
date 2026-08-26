import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Node fields that belong to the owner's session and have no business reaching
 * anyone who opens a shared link.
 *
 * taskId is the provider's job id. It gets persisted into the saved space and
 * was returned verbatim here, so publishing a workflow — an advertised feature
 * — also published the ids that /api/job-status answers to. errorMsg can carry
 * raw provider error text.
 */
const PRIVATE_NODE_FIELDS = ["taskId", "errorMsg", "inputImage"] as const;

type LooseNode = { data?: Record<string, unknown> } & Record<string, unknown>;

function scrub(nodes: unknown): LooseNode[] {
  if (!Array.isArray(nodes)) return [];
  return (nodes as LooseNode[]).map((n) => {
    if (!n || typeof n !== "object" || !n.data) return n;
    const data = { ...n.data };
    for (const field of PRIVATE_NODE_FIELDS) delete data[field];
    return { ...n, data };
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("spaces")
    .select("id, name, data, is_public")
    .eq("id", id)
    .eq("is_public", true)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id:       data.id,
    name:     data.name,
    // Scrubbed on read rather than at save time, so spaces already published
    // with these fields stop leaking them too.
    nodes:    scrub(data.data?.nodes),
    edges:    data.data?.edges ?? [],
    viewport: data.data?.viewport ?? null,
  });
}
