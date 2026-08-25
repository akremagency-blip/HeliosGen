import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export type JobResult =
  | { status: "pending"; type?: "image" | "video"; userId?: string }
  | { status: "done"; imageUrl?: string; imageUrls?: string[]; videoUrl?: string }
  | { status: "error"; error: string };

// tmpdir, not cwd: the app bundle is read-only on Vercel/Lambda, and writeFileSync
// there threw inside the callback's promise chain — silently stranding every job
// as "pending". This is only a cache; job-status falls back to the DB on a miss.
// ponytail: per-instance, so a multi-replica deploy just misses more often and
// re-reads the DB. Move to Redis only if that read volume ever shows up.
const FILE = join(tmpdir(), "heliosgen-job-store.json");

function read(): Record<string, JobResult> {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, "utf8")); }
  catch { return {}; }
}

function write(data: Record<string, JobResult>): void {
  writeFileSync(FILE, JSON.stringify(data), "utf8");
}

export const jobStore = {
  get(taskId: string): JobResult | undefined {
    return read()[taskId];
  },
  set(taskId: string, result: JobResult): void {
    const data = read();
    data[taskId] = result;
    write(data);
  },
};
