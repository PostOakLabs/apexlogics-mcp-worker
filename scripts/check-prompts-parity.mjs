#!/usr/bin/env node
/**
 * scripts/check-prompts-parity.mjs — site↔worker prompt parity (AL-PROMPTS-MCP).
 *
 * data/prompts.json is a VENDOR of the site's mcp/showcase-prompts.json (the
 * ratified SSOT), refreshed by generate.mjs on every deploy. generate.mjs's
 * fallback path means the committed copy can silently go stale when the live
 * fetch fails on the one run where the site also changed — the exact hand-synced
 * second-copy drift this WU was told to prevent. This gate closes it: it
 * fetches the live site JSON and asserts the vendored copy is an exact content
 * match (count field, prompt ids in order, and every reader-facing field).
 *
 * Fetches are cache-busted and decoded as UTF-8 (SO 9: a bare fetch of a public
 * URL is not proof of live content — the edge can serve a stale HIT, including
 * a poisoned 404 from before a deploy lands, and the origin mis-states charset
 * on some paths; see generate.mjs).
 *
 * Network unreachable → exit 0 with a warning (same honesty contract as the
 * site-side check-chaingraph-parity.mjs: a gate must not red only because the
 * network blinked). ANY content mismatch → exit 1.
 *
 * Usage: node scripts/check-prompts-parity.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LIVE_URL = "https://apexlogics.org/mcp/showcase-prompts.json";
const TIMEOUT = Number(process.env.PARITY_TIMEOUT_MS ?? 15000);

async function fetchLiveJson() {
  const busted = `${LIVE_URL}?cb=${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const res = await fetch(busted, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return JSON.parse(new TextDecoder("utf-8").decode(await res.arrayBuffer()));
}

function promptFingerprint(p) {
  // Every field a prompt consumer renders or serves — byte-equal or it's drift.
  return JSON.stringify([
    p.id, p.title, p.one_line, p.doorways, p.arguments, p.body,
    p.verify_surface, p.group, p.requires, p.tools,
  ]);
}

const vendored = JSON.parse(readFileSync(join(ROOT, "data", "prompts.json"), "utf8"));

let live;
try {
  live = await fetchLiveJson();
} catch (e) {
  console.warn(`⚠ Cannot reach ${LIVE_URL}: ${e.message}`);
  console.warn("  Parity NOT asserted this run (network skip, same contract as check-chaingraph-parity).");
  process.exit(0);
}

const errors = [];

if ((live.count ?? live.prompts?.length) !== (vendored.count ?? vendored.prompts?.length)) {
  errors.push(`COUNT  live count=${live.count} (${live.prompts?.length} prompts) vs vendored count=${vendored.count} (${vendored.prompts?.length} prompts)`);
}

const livePrompts = live.prompts ?? [];
const vendoredPrompts = vendored.prompts ?? [];

if (livePrompts.length !== vendoredPrompts.length) {
  errors.push(`ARRAY  live has ${livePrompts.length} prompts, vendored has ${vendoredPrompts.length}`);
}

const orderless = new Set(livePrompts.map(promptFingerprint));
for (let i = 0; i < Math.min(livePrompts.length, vendoredPrompts.length); i++) {
  const v = vendoredPrompts[i];
  const l = livePrompts[i];
  if (v.id !== l.id) {
    errors.push(`ORDER  position ${i}: vendored id "${v.id}" vs live id "${l.id}"`);
    continue;
  }
  if (!orderless.has(promptFingerprint(v))) {
    errors.push(`DRIFT  prompt "${v.id}" content differs from live (title/one_line/body/arguments/tools or another field changed on the site)`);
  }
}

// The worker serves these fields; a broken vendor must not bundle silently.
for (const v of vendoredPrompts) {
  for (const f of ["id", "title", "one_line", "body", "group"]) {
    if (typeof v[f] !== "string" || !v[f].trim()) {
      errors.push(`SHAPE  vendored prompt ${v.id ?? "(missing id)"} has empty/missing "${f}"`);
    }
  }
  if (!Array.isArray(v.arguments)) {
    errors.push(`SHAPE  vendored prompt "${v.id}" has no arguments array`);
  }
}

if (errors.length) {
  errors.forEach((e) => console.error(e));
  console.error(`FAIL — data/prompts.json is out of parity with ${LIVE_URL}. Re-run generate.mjs and commit data/prompts.json.`);
  process.exit(1);
}

console.log(`OK — data/prompts.json matches live site catalog exactly: ${vendoredPrompts.length} prompts, ${vendored.count} count field, full content parity`);
