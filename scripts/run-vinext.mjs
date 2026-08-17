import { spawnSync } from "node:child_process";
import { join } from "node:path";

const command = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "vinext.cmd" : "vinext");
const action = process.argv[2] || "dev";
const result = spawnSync(command, [action], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
