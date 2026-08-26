import { NextRequest, NextResponse } from "next/server";
import { UnsupportedMediaError } from "@/lib/mediaMetadata";
import { uploadBuffer } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GUEST_MODE, resolveUserId } from "@/lib/guestMode";
import * as guestDb from "@/lib/guest/db";
import { callerKey, rateLimit, tooMany } from "@/lib/rateLimit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Raw binary body — client sends the file bytes directly with Content-Type set to
    // the video MIME type. This avoids Next.js multipart/form-data parsing issues.
    const mimeType = req.headers.get("content-type") || "video/mp4";
    if (!mimeType.startsWith("video/")) {
      return NextResponse.json({ error: "Only video files are accepted" }, { status: 400 });
    }

    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
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
    const cdnUrl = await uploadBuffer(buffer, mimeType, "references");

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
          if (error) console.error("[upload-video] db insert error:", error.message);
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
    console.error("[upload-video]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
