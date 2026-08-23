#!/usr/bin/env node
/**
 * validate-chains.mjs — ApexLogics chain integrity gate (OCG §15 + §21.4).
 *
 * CI-STANDALONE: reads only worker-local files (data/chaingraph/chaingraph.json,
 * data/chain-branch-fixtures.json, kernels/, run_chain.mjs). No ../repo, no network.
 *
 * THREE LAYERS:
 *   L1 — every chain has a unique name + non-empty steps[]; every step tool_id
 *        resolves to a nodes[] entry.
 *   L2 — OCG §21.4 static decision-gate validation (validateChainGates): pointer
 *        syntax, closed op enum, forward-only acyclic targets, reachability,
 *        mandatory default. No-op for linear chains.
 *   L3 — LIVE branch coverage: every GATED chain must ship a chain-branch-fixtures
 *        scenario set that drives EVERY gate branch (each rule + default). Each
 *        scenario is run through the real run_chain loop; the union of decisions[]
 *        must leave coverageGaps == []. Each scenario's realized `next` must also
 *        equal its declared expect_next. A gated chain with no fixtures, or a
 *        fixture set that misses a branch, is an ERROR.
 *
 * Exit 1 on any error, else 0.
 */
import runChain from '../run_chain.mjs';
import cg from '../data/chaingraph/chaingraph.json' with { type: 'json' };
import branchFixtures from '../data/chain-branch-fixtures.json' with { type: 'json' };
import { validateChainGates, coverageGaps, enumerateBranches } from './gate-static.mjs';

const errors = [];
const warnings = [];
const chains = cg.chains || [];
const nodeIds = new Set((cg.nodes || []).map((n) => n.tool_id));
const seen = new Set();

// ── L1 + L2 (static) ──────────────────────────────────────────────────────────
for (const chain of chains) {
  const id = chain.name || '(missing name)';
  if (!chain.name) errors.push(`[L1] chain missing name`);
  else if (seen.has(chain.name)) errors.push(`[L1:${id}] duplicate chain name`);
  else seen.add(chain.name);
  if (!Array.isArray(chain.steps) || chain.steps.length === 0) errors.push(`[L1:${id}] steps[] missing or empty`);
  (chain.steps || []).forEach((s, i) => {
    if (!s.tool_id) errors.push(`[L1:${id}] step ${i + 1} missing tool_id`);
    // Unresolved node is a hard failure (AL-CHAIN-ALIAS, 2026-08-23): the last
    // legacy combined/retired al_id references (AL-06/14/19/58/60) were remapped
    // to their surviving node or removed from their chain. Any new unresolved
    // tool_id is a real dead reference, not a tolerable alias — fail the gate so
    // it cannot ride as a silent warning again.
    else if (!nodeIds.has(s.tool_id)) {
      errors.push(`[L1:${id}] step ${i + 1} tool_id '${s.tool_id}' resolves to no nodes[] entry`);
    }
  });
  for (const ge of validateChainGates(chain)) errors.push(`[L2:${id}] ${ge}`);
}

const gatedChains = chains.filter((c) => (c.steps || []).some((s) => s && s.gate));
console.log(`[L1+L2] ${chains.length} chains checked (${gatedChains.length} gated), ${nodeIds.size} nodes.`);

// ── L3 (live branch coverage over real gated chains) ────────────────────────────
for (const chain of gatedChains) {
  const id = chain.name;
  const scenarios = branchFixtures[id];
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    errors.push(`[L3:${id}] GATED chain has no branch-coverage scenarios in chain-branch-fixtures.json`);
    continue;
  }
  const decisionsList = [];
  for (const sc of scenarios) {
    if (!sc.citation) errors.push(`[L3:${id}] scenario "${sc.scenario ?? '(unnamed)'}" is missing a pinned regulatory citation`);
    let r;
    try { r = await runChain(id, sc.inputs); }
    catch (e) { errors.push(`[L3:${id}] scenario "${sc.scenario}" threw: ${e.message}`); continue; }
    decisionsList.push(r.decisions);
    const got = r.decisions?.[0]?.next ?? null;
    if (sc.expect_next != null && got !== sc.expect_next) {
      errors.push(`[L3:${id}] scenario "${sc.scenario}" routed to "${got}", expected "${sc.expect_next}"`);
    }
  }
  const gaps = coverageGaps(chain, decisionsList);
  if (gaps.length) {
    errors.push(`[L3:${id}] branch coverage INCOMPLETE — uncovered: ${gaps.join(', ')} (of ${enumerateBranches(chain).join(', ')})`);
  } else {
    console.log(`  ✓ ${id}: ${scenarios.length} scenarios cover all ${enumerateBranches(chain).length} branch(es)`);
  }
}

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  ⚠ ' + w);
}
if (errors.length) {
  console.error(`\n✗ validate-chains: ${errors.length} error(s):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\n✓ validate-chains: all chains resolve, gates are statically valid, and every gated chain has full live branch coverage.');
