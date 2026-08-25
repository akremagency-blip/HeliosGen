import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// File-based (not in-memory) so state survives Next.js dev's module reloads —
// same pattern as lib/jobStore.ts.
export type CodexLoginState =
  | { status: "idle" }
  | { status: "pending"; url: string; code: string; startedAt: number }
  | { status: "success" }
  | { status: "error"; error: string };

const FILE = join(tmpdir(), "heliosgen-codex-login.json");

function read(): CodexLoginState {
  if (!existsSync(FILE)) return { status: "idle" };
  try { return JSON.parse(readFileSync(FILE, "utf8")); }
  catch { return { status: "idle" }; }
}

function write(state: CodexLoginState): void {
  writeFileSync(FILE, JSON.stringify(state), "utf8");
}

export const codexLoginStore = {
  get: read,
  set: write,
};
