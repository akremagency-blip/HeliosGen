import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

/**
 * The file was not decodable. Carries no detail from the decoder: ffmpeg
 * reports failure by echoing the whole command, which includes the temp
 * paths we just wrote the upload to.
 */
export class UnsupportedMediaError extends Error {
  constructor(message = "Unsupported or corrupt media file") {
    super(message);
    this.name = "UnsupportedMediaError";
  }
}

/** Strip EXIF/IPTC/XMP (images) or metadata tags (video) from a buffer before storage. */
export async function stripMetadata(buffer: Buffer, contentType: string): Promise<Buffer> {
  if (contentType.startsWith("image/")) {
    try {
      return await sharp(buffer).toBuffer();
    } catch {
      throw new UnsupportedMediaError("Unsupported or corrupt image file");
    }
  }
  if (contentType.startsWith("video/")) {
    const extension = contentType.includes("webm") ? "webm" : "mp4";
    const tmpDir = await mkdtemp(join(tmpdir(), "strip-meta-"));
    const inputPath  = join(tmpDir, `input.${extension}`);
    const outputPath = join(tmpDir, `output.${extension}`);
    try {
      await writeFile(inputPath, buffer);
      try {
        await execFileAsync("ffmpeg", [
          "-i", inputPath,
          "-map_metadata", "-1",
          "-c", "copy",
          "-y", outputPath,
        ]);
      } catch {
        // Storing the original instead would keep the GPS tags this exists
        // to remove, so an unreadable file is refused rather than passed on.
        throw new UnsupportedMediaError("Unsupported or corrupt video file");
      }
      return await readFile(outputPath);
    } finally {
      await Promise.all([
        unlink(inputPath).catch(() => {}),
        unlink(outputPath).catch(() => {}),
      ]);
    }
  }
  return buffer;
}
