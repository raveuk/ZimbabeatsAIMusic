// POST /api/training/jobs/[id]/cancel — SIGTERMs the trainer's Python
// child; escalates to SIGKILL after 8s if it's stuck. Marks the row
// 'cancelled' regardless. Returns the updated job.
import { json, handler, requireUser } from "../../../../../../lib/api.js";
import { db } from "../../../../../../lib/db.js";
import { cancelLoraJob, publicLoraJob } from "../../../../../../lib/training.js";

export const POST = handler(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = db.prepare("SELECT * FROM lora_jobs WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id);
  if (!row) return json({ error: "job not found" }, 404);
  if (row.status !== "running" && row.status !== "queued") {
    return json({ ok: true, job: publicLoraJob(row) });
  }
  await cancelLoraJob(row);
  const fresh = db.prepare("SELECT * FROM lora_jobs WHERE id = ?").get(row.id);
  return json({ ok: true, job: publicLoraJob(fresh) });
});
