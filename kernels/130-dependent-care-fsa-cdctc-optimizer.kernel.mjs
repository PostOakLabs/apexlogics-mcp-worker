/**
 * 130-dependent-care-fsa-cdctc-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — Dependent Care FSA vs. CDCTC Optimizer (AL-137).
 *
 * Compute ported VERBATIM from repo/tools/130-dependent-care-fsa-cdctc-optimizer/index.html
 * (calcStrategy() L~260-279 + calculate() L281-321 + exportAP2 preimage L409-428). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.max/min/round/floor/ceil only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '130-dependent-care-fsa-cdctc-optimizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-137',
  mcp_name:     'optimize_dependent_care_fsa_cdctc',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'dependent_care_fsa_cdctc_record',
  gpu:          false,
};

const FSA_MAX_MFJ = 7500;
const FSA_MAX_MFS = 3750;
const FICA_RATE = 0.0765; // employee share
const EXP_CAP_1 = 3000;
const EXP_CAP_2 = 6000;

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

function getCDCTCRate(agi, joint) {
  // IRC §21(a)(2) as amended by OBBBA (Pub. L. 119-21 §70405), tax years after 2025:
  // 50%, less 1 pp per $2,000 (or fraction) of AGI over $15,000, not below 35%;
  // then less 1 pp per $2,000 ($4,000 joint) (or fraction) of AGI over $75,000
  // ($150,000 joint), not below 20%.
  let rate = 0.50;
  if (agi > 15000) rate = Math.max(0.35, rate - Math.ceil((agi - 15000) / 2000) * 0.01);
  const from = joint ? 150000 : 75000;
  const step = joint ? 4000 : 2000;
  if (agi > from) rate = Math.max(0.20, rate - Math.ceil((agi - from) / step) * 0.01);
  return Math.round(rate * 100) / 100;
}

function calcStrategy(fsaContrib, agi, numChildren, childcareCost, marginalRate, stateRate, joint) {
  const expCap = numChildren >= 2 ? EXP_CAP_2 : EXP_CAP_1;
  const cdctcBase = Math.max(0, Math.min(expCap, childcareCost) - fsaContrib);
  const cdctcRate = getCDCTCRate(agi, joint);
  const cdctcCredit = cdctcBase * cdctcRate;
  const fsaTaxSavings = fsaContrib * (marginalRate / 100 + stateRate / 100);
  const ficaSavings = fsaContrib * FICA_RATE;
  const totalSavings = fsaTaxSavings + ficaSavings + cdctcCredit;
  const netCost = childcareCost - totalSavings;
  const effectiveRate = childcareCost > 0 ? netCost / childcareCost : 0;
  return { fsaContrib, fsaTaxSavings, ficaSavings, cdctcCredit, totalSavings, netCost, effectiveRate };
}

// Blank/absent -> default; an explicit 0 is kept (AL-ZERO-INPUTS: was `value || default`).
const ov = (v, d) => { if (v === undefined || v === null || String(v).trim() === '') return d; const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const filingStatus  = g('filingStatus');
  const agi           = ov(g('agi'), 95000);
  const marginalRate  = ov(g('marginalRate'), 22);
  const stateRate     = ov(g('stateRate'), 5);
  const numChildren   = parseInt(g('numChildren'), 10) || 1;
  const childcareCost = ov(g('childcareCost'), 18000);
  const fsaAvailable  = g('fsaAvailable') === 'yes';

  const fsaMax = filingStatus === 'mfs' ? FSA_MAX_MFS : FSA_MAX_MFJ;
  const joint = filingStatus === 'mfj';

  // Strategy 1: FSA only (max FSA, no CDCTC)
  const fsaAmt = fsaAvailable ? Math.min(fsaMax, childcareCost) : 0;
  const stratFSA = calcStrategy(fsaAmt, agi, numChildren, childcareCost, marginalRate, stateRate, joint);
  const stratFSAOnly = { ...stratFSA, cdctcCredit: 0, totalSavings: stratFSA.fsaTaxSavings + stratFSA.ficaSavings };

  // Strategy 2: CDCTC only (no FSA)
  const stratCDCTC = calcStrategy(0, agi, numChildren, childcareCost, marginalRate, stateRate, joint);

  // Strategy 3: Optimal combo — sweep FSA contributions to find max
  let bestCombo = stratCDCTC;
  if (fsaAvailable) {
    for (let f = 0; f <= fsaMax; f += 250) {
      const s = calcStrategy(f, agi, numChildren, childcareCost, marginalRate, stateRate, joint);
      if (s.totalSavings > bestCombo.totalSavings) bestCombo = s;
    }
  }

  const optimalFSA = fsaAvailable ? bestCombo.fsaContrib : 0;
  const ficaSavingsOnFSA = optimalFSA * FICA_RATE;

  const _cgDomain = {
    inputs: {
      filingStatus: filingStatus, agi: agi, marginalRatePct: marginalRate,
      stateRatePct: stateRate, numChildren: numChildren, childcareCost: childcareCost, fsaAvailable: fsaAvailable,
    },
    outputs: {
      optimalFSAContribution: Math.round(optimalFSA), cdctcCredit: Math.round(bestCombo.cdctcCredit),
      totalSavings: Math.round(bestCombo.totalSavings), netChildcareCost: Math.round(bestCombo.netCost),
      ficaSavings: Math.round(ficaSavingsOnFSA),
    },
    downstream_handoff_candidates: ['AL-138'],
    metadata: { data_vintage: 'IRC §129 (DC-FSA); IRC §21 (CDCTC); IRS Pub. 503; 2026 limits (OBBBA)', tool_name: 'Dependent Care FSA vs. CDCTC Optimizer' },
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
      apex_meta: { ap2_mandate_type: 'dependent_care_fsa_cdctc_record', al_id: 'AL-137', tool_name: 'Dependent Care FSA vs. CDCTC Optimizer', downstream_handoff_candidates: ['AL-138'] },
    },
  };
}
