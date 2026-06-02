// ffprobe wrapper — given an absolute audio file path, returns its duration in
// seconds (float) or null if ffprobe can't read it. Used by the Extend task
// (Phase 5) so the workflow knows where to splice the new generation in.
import { execFile } from "node:child_process";

export function probeDuration(absPath) {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        absPath,
      ],
      { timeout: 10_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const n = parseFloat(String(stdout).trim());
        resolve(Number.isFinite(n) && n > 0 ? n : null);
      },
    );
  });
}
