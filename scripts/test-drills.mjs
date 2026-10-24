// Runs src/lib/drills/drills.test.ts without extra dependencies: transpiles the drill modules
// (and src/lib/practice.ts) with the project's TypeScript into a temp folder, then runs node:test.
//   node scripts/test-drills.mjs
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "drills-"));
const files = ["fraction", "rng", "ds", "linalg", "calc", "drills.test"].map((f) => `src/lib/drills/${f}.ts`).concat("src/lib/practice.ts");
for (const f of files) {
  const src = readFileSync(join(root, f), "utf8");
  let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace(/from "(\.{1,2}\/[^"]+)"/g, (_, p) => `from "${p}.mjs"`);
  const dest = join(out, f.replace(/\.ts$/, ".mjs"));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, js);
}
const r = spawnSync(process.execPath, ["--test", join(out, "src/lib/drills/drills.test.mjs")], { stdio: "inherit" });
process.exit(r.status ?? 1);
