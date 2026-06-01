import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a built-in; keep it external so Next doesn't try to bundle it.
  serverExternalPackages: ["node:sqlite"],
  // Pin the workspace root so Next ignores stray lockfiles elsewhere.
  outputFileTracingRoot: here,
};
export default nextConfig;
