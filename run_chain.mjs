/**
 * run_chain.mjs — ApexLogics server-side chain runner (OpenChainGraph §21 Chain Execution).
 *
 * Ported from AINumbers/mcp-apps-poc/embed/runChain.mjs BYTE-FOR-BYTE in semantics so
 * the same chain + inputs yields the same composite execution_hash anywhere. It does NOT
 * re-implement any compute or hash: it loops the SAME deterministic kernels
 * (getKernel().buildArtifact) and hashes with the SAME canonical §4 path (executionHash
 * from ./_hash.mjs). The only thing it adds is the standalone loop that threads step N's
 * execution_hash into step N+1's parent_hashes and folds step outputs into ONE composite.
 *
 * OCG §21.4 decision gates: a chain is pure-linear unless a step carries a `gate`. Every
 * §21.4 composite key (route_plan_digest, decisions[], path_taken[]) is CONDITIONAL-PRESENCE
 * — present ONLY when the chain defines >=1 gate — so a linear chain's composite hash is
 * frozen and never moves when gates are added elsewhere.
 *
 * §17 build_identity + §18 compute_proof attach HASH-EXCLUDED into audit_signature at run
 * time (compute_proof only when the receipt's journal.output cgCanon-equals the step output).
 *
 * Deps are injectable for tests/portability; default to the bundled catalog + fixtures +
 * kernel registry so the Cloudflare Worker (no fs) runs with zero configuration.
 */
import { executionHash, cgCanon } from './_hash.mjs';
import { evaluateGate as gvEvaluateGate, stepId as gvStepId } from './kernels/_gateval.mjs';
import { getKernel as defaultGetKernel } from './kernels/index.mjs';
import defaultChaingraph from './data/chaingraph/chaingraph.json' with { type: 'json' };
import defaultFixtures from './data/chain-fixtures.json' with { type: 'json' };

// OCG §21.4 route_plan_digest — bare-hex SHA-256 over the JCS-canonical chain steps[]
// definition. Same canonicalizer as §4; only invoked for gated chains.
async function cgSha256Hex(obj) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(cgCanon(obj))));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * runChain(chainNameOrConfig, inputs?, deps?) — server-side chain execution result:
 * per-step statuses, the composite artifact, and composite_execution_hash. Deterministic;
 * no network; no PII logging.
 */
