import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), "hackbuddy-domain-tests-"));
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
try {
  const sources = ["domain", "tests"].flatMap((directory) =>
    readdirSync(directory)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => join(directory, file)),
  );
  process.exitCode = run([
    require.resolve("typescript/bin/tsc"),
    "--outDir",
    output,
    "--noEmit",
    "false",
    "--incremental",
    "false",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "ES2022",
    "--esModuleInterop",
    "true",
    "--skipLibCheck",
    ...sources,
  ]);
  if (!process.exitCode) {
    const tests = readdirSync(join(output, "tests"))
      .filter((file) => file.endsWith(".test.js"))
      .map((file) => join(output, "tests", file));
    process.exitCode = run(["--test", ...tests]);
    if (!process.exitCode) {
      const integrationTests = readdirSync("tests")
        .filter((file) => file.endsWith(".integration.cjs"))
        .map((file) => join("tests", file));
      process.exitCode = run([
        "--require",
        "./scripts/register-test-typescript.cjs",
        "--test",
        ...integrationTests,
      ]);
    }
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
