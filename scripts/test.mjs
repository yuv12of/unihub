// Runs the unit tests (src/**/__tests__/*.test.ts) with Node's test runner; jiti strips the types
// and resolves the "@/…" alias. Usage: npm test
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = readdirSync(join(root, "src"), { recursive: true })
  .map(String)
  .filter((f) => /(__tests__[\\/].+|strategy|tracker)\.test\.ts$/.test(f))
  .map((f) => join("src", f));
const r = spawnSync(process.execPath, ["--import", "jiti/register", "--test", ...files], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, JITI_ALIAS: JSON.stringify({ "@/": join(root, "src") + "/" }), TZ: "UTC" },
});
process.exit(r.status ?? 1);
