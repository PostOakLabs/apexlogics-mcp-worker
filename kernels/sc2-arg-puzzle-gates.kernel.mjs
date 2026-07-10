/**
 * sc2-arg-puzzle-gates.kernel.mjs
 * OpenChainGraph server-side kernel — Showcase c2-1 "ARG Puzzle Gates"
 * (OCG-Industries cluster ② Gaming & Interactive). Flagship gated exemplar.
 *
 * Compute ported VERBATIM from repo/showcase/arg-puzzle-gates/index.html
 * (calculate() + exportAP2 preimage). _cgDomain-family preimage. Reproduces the
 * browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: a djb2 rolling checksum masked to 31 bits (integer arithmetic,
 * bit-identical across runtimes) stands in for a puzzle "answer fingerprint".
 * gate_status = does the submitted answer's fingerprint equal the stage key's?
 * The chain's §21.4 gate routes solved -> next stage, locked -> end. No Math.pow,
 * no Date/Intl, no crypto in the preimage path.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = 'sc2-arg-puzzle-gates';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'SC-02',
  mcp_name:     'arg_puzzle_gates',
  mandate_type: 'org.apexlogics/arg_puzzle_gate',
  ap2_mandate_type: 'puzzle_gate_record',
  gpu:          false,
};

// Canonical stage solutions. The answer fingerprint below is derived from these,
// never a raw comparison, so the artifact records a "valid_parent_hash"-style key.
const STAGE_KEYS = { 'gate-1': 'RANSOM', 'gate-2': 'MERIDIAN', 'gate-3': 'CIPHERLOCK' };

// djb2 (Bernstein) rolling checksum, masked to 31 bits every step so it never
// leaves the safe-integer range. Uppercased so answer casing does not matter.
function fingerprint(str) {
  let h = 5381;
  const s = String(str).toUpperCase();
  for (let i = 0; i < s.length; i++) h = ((Math.imul(h, 33) + s.charCodeAt(i)) & 0x7fffffff);
  return h;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const puzzleId = STAGE_KEYS[g('puzzleId')] !== undefined ? g('puzzleId') : 'gate-1';
  const answerRaw = g('answer');
  const answer = (answerRaw === undefined || answerRaw === null) ? '' : String(answerRaw);

  const answer_key   = fingerprint(answer);
  const expected_key = fingerprint(STAGE_KEYS[puzzleId]);
  const solved       = answer_key === expected_key;
  const gate_status  = solved ? 'solved' : 'locked';

  const _cgDomain = {
    inputs: {
      puzzleId: puzzleId,
      answer:   answer,
    },
    outputs: {
      gate_status:  gate_status,
      answer_key:   answer_key,
      expected_key: expected_key,
      solved:       solved,
    },
    downstream_handoff_candidates: ['sc2-arg-stage-two'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026', cluster: 'gaming-interactive' },
  };
  const policy_parameters = { execution_backend: 'js', hash_precision: 'integer_checksum', inputs: _cgDomain };
  const output_payload = _cgDomain;
  return { policy_parameters, output_payload, compliance_flags: [] };
}

export async function buildArtifact(pp, { now, parent_hashes = [], parent_tool_ids = [], chain_depth = 0 } = {}) {
  const { policy_parameters, output_payload, compliance_flags } = compute(pp);
  const execution_hash = await executionHash(policy_parameters, output_payload);
  return {
    '@context':         ['https://ainumbers.co/chaingraph/context/v0.3/context.jsonld'],
    chaingraph_version: '0.4.0',
    buildType:          'https://ainumbers.co/chaingraph/context/v0.2#WebCryptoSHA256',
    compute_mode:       'server',
    mandate_type:       meta.mandate_type,
    tool_id:            TOOL_ID,
    tool_version:       TOOL_VERSION,
    generated_at:       now ?? null,
    execution_hash,
    chain:              { parent_hashes, parent_tool_ids, chain_depth },
    policy_parameters,
    output_payload,
    compliance_flags,
    audit_signature: {
      server_side_executed: true, zero_pii_verified: true, deterministic_run: true,
      apex_meta: { ap2_mandate_type: 'puzzle_gate_record', al_id: 'SC-02', tool_name: 'ARG Puzzle Gates', downstream_handoff_candidates: ['sc2-arg-stage-two'] },
    },
  };
}
