import { NextRequest, NextResponse } from "next/server";
import { getKieToken } from "@/lib/getKieToken";

export async function GET(req: NextRequest) {
  const apiKey = await getKieToken(req);
  if (!apiKey) return NextResponse.json({ error: "No Kie.ai API key configured. Add one in Settings." }, { status: 401 });

  const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 60 },
  });

  if (!res.ok) return NextResponse.json({ error: "Failed to fetch credit" }, { status: res.status });

  const data = await res.json();

  // kie.ai answers 200 even when it rejects the key — the real status is in
  // body.code. Passing that straight through left CreditBalance reading
  // data.data as undefined, so an expired key just made the balance vanish.
  if (data?.code !== undefined && data.code !== 200) {
    const status = data.code === 401 || data.code === 403 ? 401 : 502;
    return NextResponse.json({ error: data.msg ?? "Kie.ai rejected the request" }, { status });
  }

  return NextResponse.json(data);
}
