import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const require = createRequire(import.meta.url);
const configPath = fileURLToPath(new URL("../config/index.ts", import.meta.url));

// A fresh process avoids dotenv's process.env mutations leaking between cases.
function checkConfig(root: string | undefined, legacy: string | undefined,
  expected: { host: string; port: number }, environment: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "data-board-env-"));
  try {
    if (root !== undefined) writeFileSync(join(cwd, ".env"), root);
    if (legacy !== undefined) {
      mkdirSync(join(cwd, "src"));
      writeFileSync(join(cwd, "src/.env"), legacy);
    }
    const env = { ...process.env };
    delete env.REDIS_HOST;
    delete env.REDIS_PORT;
    execFileSync(process.execPath, ["--require", require.resolve("tsx/cjs"), "-e",
      `const config = require(${JSON.stringify(configPath)}).default;
       require('node:assert/strict').deepEqual(
         {host: config.redis.host, port: config.redis.port}, ${JSON.stringify(expected)});`],
      { cwd, env: { ...env, ...environment }, stdio: "pipe" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("service environment setup", () => {
  it("loads the documented root file", () => checkConfig("REDIS_HOST=root\nREDIS_PORT=6381", undefined, { host: "root", port: 6381 }));
  it("supports a legacy file without a root file", () => checkConfig(undefined, "REDIS_HOST=legacy", { host: "legacy", port: 6379 }));
  it("preserves legacy values and fills missing values from root", () => checkConfig("REDIS_HOST=root\nREDIS_PORT=6381", "REDIS_HOST=legacy", { host: "legacy", port: 6381 }));
  it("preserves process environment precedence", () => checkConfig("REDIS_HOST=root", "REDIS_HOST=legacy", { host: "process", port: 6379 }, { REDIS_HOST: "process" }));
  it("retains defaults when neither file exists", () => checkConfig(undefined, undefined, { host: "localhost", port: 6379 }));
});
