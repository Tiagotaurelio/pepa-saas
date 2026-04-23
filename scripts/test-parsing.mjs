#!/usr/bin/env node
/**
 * Wrapper: runs the TypeScript test runner via tsx.
 * Usage: node scripts/test-parsing.mjs
 *    or: npx tsx scripts/test-parsing-runner.ts
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const runner = join(__dirname, "test-parsing-runner.ts");

try {
  execFileSync("npx", ["tsx", runner], {
    cwd: join(__dirname, ".."),
    stdio: "inherit",
    timeout: 300000,
  });
} catch (e) {
  process.exit(1);
}
