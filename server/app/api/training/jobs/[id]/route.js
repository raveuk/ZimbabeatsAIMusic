// GET /api/training/jobs/[id] — poll a training job. Returns the latest
// status, current/total step, last loss, and a tail of stdout/stderr.
//
// Calls refreshLoraJob which side-effect updates the DB row from log
// tailing + pid liveness checks. Idempotent — calling multiple times
// just re-reads the log.
import { json, handler, requireUser } from "../../../../../lib/api.js";
import { db } from "../../../../../lib/db.js";
import { refreshLoraJob, publicLoraJob } from "../../../../../lib/training.js";

export const GET = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM lora_jobs WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!row) return json({ error: "job not found" }, 404);
  const fresh = refreshLoraJob(row);
  return json({ job: publicLoraJob(fresh, { withLog: true }) });
});
