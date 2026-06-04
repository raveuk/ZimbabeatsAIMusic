// POST /api/musicvideo/upload-image — multipart upload of a reference image
// the Wan 2.2 S2V workflow will animate. Stages into ComfyUI/input/ via the
// existing uploads infra (so cleanup TTL applies). 8 MB cap.
import { json, handler, requireUser } from "../../../../lib/api.js";
import { stageImageBuffer } from "../../../../lib/uploads.js";

const MAX_BYTES = 8 * 1024 * 1024;

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "missing file" }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return json({ error: "empty file" }, 400);
  if (buf.length > MAX_BYTES) return json({ error: `image too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, 413);

  try {
    const { uploadId, filename } = stageImageBuffer({
      buf, userId: user.id,
      originalName: file.name || null, mime: file.type || null,
    });
    return json({ uploadId, filename, sizeBytes: buf.length });
  } catch (e) {
    return json({ error: e.message || "upload failed" }, e.status || 500);
  }
});
