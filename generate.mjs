/**
 * generate.mjs — Pre-generates ./data/ fixtures from the live suite-registry.json.
 * Run before every deploy when tool catalog or workflows change:
 *   node generate.mjs && npx wrangler deploy
 *
 * Resilience: retries up to 4 times with exponential backoff on transient errors
 * (429, 5xx, network). Falls back to the committed data/tools.json if all retries
 * fail — so a rate-limit spike never blocks a CI deploy that has fresh committed
 * fixtures.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { WORKFLOWS } from "./pilot.mjs";

const REGISTRY_URL = "https://apexlogics.org/suite-registry.json";
const PROMPTS_URL = "https://apexlogics.org/mcp/showcase-prompts.json";
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

// SO 9 (STANDING-ORDERS): a bare fetch of a public URL is NOT proof of live
// content — Cloudflare's edge can serve a stale HIT, including a poisoned 404
// cached from before a deploy lands (the purge step is a no-op until
// CF_API_TOKEN exists, AL-CDNPURGE). Every live fetch here cache-busts so the
// origin, not some edge's memory, answers the question.
function cacheBust(url) {
  return `${url}?cb=${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// JSON is UTF-8 by RFC 8259. Decode the bytes explicitly instead of trusting
// res.text(): the origin serves charset=iso-8859-1 on some paths, and latin-1
// decoding mojibakes every em-dash / section-sign in tool copy (surfaced by
// AL-PROMPTS-MCP's vendored prompts fetch; see data/tools.json history).
async function fetchJsonText(url) {
  const res = await fetchWithRetry(url);
  return new TextDecoder("utf-8").decode(await res.arrayBuffer());
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1); // 2s, 4s, 8s, 16s
      console.log(`  Retrying in ${delay / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Registry fetch failed: ${res.status} ${res.statusText}`);
        console.warn(`  HTTP ${res.status} — will retry`);
        continue;
      }
      if (!res.ok) throw new Error(`Registry fetch failed: ${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      lastErr = e;
      console.warn(`  Fetch error: ${e.message}`);
    }
  }
  throw lastErr;
}

function parseRegistry(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Defensive: if trailing garbage causes parse error, truncate at reported position
    const pos = parseInt((e.message.match(/position (\d+)/) || [])[1]);
    if (!isNaN(pos)) return JSON.parse(raw.substring(0, pos));
    throw e;
  }
}

mkdirSync("./data", { recursive: true });

let tools;

console.log("Fetching suite-registry.json...");
try {
  const raw = await fetchJsonText(cacheBust(REGISTRY_URL));
  const registry = parseRegistry(raw);
  tools = (registry.tools || []).map((t) => ({
    al_id: t.al_id,
    title: t.title,
    description: t.description || "",
    category: t.category || "",
    slug: t.slug,
    // AL-REGISTRY-TRUTH (2026-10-02): the registry now carries display_number on
    // all 296 rows (single field, legacy display_num consolidated), plus
    // data_vintage and sister_suite. Project them so list_apexlogics_tools and
    // find_tool serve the corrected fields instead of a stale 7-field shape.
    display_number: t.display_number ?? null,
    data_vintage: t.data_vintage ?? null,
    sister_suite: t.sister_suite ?? null,
    // Registry field is ap2_mandate_types (plural array); the singular read here
    // shipped an all-null catalog to agents until caught 2026-09-24
    // (ROOT-CAUSE-REVIEW-2026-09-24, RC-3). Serve the primary (first) type.
    ap2_mandate_type: Array.isArray(t.ap2_mandate_types) && t.ap2_mandate_types.length > 0 ? t.ap2_mandate_types[0] : null,
    ap2_export: t.ap2_export || false,
  }));
  console.log(`✓ Fetched ${tools.length} tools from live registry`);
} catch (e) {
  // Fall back to committed fixture so a rate-limit spike doesn't break the deploy
  const fallbackPath = "./data/tools.json";
  if (existsSync(fallbackPath)) {
    console.warn(`\n⚠  Registry unreachable after retries: ${e.message}`);
    console.warn(`   Falling back to committed ${fallbackPath} — fixtures may be stale.`);
    tools = JSON.parse(readFileSync(fallbackPath, "utf8"));
    console.warn(`   Using ${tools.length} tools from committed fixture.\n`);
  } else {
    throw new Error(
      `Registry fetch failed and no fallback fixture exists at ${fallbackPath}.\n` +
        `Run 'node generate.mjs' locally and commit data/tools.json first.\n` +
        `Original error: ${e.message}`
    );
  }
}

// RC-3 (ROOT-CAUSE-REVIEW-2026-09-24): the all-null mandate-type catalog must fail
// the generate step, not deploy. Applies to the fallback path too — a stale fixture
// that fails this check should block the deploy, not ship silently.
const withMandateType = tools.filter((t) => t.ap2_mandate_type).length;
if (tools.length > 0 && withMandateType / tools.length < 0.99) {
  throw new Error(
    `Mandate-type mapping regression: only ${withMandateType}/${tools.length} rows ` +
      `have a non-null ap2_mandate_type (expected >=99%). generate.mjs must read ` +
      `ap2_mandate_types[] (plural) from the registry — refusing to write fixtures.`
  );
}

writeFileSync("./data/tools.json", JSON.stringify(tools, null, 2));
console.log(`✓ data/tools.json — ${tools.length} tools`);

writeFileSync("./data/workflows.json", JSON.stringify(WORKFLOWS, null, 2));
console.log(`✓ data/workflows.json — ${Object.keys(WORKFLOWS).length} workflow chains`);

// ── prompts.json (AL-PROMPTS-MCP) ────────────────────────────────────────────
// Vendored VERBATIM from the site's mcp/showcase-prompts.json (the ratified
// SSOT, gated by repo scripts/check-prompts-json.mjs over there). The worker
// never hand-syncs prompt text: generate.mjs re-fetches at every deploy, the
// committed copy is only a fallback, and scripts/check-prompts-parity.mjs
// asserts committed-vs-live parity in CI.
let promptsDoc;

console.log("Fetching showcase-prompts.json...");
try {
  promptsDoc = parseRegistry(await fetchJsonText(cacheBust(PROMPTS_URL)));
  if (!Array.isArray(promptsDoc.prompts) || promptsDoc.prompts.length === 0) {
    throw new Error("live showcase-prompts.json has no prompts[] array");
  }
  console.log(`✓ Fetched ${promptsDoc.prompts.length} prompts from live site`);
} catch (e) {
  // Same fallback contract as tools.json: a transient site outage never blocks
  // the deploy; the committed fixture keeps the last-known-good catalog.
  const fallbackPath = "./data/prompts.json";
  if (existsSync(fallbackPath)) {
    console.warn(`\n⚠  Showcase-prompts fetch failed after retries: ${e.message}`);
    console.warn(`   Falling back to committed ${fallbackPath} — fixture may be stale.`);
    promptsDoc = JSON.parse(readFileSync(fallbackPath, "utf8"));
    console.warn(`   Using ${promptsDoc.prompts.length} prompts from committed fixture.\n`);
  } else {
    throw new Error(
      `Showcase-prompts fetch failed and no fallback fixture exists at ${fallbackPath}.\n` +
        `Run 'node generate.mjs' locally and commit data/prompts.json first.\n` +
        `Original error: ${e.message}`
    );
  }
}

writeFileSync("./data/prompts.json", JSON.stringify(promptsDoc, null, 2));
console.log(`✓ data/prompts.json — ${promptsDoc.prompts.length} prompts (count field: ${promptsDoc.count})`);

console.log("\nDone. Deploy with: npx wrangler deploy");
