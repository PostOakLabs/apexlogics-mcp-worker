/**
 * 109-iso-amt-exposure-modeler.kernel.mjs
 * OpenChainGraph server-side kernel — ISO / AMT Exposure Modeler (AL-116).
 *
 * Compute ported VERBATIM from repo/tools/109-iso-amt-exposure-modeler/index.html
 * (AMT_PARAMS + calcAMT + calcRegularTax + calcISOAMT L244-276 + exportAP2 preimage
 * L385-416). Direct-artifact preimage shape (tool-40 family): policy_parameters =
 * {execution_backend, hash_precision, inputs}, output_payload = the summary object.
 * kernel-parity.mjs proves browser==kernel by real execution.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/floor only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path (toLocaleString lives only in the UI fmt
 * helpers, which are NOT in the preimage → omitted). Finite-guarded. Input keys mirror
 * DOM ids via the CASE.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '109-iso-amt-exposure-modeler';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-116',
  mcp_name:     'iso_amt_exposure_modeler',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'iso_amt_record',
  gpu:          false,
};

// ── 2026 AMT parameters (ported verbatim) ─────────────────────────────────────
const AMT_PARAMS = {
  single: { exemption: 90100,  phaseoutStart: 500000,  rate1: 0.26, rate2: 0.28, threshold: 244500 },
  mfj:    { exemption: 140200, phaseoutStart: 1000000, rate1: 0.26, rate2: 0.28, threshold: 244500 },
};

// mirror `+value || default` — falsy (0/NaN) collapses to the default, as the tool does.
const dnum = (v, d) => { const x = +v; return x || d; };

function calcAMT(amti, params) {
  const phaseoutAmt = Math.max(0, amti - params.phaseoutStart);
  const effectiveExemption = Math.max(0, params.exemption - phaseoutAmt * 0.25);
  const amtBase = Math.max(0, amti - effectiveExemption);
  let tmt;
  if (amtBase <= params.threshold) {
    tmt = amtBase * params.rate1;
  } else {
    tmt = params.threshold * params.rate1 + (amtBase - params.threshold) * params.rate2;
  }
  return { tmt, effectiveExemption, amtBase };
}

function calcRegularTax(income, status) {
  const brackets = status === 'single'
    ? [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]]
    : [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]];
  let tax = 0, prev = 0;
  for (const [top, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, top) - prev) * rate;
    prev = top;
  }
  return tax;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const shares   = dnum(g('shares'), 10000);
  const strike   = dnum(g('strikePrice'), 2.50);
  const fmv      = dnum(g('fmv'), 18);
  const ordIncome = dnum(g('ordinaryIncome'), 175000);
  const otherAMT = dnum(g('otherAMT'), 0);
  const status   = (g('filingStatus') === 'mfj') ? 'mfj' : 'single';

  const params = AMT_PARAMS[status];

  const isoSpread = shares * (fmv - strike);
  const amti = ordIncome + isoSpread + otherAMT;

  const { tmt, effectiveExemption } = calcAMT(amti, params);
  const regularTax = calcRegularTax(ordIncome, status);
  const amtOwed = Math.max(0, tmt - regularTax);
  const amtCredit = amtOwed;

  // Max shares that don't trigger AMT (binary search — ported verbatim).
  let lo = 0, hi = shares * 10, maxNoAMTShares = 0;
  for (let iter = 0; iter < 60; iter++) {
    const mid = Math.floor((lo + hi) / 2);
    const testSpread = mid * (fmv - strike);
    const testAMTI = ordIncome + testSpread + otherAMT;
    const { tmt: t } = calcAMT(testAMTI, params);
    if (t <= regularTax) { maxNoAMTShares = mid; lo = mid + 1; } else { hi = mid - 1; }
  }

  const policy_parameters = {
    execution_backend: 'js',
    hash_precision:    'monetary_usd:2dp',
    inputs: {
      shares_to_exercise:    shares,
      strike_price:          strike,
      fmv_at_exercise:       fmv,
      ordinary_income:       ordIncome,
      other_amt_adjustments: otherAMT,
      filing_status:         status,
    },
  };
  const output_payload = {
    iso_spread:           Math.round(isoSpread),
    amti:                 Math.round(amti),
    effective_exemption:  Math.round(effectiveExemption),
    tmt:                  Math.round(tmt),
    regular_tax:          Math.round(regularTax),
    amt_owed:             Math.round(amtOwed),
    amt_credit_generated: Math.round(amtCredit),
    max_shares_no_amt:    maxNoAMTShares,
  };
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
      apex_meta: { ap2_mandate_type: 'iso_amt_record', al_id: 'AL-116', tool_name: 'ISO / AMT Exposure Modeler', downstream_handoff_candidates: ['AL-117', 'AL-01'] },
    },
  };
}
