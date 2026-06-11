/**
 * generate.mjs — Pre-generates ./data/ fixtures from the live suite-registry.json.
 * Run before every deploy when tool catalog or workflows change:
 *   node generate.mjs && npx wrangler deploy
 */

import { writeFileSync, mkdirSync } from "fs";
import { WORKFLOWS } from "./pilot.mjs";

const REGISTRY_URL = "https://apexlogics.org/suite-registry.json";

console.log("Fetching suite-registry.json...");
const res = await fetch(REGISTRY_URL);
if (!res.ok) throw new Error(`Registry fetch failed: ${res.status} ${res.statusText}`);

const raw = await res.text();
// Parse defensively: if trailing garbage causes a parse error, truncate at the reported position
let registry;
try {
  registry = JSON.parse(raw);
} catch (e) {
  const pos = parseInt((e.message.match(/position (\d+)/) || [])[1]);
  if (!isNaN(pos)) {
    registry = JSON.parse(raw.substring(0, pos));
  } else {
    throw e;
  }
}

const tools = (registry.tools || []).map((t) => ({
  al_id: t.al_id,
  title: t.title,
  description: t.description || "",
  category: t.category || "",
  slug: t.slug,
  ap2_mandate_type: t.ap2_mandate_type || null,
  ap2_export: t.ap2_export || false,
}));

mkdirSync("./data", { recursive: true });

writeFileSync("./data/tools.json", JSON.stringify(tools, null, 2));
console.log(`✓ data/tools.json — ${tools.length} tools`);

writeFileSync("./data/workflows.json", JSON.stringify(WORKFLOWS, null, 2));
console.log(`✓ data/workflows.json — ${Object.keys(WORKFLOWS).length} workflow chains`);

console.log("\nDone. Deploy with: npx wrangler deploy");
