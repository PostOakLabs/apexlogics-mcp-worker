/**
 * sc1-hash-seeded-generative-art.kernel.mjs
 * OpenChainGraph server-side kernel — Showcase c1-1 "Hash-Seeded Generative Art"
 * (OCG-Industries cluster ① Generative Art & Visuals).
 *
 * Compute ported VERBATIM from repo/showcase/hash-seeded-generative-art/index.html
 * (calculate() + exportAP2 preimage). _cgDomain-family preimage. Reproduces the
 * browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: pure integer arithmetic — a 32-bit LCG via Math.imul (identical in
 * browsers, Workers, Node). No Math.pow/log/exp, no Date/Intl/locale, no float
 * rounding in the preimage path. Given the same seed the same SVG regenerates and
 * the same execution_hash recomputes: that is the whole demo.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = 'sc1-hash-seeded-generative-art';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'SC-01',
  mcp_name:     'hash_seeded_generative_art',
  mandate_type: 'org.apexlogics/generative_art_seed',
  ap2_mandate_type: 'generative_art_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
const PALETTES = ['sunset', 'ocean', 'forest', 'mono'];

// Deterministic 32-bit LCG (glibc constants). Math.imul is bit-identical across
// every JS runtime, so the browser tool and this kernel draw the same sequence.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s; };
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const seed       = Math.trunc(num(g('seed')));
  const complexity = Math.trunc(num(g('complexity')));
  const paletteRaw = g('palette');
  const palette    = PALETTES.includes(paletteRaw) ? paletteRaw : 'sunset';

  const rnd = lcg((seed + complexity * 2654435761) >>> 0);
  const n1 = rnd(), n2 = rnd(), n3 = rnd(), n4 = rnd();

  const hue        = n1 % 360;
  const rotation   = n2 % 360;
  const shapeCount = complexity * 3 + (n3 % 6);
  const strokeSeed = n4 % 100;
  const complexity_tier = complexity < 4 ? 'minimal' : 'rich';

  const _cgDomain = {
    inputs: {
      seed:       seed,
      complexity: complexity,
      palette:    palette,
    },
    outputs: {
      complexity:      complexity,
      complexity_tier: complexity_tier,
      palette:         palette,
      hue:             hue,
      rotation:        rotation,
      shapeCount:      shapeCount,
      strokeSeed:      strokeSeed,
    },
    downstream_handoff_candidates: ['sc1-art-render'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026', cluster: 'generative-art-visuals' },
  };
  const policy_parameters = { execution_backend: 'js', hash_precision: 'integer_seed', inputs: _cgDomain };
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
      apex_meta: { ap2_mandate_type: 'generative_art_record', al_id: 'SC-01', tool_name: 'Hash-Seeded Generative Art', downstream_handoff_candidates: ['sc1-art-render'] },
    },
  };
}
