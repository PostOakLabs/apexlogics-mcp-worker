/**
 * chain-freeze.mjs — chain-level composite-hash freeze (OCG §12 chain Compute Binding).
 *
 * run_chain composes kernel-backed nodes into a chain and emits a
 * composite_execution_hash over {composite_policy, composite_output} (deterministic:
 * per-step `now`/mandate_ids are excluded and inputs resolve from committed fixtures
 * or kernel defaults). This gate freezes that composite for every chain that runs at
 * least one kernel step, so a silent change to a kernel, a chain's node list, or the
 * gate/route logic is caught before deploy.
 *
 *   node scripts/chain-freeze.mjs            # verify: recompute vs the frozen goldens
 *   node scripts/chain-freeze.mjs --capture  # (re)write the goldens from the real run
 *
 * CI-STANDALONE: reads only worker-local files (data/chaingraph/chaingraph.json,
 * kernels/, data/chain-goldens.json) via run_chain. No ../repo, no ../AINumbers, no
 * network. --capture additionally mirrors the goldens into the repo copy when that
 * path exists locally (skipped silently in CI where ../repo is absent).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import runChain from '../run_chain.mjs';
import cg from '../data/chaingraph/chaingraph.json' with { type: 'json' };

const WORKER_GOLDEN = new URL('../data/chain-goldens.json', import.meta.url);
const REPO_GOLDEN = new URL('../../repo/chaingraph/chains/chain-goldens.json', import.meta.url);
const capture = process.argv.includes('--capture');

const names = (cg.chains || []).map((c) => c.name).sort();

// Run every chain; keep only those that execute >=1 kernel step (non-null composite).
async function runAll() {
  const out = {};
  for (const name of names) {
    const r = await runChain(name);
    if (r.composite_execution_hash) {
      out[name] = {
        composite_execution_hash: r.composite_execution_hash,
        steps_ran: r.steps_ran,
        step_tool_ids: r.steps.filter((s) => s.status === 'ok').map((s) => s.tool_id),
      };
    }
  }
  return out;
}

const live = await runAll();

if (capture) {
  const body = JSON.stringify({
    _note: 'OCG §12 chain composite-hash freeze. Regenerate: node scripts/chain-freeze.mjs --capture. Verified by chain-freeze.mjs (deploy.yml gate).',
    chains: live,
  }, null, 2) + '\n';
  writeFileSync(WORKER_GOLDEN, body);
  console.log(`✓ captured ${Object.keys(live).length} chain composites → data/chain-goldens.json`);
  if (existsSync(REPO_GOLDEN)) { writeFileSync(REPO_GOLDEN, body); console.log('✓ mirrored → repo/chaingraph/chains/chain-goldens.json'); }
  else { console.log('· repo copy not present (CI) — skipped mirror'); }
  process.exit(0);
}

// ── verify ──
if (!existsSync(WORKER_GOLDEN)) {
  console.error('✗ CHAIN-FREEZE: no data/chain-goldens.json — run: node scripts/chain-freeze.mjs --capture');
  process.exit(1);
}
const frozen = JSON.parse(readFileSync(WORKER_GOLDEN, 'utf8')).chains || {};
const problems = [];
for (const name of Object.keys(frozen)) {
  const f = frozen[name];
  const l = live[name];
  if (!l) { problems.push(`${name}: frozen chain no longer produces a composite (steps_ran=0)`); continue; }
  if (l.composite_execution_hash !== f.composite_execution_hash) {
    problems.push(`${name}: composite ${l.composite_execution_hash.slice(0, 12)}… != frozen ${f.composite_execution_hash.slice(0, 12)}… (re-capture if intended)`);
  }
}
// A newly-runnable chain that isn't frozen is a drift signal too (kernel/fixture added).
for (const name of Object.keys(live)) {
  if (!frozen[name]) problems.push(`${name}: now runs a kernel step but is not frozen — re-capture`);
}

if (problems.length) {
  console.error('✗ CHAIN-FREEZE: composite-hash drift:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ CHAIN-FREEZE: all ${Object.keys(frozen).length} chain composites recompute exactly.`);
