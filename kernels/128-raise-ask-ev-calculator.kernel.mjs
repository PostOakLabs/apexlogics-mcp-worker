/**
 * 128-raise-ask-ev-calculator.kernel.mjs
 * OpenChainGraph server-side kernel — Raise-Ask Expected Value Calculator (AL-135).
 *
 * Compute ported VERBATIM from repo/tools/128-raise-ask-ev-calculator/index.html
 * (calculate() L360-415 + exportAP2 preimage L535-560). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL — INTEGER-EXPONENT _detmath: the browser uses Math.pow(1+meritPct, yr-1)
 * for merit compounding where yr-1 is ALWAYS an integer (0..horizon-1). Math.pow is
 * BANNED in-guest, so this kernel uses `ipow` = loop multiplication (OCG §3: "int
 * exponents = loop multiplication"). Math.pow(base,int) and ipow(base,int) differ only
 * in the last ULP; every preimage output is Math.round(...) to whole dollars, which
 * absorbs that ~1e-15 difference — byte-exact (proven by kernel-parity). No
 * Math.pow/log/exp; no Date/Intl/locale in the preimage path; finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '128-raise-ask-ev-calculator';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-135',
  mcp_name:     'calculate_raise_ask_ev',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'raise_ask_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
// Guest-legal integer power (loop multiplication). n must be a non-negative integer.
const ipow = (base, n) => { let r = 1; const k = n < 0 ? 0 : Math.floor(n); for (let i = 0; i < k; i++) r *= base; return r; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const currentBase  = num(g('currentBase'));
  const targetAsk    = num(g('targetAsk'));
  const pFull        = num(g('pFull'))       / 100;  // DOM value e.g. 70 → 0.7
  const pPartial     = num(g('pPartial'))    / 100;  // DOM value e.g. 20 → 0.2
  const pNone        = num(g('pNone'))       / 100;  // DOM value e.g. 10 → 0.1
  const partialFrac  = num(g('partialFrac')) / 100;  // DOM id `partialFrac`, exported as `partialFracPct`
  const meritPct     = num(g('meritPct'))    / 100;  // DOM value e.g. 3 → 0.03
  const horizon      = num(g('horizon'));
  const downsideRisk = !!g('downsideRisk');

  const fullRaise    = targetAsk - currentBase;
  const partialRaise = fullRaise * partialFrac;

  // evYear1 = pFull×fullRaise + pPartial×partialRaise + pNone×0
  const evYear1 = pFull * fullRaise + pPartial * partialRaise;

  let evLifetime = 0;
  for (let yr = 1; yr <= horizon; yr++) {
    const meritMult = ipow(1 + meritPct, yr - 1);   // integer exponent: yr-1 ∈ {0,1,2,…}
    const baseNoAsk = currentBase * meritMult;
    const evBase    = (currentBase + evYear1) * meritMult;
    evLifetime     += evBase - baseNoAsk;
  }

  const silenceCost     = evLifetime;
  const recAnchorSalary = Math.round((currentBase + fullRaise * 1.15) / 100) * 100;

  const _cgDomain = {
    inputs: {
      currentBase:    currentBase,
      targetAsk:      targetAsk,
      pFull:          +(pFull     * 100).toFixed(0),
      pPartial:       +(pPartial  * 100).toFixed(0),
      pNone:          +(pNone     * 100).toFixed(0),
      partialFracPct: +(partialFrac * 100).toFixed(0),
      meritPct:       +(meritPct  * 100).toFixed(1),
      horizon:        horizon,
      downsideRisk:   downsideRisk,
    },
    outputs: {
      expectedValue:        Math.round(evYear1),
      lifetimeEV:           Math.round(evLifetime),
      silenceCost:          Math.round(silenceCost),
      recommendedAnchor:    recAnchorSalary,
      partialGrantScenario: Math.round(partialRaise),
    },
    downstream_handoff_candidates: ['AL-136', 'AL-97', 'AL-01'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026' },
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
      apex_meta: { ap2_mandate_type: 'raise_ask_record', al_id: 'AL-135', tool_name: 'Raise-Ask Expected Value Calculator', downstream_handoff_candidates: ['AL-136', 'AL-97', 'AL-01'] },
    },
  };
}
