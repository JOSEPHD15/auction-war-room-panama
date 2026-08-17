// vinext build always writes a placeholder D1 binding (site-creator-d1 /
// 00000000-0000-4000-8000-000000000000) into dist/server/wrangler.json — that
// placeholder is meant to be swapped by the OpenAI Sites hosting platform's own
// deploy pipeline. Since we deploy straight to Cloudflare with `wrangler deploy`,
// nothing else performs that swap, so this script does it: it points the "DB"
// binding at the real auction-war-room-spectator D1 database before every deploy.
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG_PATH = "dist/server/wrangler.json";
const REAL_DATABASE_NAME = "auction-war-room-spectator";
const REAL_DATABASE_ID = "e382286d-c400-4d54-885a-e8980509f901";

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
config.d1_databases = (config.d1_databases || []).map((binding) =>
  binding.binding === "DB" ? { ...binding, database_name: REAL_DATABASE_NAME, database_id: REAL_DATABASE_ID } : binding
);
writeFileSync(CONFIG_PATH, JSON.stringify(config));
console.log(`Patched ${CONFIG_PATH}: DB -> ${REAL_DATABASE_NAME} (${REAL_DATABASE_ID})`);
