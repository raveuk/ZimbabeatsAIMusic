import { json, handler } from "../../../lib/api.js";
import { OPTIONS, DEFAULTS } from "../../../lib/workflow.js";

// Static config for the app's pickers (languages, keys, time signatures) plus
// the workflow defaults. Public — nothing sensitive here.
export const GET = handler(async () => json({ options: OPTIONS, defaults: DEFAULTS }));
