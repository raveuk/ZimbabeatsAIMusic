import { json, handler } from "../../../lib/api.js";
import { listVoices } from "../../../lib/voices.js";
import { cloneAvailable } from "../../../lib/workflow.js";

// Public: the trained voices the app can offer + whether cloning is wired up.
// `enabled` is true only when BOTH a voice model exists and the clone workflow
// is configured, so the app hides the feature until setup is complete.
export const GET = handler(async () => {
  const voices = listVoices();
  return json({ enabled: cloneAvailable() && voices.length > 0, voices });
});
