/**
 * POST /api/upload-asset
 *
 * Unified raw-binary upload for images and videos.
 * Body  : raw file bytes
 * Headers:
 *   Content-Type  : MIME type of the file (image/jpeg, video/mp4, …)
 *   Authorization : Bearer <supabase-token>  (optional)
 *
 * Flow:
 *   1. Read body as Buffer
 *   2. Deduplication happens inside uploadBuffer (lib/r2.ts)
 *   3. Record in user_uploads if authenticated
 *   4. Return CDN URL
 */
import { NextRequest, NextResponse } from "next/server";
import { UnsupportedMediaError } from "@/lib/mediaMetadata";
import { uploadBuffer } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GUEST_MODE, resolveUserId } from "@/lib/guestMode";
import * as guestDb from "@/lib/guest/db";
import { callerKey, rateLimit, tooMany } from "@/lib/rateLimit";

export const maxDuration = 60;

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  try {
    const mimeType = req.headers.get("content-type") ?? "application/octet-stream";

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 100 MB limit" }, { status: 413 });
    }

    const bytes  = await req.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 100 MB limit" }, { status: 413 });
    }

    // The upload ran before the session was consulted, and the session only
    // decided whether to record the row — so an anonymous caller could write
    // into the bucket at will. Gate first, upload second.
    const userId = await resolveUserId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const gate = rateLimit(callerKey(req, userId) + ":upload", 90, 60_000);
    if (!gate.ok) return tooMany(gate) as unknown as NextResponse;

    // ── Upload to R2 (Deduplication happens inside uploadBuffer) ──────────────
    const folder  = mimeType.startsWith("video/") ? "references" : "uploads";
    const cdnUrl  = await uploadBuffer(buffer, mimeType, folder);

    {
      if (GUEST_MODE) {
        guestDb.insertUpload({ user_id: userId, r2_url: cdnUrl, mime_type: mimeType, source: "user_upload" });
      } else {
        supabaseAdmin.from("user_uploads").insert({
          user_id:   userId,
          r2_url:    cdnUrl,
          mime_type: mimeType,
          source:    "user_upload",
        }).then(({ error }) => {
          if (error) console.error("[upload-asset] db insert error:", error.message);
        });
      }
    }

    return NextResponse.json({ cdnUrl });
  } catch (e: unknown) {
    if (e instanceof UnsupportedMediaError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // The raw message is an internal detail — ffmpeg's includes the temp
    // path it was handed. Log it, return something the user can act on.
    console.error("[upload-asset]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
