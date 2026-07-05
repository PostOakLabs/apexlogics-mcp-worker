/**
 * 129-promotion-vs-job-hop.kernel.mjs
 * OpenChainGraph server-side kernel — Promotion vs. Job-Hop Calculator (AL-136).
 *
 * Compute ported VERBATIM from repo/tools/129-promotion-vs-job-hop/index.html
 * (calculate() L307-396 + exportAP2 preimage L498-524). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: no Math.pow/log/exp in this tool — all year-over-year merit compounding
 * is simple multiplication `stayBase * (1 + meritPct)`. The break-even binary search
 * also uses only multiply/divide/add. No Date/Intl/locale in the preimage path;
 * finite-guarded. `loosesBenefits` checkbox is always false in the parity harness
 * (fake DOM hardcodes .checked = false) so `benefitsDelta = 0` in the fixture.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '129-promotion-vs-job-hop';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-136',
  mcp_name:     'promotion_vs_job_hop',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'mobility_decision_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const currentBase    = num(g('currentBase'));
  const meritPct       = num(g('meritPct'))       / 100;  // DOM value e.g. 3 → 0.03
  const horizon        = num(g('horizon'));
  const promoRaisePct  = num(g('promoRaisePct'))  / 100;  // DOM value e.g. 15 → 0.15
  const promoMonths    = num(g('promoMonths'));
  const hopPremiumPct  = num(g('hopPremiumPct'))  / 100;  // DOM value e.g. 20 → 0.20
  const unvestedEquity = num(g('unvestedEquity'));
  const rampMonths     = num(g('rampMonths'));
  const tenureResetPct = num(g('tenureResetPct')) / 100;  // DOM value e.g. 5 → 0.05
  const benefitsDelta  = num(g('benefitsDelta'));         // 0 when loosesBenefits=false

  // ── Path A: Stay for Internal Promotion ──
  const promoFracYear = Math.min(promoMonths / 12, 1);
  const promoBump     = currentBase * promoRaisePct;
  const promoBase     = currentBase + promoBump;

  const stayRows = [];
  let stayBase = currentBase;
  for (let yr = 1; yr <= horizon; yr++) {
    let stayAnnual;
    if (yr === 1) {
      stayAnnual = currentBase * promoFracYear + promoBase * (1 - promoFracYear);
      stayBase   = promoBase;
    } else {
      stayBase   = stayBase * (1 + meritPct);
      stayAnnual = stayBase;
    }
    stayRows.push(stayAnnual);
  }

  // ── Path B: External Job-Hop ──
  const hopBase0     = currentBase * (1 + hopPremiumPct);
  const rampCost     = hopBase0 * 0.25 * rampMonths / 12;
  const tenureCostYr = hopBase0 * tenureResetPct;

  const hopRows = [];
  let hopBase = hopBase0;
  for (let yr = 1; yr <= horizon; yr++) {
    let hopAnnual = hopBase;
    if (yr === 1) hopAnnual -= rampCost;
    hopAnnual -= benefitsDelta;
    hopAnnual -= tenureCostYr;
    if (yr > 1) hopBase = hopBase * (1 + meritPct);
    hopRows.push(hopAnnual);
  }

  // ── Totals ──
  const stayCumul = stayRows.reduce((a, b) => a + b, 0);
  const hopCumul  = hopRows.reduce((a, b) => a + b, 0) - unvestedEquity;
  const netAdv    = hopCumul - stayCumul;
  const winner    = netAdv > 0 ? 'hop' : 'stay';

  // ── Break-even external premium (binary search, 50 iterations) ──
  let beLo = 0, beHi = 150;
  for (let i = 0; i < 50; i++) {
    const mid     = (beLo + beHi) / 2;
    const prem    = mid / 100;
    const hb0     = currentBase * (1 + prem);
    const hRamp   = hb0 * 0.25 * rampMonths / 12;
    const hTenure = hb0 * tenureResetPct;
    let hCum = -unvestedEquity;
    let hBs  = hb0;
    for (let yr = 1; yr <= horizon; yr++) {
      const ha = hBs - (yr === 1 ? hRamp : 0) - benefitsDelta - hTenure;
      hCum += ha;
      if (yr > 1) hBs = hBs * (1 + meritPct);
    }
    if (hCum > stayCumul) beHi = mid; else beLo = mid;
  }
  const bePrem = (beLo + beHi) / 2;

  const _cgDomain = {
    inputs: {
      currentBase:    currentBase,
      promoRaisePct:  +(promoRaisePct  * 100).toFixed(1),
      promoMonths:    promoMonths,
      hopPremiumPct:  +(hopPremiumPct  * 100).toFixed(1),
      unvestedEquity: unvestedEquity,
      rampMonths:     rampMonths,
      tenureResetPct: +(tenureResetPct * 100).toFixed(1),
      benefitsDelta:  benefitsDelta,
      meritPct:       +(meritPct       * 100).toFixed(1),
      horizon:        horizon,
    },
    outputs: {
      winner:                   winner,
      stayTotalComp:            Math.round(stayCumul),
      hopTotalComp:             Math.round(hopCumul),
      netAdvantage:             Math.round(netAdv),
      breakEvenExternalPremium: +bePrem.toFixed(1),
    },
    downstream_handoff_candidates: ['AL-97', 'AL-27'],
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
      apex_meta: { ap2_mandate_type: 'mobility_decision_record', al_id: 'AL-136', tool_name: 'Promotion vs. Job-Hop Calculator', downstream_handoff_candidates: ['AL-97', 'AL-27'] },
    },
  };
}
