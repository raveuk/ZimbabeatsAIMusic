// GET /api/training/jobs — list the caller's training jobs, optionally
// filtered by ?status= and ?kind=. Newest first. Used for the "Trained
// LoRAs" list on the Export tab + history view on the Train tab.
import { json, handler, requireUser } from "../../../../lib/api.js";
import { db } from "../../../../lib/db.js";
import { publicLoraJob, refreshLoraJob } from "../../../../lib/training.js";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const kind   = url.searchParams.get("kind");

  const where = ["user_id = ?"];
  const params = [user.id];
  if (status) { where.push("status = ?"); params.push(status); }
  if (kind)   { where.push("kind = ?");   params.push(kind); }
  const sql = `SELECT * FROM lora_jobs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 200`;
  const rows = db.prepare(sql).all(...params);
  // Refresh any 'running' rows in place — cheap log tail, idempotent.
  const refreshed = rows.map((r) => r.status === "running" ? refreshLoraJob(r) : r);
  return json({ jobs: refreshed.map((r) => publicLoraJob(r)) });
});
