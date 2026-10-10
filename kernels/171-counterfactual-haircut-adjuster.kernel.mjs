/**
 * 171-counterfactual-haircut-adjuster.kernel.mjs
 * OpenChainGraph server-side kernel — Counterfactual Haircut Adjuster (AL-185).
 *
 * Compute ported VERBATIM from repo/tools/171-counterfactual-haircut-adjuster/index.html
 * (readProgram/calcHaircut + exportAP2 preimage). _cgDomain-family preimage: the
 * mandate's `inputs`/`summary`/`downstream_handoff_candidates` survive the OCG v0.4
 * strict-envelope filter (inputs/outputs deletion exemption, AL-EXPORT-ENVELOPE-FIX
 * PR #140) and BOTH policy_parameters.inputs and output_payload point at that same
 * object, exactly as on the page. Reproduces the browser §6 execution_hash
 * byte-for-byte; kernel-parity.mjs proves it.
 *
 * Kernel input contract mirrors the DOM ids: progName/progCost/progEnrolled/
 * progEmployed plus the three slider percents cfRate/subRate/creamRate (raw DOM
 * values, e.g. 30 → 0.3 via the page's /100). The page's validation alerts
 * (!cost || !enrolled, employed > enrolled) only suppress the artifact client-side;
 * the kernel computes whatever it is given, so chain callers feed real values via
 * data/chain-fixtures.json.
 *
 * GUEST-LEGAL — pure arithmetic only: no Math.pow/log/exp anywhere in the preimage
 * path; no Date/Intl/locale in the preimage (the mandate `generated_at` timestamp is
 * excluded from the §6 preimage by the envelope filter); finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '171-counterfactual-haircut-adjuster';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-185',
  mcp_name:     'counterfactual_haircut_adjuster',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'counterfactual_haircut_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];

  // readProgram — browser coerces parseFloat(...) || 0; name falls back to 'Program'.
  const name     = (typeof g('progName') === 'string' && g('progName')) ? g('progName') : 'Program';
  const cost     = num(g('progCost'));
  const enrolled = num(g('progEnrolled'));
  const employed = num(g('progEmployed'));
  const program  = { name, cost, enrolled, employed };

  // Net-impact sliders — DOM percents (e.g. 30) → fractions (0.3), verbatim /100.
  const cfRate   = num(g('cfRate'))   / 100;
  const subRate  = num(g('subRate'))  / 100;
  const creamRate = num(g('creamRate')) / 100;

  const grossRate                = enrolled > 0 ? employed / enrolled : 0;
  const counterfactualPlacements = enrolled * cfRate;
  const deadweightNet            = Math.max(0, employed - counterfactualPlacements);
  const afterSub                 = deadweightNet * (1 - subRate);
  const afterCream               = afterSub * (1 - creamRate);
  const grossCEE                 = employed > 0 ? cost / employed : null;
  const haircutCEE               = afterCream > 0 ? cost / afterCream : null;
  const multiplier               = (grossCEE && haircutCEE) ? haircutCEE / grossCEE : null;
  const netImpactRate            = enrolled > 0 ? afterCream / enrolled : 0;

  const _cgDomain = {
    inputs: { program, cf_rate: cfRate, substitution_rate: subRate, creaming_rate: creamRate },
    summary: {
      gross_placements: program.employed, gross_cee: grossCEE,
      deadweight_net_placements: deadweightNet, after_substitution: afterSub,
      haircut_adjusted_placements: afterCream, haircut_adjusted_cee: haircutCEE,
      net_impact_rate: netImpactRate, cost_multiplier: multiplier,
    },
    downstream_handoff_candidates: ['170-workforce-cost-per-outcome', 'AL-07'],
  };
  const policy_parameters = { execution_backend: 'js', hash_precision: 'monetary_usd:2dp', inputs: _cgDomain };
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
      apex_meta: { ap2_mandate_type: 'counterfactual_haircut_record', al_id: 'AL-185', tool_name: 'Counterfactual Haircut Adjuster', downstream_handoff_candidates: ['170-workforce-cost-per-outcome', 'AL-07'] },
    },
  };
}