export async function runChain(chainNameOrConfig, inputs = undefined, deps = undefined) {
  const getKernel = deps?.getKernel ?? defaultGetKernel;
  const chaingraph = deps?.chaingraph ?? defaultChaingraph;
  const fixtures = deps?.fixtures ?? defaultFixtures;

  // Resolve the chain: inline config OR a name against the catalog.
  let chainMeta, chainName;
  if (chainNameOrConfig && typeof chainNameOrConfig === 'object') {
    chainMeta = chainNameOrConfig;
    chainName = chainMeta.name ?? '(inline)';
  } else {
    chainName = String(chainNameOrConfig);
    chainMeta = (chaingraph?.chains ?? []).find((c) => c.name === chainName);
    if (!chainMeta) throw new Error(`Unknown chain "${chainName}". List names in chaingraph.chains[].name.`);
  }
  const nodeById = {};
  for (const n of (chaingraph?.nodes ?? [])) nodeById[n.tool_id] = n;

  const steps = (chainMeta.steps ?? []).map((s) => s.tool_id);
  if (!steps.length) throw new Error(`Chain "${chainName}" has no steps.`);

  // --- run each kernel-backed step, threading parent hashes ---
  const chainSteps = chainMeta.steps ?? [];
  const hasGates = chainSteps.some((s) => s && s.gate);
  const idToIndex = {};
  chainSteps.forEach((s, i) => { idToIndex[gvStepId(s, i)] = i; });

  const results = new Array(chainSteps.length).fill(null);
  const decisions = [];
  const path_taken = [];
  let prevHash = null, prevId = null;
  let idx = 0;
  while (idx < chainSteps.length) {
    const step = chainSteps[idx];
    const tid = steps[idx];
    const node = nodeById[tid];
    let ranArtifact = null;
    if (!node) { results[idx] = { order: idx + 1, tool_id: tid, status: 'unknown_node' }; }
    else if (node.gpu) { results[idx] = { order: idx + 1, tool_id: tid, status: 'gpu_browser_only', browser_url: node.url }; }
    else {
      const kernel = getKernel(tid);
      if (!kernel) { results[idx] = { order: idx + 1, tool_id: tid, status: 'no_kernel_browser_only', browser_url: node.url }; }
      else {
        const callerPp = inputs?.[tid];
        const fixturePp = fixtures?.[chainName]?.[tid];
        const pp = callerPp ?? fixturePp ?? {};
        const inputs_source = callerPp !== undefined ? 'caller' : (fixturePp !== undefined ? 'fixture' : 'none');
        try {
          // Determinism: `now` never enters the composite preimage (per-step timestamps /
          // mandate_ids are excluded below), so a fixed value keeps the run reproducible.
          const now = '1970-01-01T00:00:00.000Z';
          const artifact = await kernel.buildArtifact(pp, {
            now,
            parent_hashes: prevHash ? [prevHash] : [],
            parent_tool_ids: prevId ? [prevId] : [],
            chain_depth: idx,
          });
          // §17 build_identity (advisory — which SOURCE ran; hash-excluded).
          const srcImg = Array.isArray(node.compute_images) && node.compute_images.find((im) => im.system === 'sha256-source');
          if (srcImg && srcImg.image_id) {
            artifact.audit_signature = { ...(artifact.audit_signature || {}), build_identity: {
              kernel_digest: srcImg.image_id,
              buildType: 'https://ainumbers.co/chaingraph/context/v0.2#WebCryptoSHA256',
              source_ref: 'kernels/' + node.tool_id + '.kernel.mjs',
            } };
          }
          // §18 compute_proof — attach iff the receipt is about THIS exact output (hash-excluded).
          if (node.compute_proof && node.compute_proof.journal
              && JSON.stringify(cgCanon(node.compute_proof.journal.output)) === JSON.stringify(cgCanon(artifact.output_payload))) {
            artifact.audit_signature = { ...(artifact.audit_signature || {}), compute_proof: node.compute_proof };
          }
          results[idx] = { order: idx + 1, tool_id: tid, status: 'ok', inputs_source, mandate_type: artifact.mandate_type, execution_hash: artifact.execution_hash, artifact };
          prevHash = artifact.execution_hash; prevId = tid;
          ranArtifact = artifact;
        } catch (err) {
          results[idx] = { order: idx + 1, tool_id: tid, status: 'input_required', inputs_source, error: String(err?.message ?? err),
            hint: 'Supply inputs["' + tid + '"] (field names per the node manifest).' };
        }
      }
    }
    if (results[idx].status === 'ok') path_taken.push(gvStepId(step, idx));
    // §21.4 decision gate — evaluate ONLY when the step produced output; route forward.
    if (hasGates && step && step.gate && ranArtifact) {
      const dec = { step_id: gvStepId(step, idx), ...gvEvaluateGate(step.gate, ranArtifact.output_payload) };
      decisions.push(dec);
      let target;
      if (dec.next === 'end') target = chainSteps.length;
      else { target = idToIndex[dec.next]; if (target === undefined || target <= idx) target = idx + 1; }
      for (let j = idx + 1; j < target && j < chainSteps.length; j++) {
        if (results[j] === null) results[j] = { order: j + 1, tool_id: steps[j], status: 'skipped_by_gate' };
      }
      idx = target;
      continue;
    }
    idx++;
  }
  const resultsList = results.filter((r) => r !== null);

  const ran = resultsList.filter((r) => r.status === 'ok');
  // Composite preimage: ONLY mandate_type + execution_hash + output_payload per step
  // (per-step timestamps / mandate_ids excluded) — reproducible.
  const composite_policy = {
    compute_mode: 'server',
    chain: chainName,
    chain_title: chainMeta.title ?? chainName,
    step_count: ran.length,
    step_tool_ids: ran.map((r) => r.tool_id),
  };
  const composite_output = {
    chain: chainName,
    steps: ran.map((r) => ({ tool_id: r.tool_id, mandate_type: r.mandate_type, execution_hash: r.execution_hash, output_payload: r.artifact.output_payload })),
  };
  // §21.4 conditional-presence: gate metadata enters the preimage ONLY for gated chains.
  if (hasGates) {
    composite_policy.route_plan_digest = await cgSha256Hex(chainSteps);
    composite_output.decisions = decisions;
    composite_output.path_taken = path_taken;
  }
  const composite_hash = ran.length ? await executionHash(composite_policy, composite_output) : null;
  const composite_artifact = ran.length ? {
    '@context': ['https://ainumbers.co/chaingraph/context/v0.3/context.jsonld'],
    chaingraph_version: '0.4.0',
    compute_mode: 'server',
    mandate_type: 'chaingraph_record',
    tool_id: 'chaingraph/chains/' + chainName,
    tool_version: '1.0.0',
    execution_hash: composite_hash,
    chain: {
      parent_hashes: ran.map((r) => r.execution_hash),
      parent_tool_ids: ran.map((r) => r.tool_id),
      chain_depth: ran.length,
    },
    policy_parameters: composite_policy,
    output_payload: composite_output,
    compliance_flags: [],
    audit_signature: { server_side_executed: true, zero_pii_verified: true, deterministic_run: true },
  } : null;

  const out = {
    mode: 'server_run_chain', chain: chainName, compute_mode: 'server',
    step_count: chainSteps.length,
    steps_ran: ran.length,
    steps: resultsList.map((r) => ({ order: r.order, tool_id: r.tool_id, status: r.status, inputs_source: r.inputs_source ?? null, execution_hash: r.execution_hash ?? null, compute_proof: r.artifact?.audit_signature?.compute_proof ?? null, build_identity: r.artifact?.audit_signature?.build_identity ?? null, error: r.error ?? null, hint: r.hint ?? null })),
    composite_execution_hash: composite_hash,
    composite_artifact,
    spec: hasGates
      ? 'OpenChainGraph Standard v0.8 §21 Chain Execution (decision gates)'
      : 'OpenChainGraph Standard v0.4 §12 (chain-level Compute Binding)',
  };
  if (hasGates) { out.route_plan_digest = composite_policy.route_plan_digest; out.decisions = decisions; out.path_taken = path_taken; }
  return out;
}

export default runChain;
