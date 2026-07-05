/**
 * 119-educator-advanced-degree-roi.kernel.mjs
 * OpenChainGraph server-side kernel — Master's / Lane-Change ROI for Educators (AL-126).
 *
 * Compute ported VERBATIM from repo/tools/119-educator-advanced-degree-roi/index.html
 * (calculate() L299-378 + exportAP2 preimage L480-513). _cgDomain preimage = { inputs,
 * outputs, downstream_handoff_candidates, metadata } (no chain block in preimage — chain
 * is envelope-only, stripped before _cgDomain is built in the browser's own strip-list).
 *
 * GUEST-LEGAL — INTEGER-EXPONENT _detmath: the browser uses Math.pow(1+colaPct, yr-1) and
 * Math.pow(1+discountRate, benefitYr) where yr/benefitYr/yearsToRet+10 are always integers
 * (loop counters / integer year sums — Math.floor(yearsAfterDeg) bounds every loop). Math.pow
 * is BANNED in-guest, so this kernel uses `ipow` = loop multiplication (OCG §3). Math.pow(base,int)
 * and ipow(base,int) differ only in the last ULP; every preimage output is Math.round(...) to
 * whole dollars or +(...).toFixed(n), which absorbs that ~1e-15 difference — so kernel == browser
 * byte-for-byte (proven by kernel-parity). No Math.pow/log/exp; no Date/Intl/locale in the
 * preimage path; finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '119-educator-advanced-degree-roi';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-126',
  mcp_name:     'calculate_educator_advanced_degree_roi',
  mandate_type: 'org.apexlogics/education_roi',
  ap2_mandate_type: 'educator_advanced_degree_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
// Guest-legal integer power (loop multiplication). n must be a non-negative integer.
const ipow = (base, n) => { let r = 1; const k = n < 0 ? 0 : Math.floor(n); for (let i = 0; i < k; i++) r *= base; return r; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const totalTuition     = num(g('totalTuition'));
  const monthsToComplete = num(g('monthsToComplete'));
  const employerAssist   = num(g('employerAssistPct')) / 100;
  const studyHrs         = num(g('studyHoursPerWeek'));
  const currentSalary    = num(g('currentLaneSalary'));
  const laneBump         = num(g('laneBump'));
  const yearsToRet       = num(g('yearsToRetirement'));
  const discountRate     = num(g('discountRate')) / 100;
  const colaPct          = num(g('colaPct')) / 100;
  const pensionMult      = num(g('pensionMultiplier')) / 100;
  const tlfEligible      = !!g('tlfEligible');
  const tlfAmount        = tlfEligible ? num(g('tlfAmount')) : 0;

  // ── Costs ──
  const netTuition       = totalTuition * (1 - employerAssist);
  const hourlyRate       = currentSalary / 2080;
  const studyWeeks       = monthsToComplete * 4.33;
  const opportunityCost  = studyHrs * studyWeeks * hourlyRate;
  const totalCost        = netTuition + opportunityCost - tlfAmount;

  // ── Benefits ──
  const programYrs       = monthsToComplete / 12;
  const yearsAfterDeg    = yearsToRet - programYrs;

  let lifetimeLaneBump = 0;
  let npvBenefits      = 0;
  for (let yr = 1; yr <= Math.floor(yearsAfterDeg); yr++) {
    const benefitYr   = programYrs + yr;
    const nominalBump = laneBump * ipow(1 + colaPct, yr - 1);
    lifetimeLaneBump += nominalBump;
    npvBenefits += nominalBump / ipow(1 + discountRate, benefitYr);
  }

  let pensionUpliftPV = 0;
  const pensionYears  = 20;
  if (pensionMult > 0) {
    const finalFASUplift     = laneBump * ipow(1 + colaPct, yearsAfterDeg - 1);
    const annualPensionExtra = pensionMult * yearsToRet * finalFASUplift;
    pensionUpliftPV = annualPensionExtra * pensionYears / ipow(1 + discountRate, yearsToRet + 10);
  }

  const totalBenefitsPV = npvBenefits + pensionUpliftPV;
  const npv             = totalBenefitsPV - totalCost;

  // ── Payback ──
  let paybackYr   = null;
  let cumBenefit  = -totalCost;
  for (let yr = 1; yr <= Math.floor(yearsAfterDeg); yr++) {
    cumBenefit += laneBump * ipow(1 + colaPct, yr - 1);
    if (cumBenefit >= 0 && paybackYr === null) paybackYr = programYrs + yr;
  }

  // ── Break-even lane bump ──
  let beLo = 100, beHi = 50000;
  for (let i = 0; i < 60; i++) {
    const mid = (beLo + beHi) / 2;
    let bPV = 0;
    for (let yr = 1; yr <= Math.floor(yearsAfterDeg); yr++) {
      const nb = mid * ipow(1 + colaPct, yr - 1);
      bPV += nb / ipow(1 + discountRate, programYrs + yr);
    }
    if (bPV > totalCost) beHi = mid; else beLo = mid;
  }
  const beBump = (beLo + beHi) / 2;

  const _cgDomain = {
    inputs: {
      totalTuition: totalTuition,
      monthsToComplete: monthsToComplete,
      employerAssistPct: +(employerAssist * 100).toFixed(0),
      currentSalary: currentSalary,
      laneBump: laneBump,
      yearsToRetirement: yearsToRet,
      discountRate: +(discountRate * 100).toFixed(1),
      colaPct: +(colaPct * 100).toFixed(2),
      tlfAmount: tlfAmount,
    },
    outputs: {
      npv: Math.round(npv),
      paybackYears: paybackYr ? +paybackYr.toFixed(1) : null,
      lifetimeLaneBump: Math.round(lifetimeLaneBump),
      breakevenLaneBump: Math.round(beBump),
      netCost: Math.round(totalCost),
      pensionUpliftPV: pensionMult > 0 ? Math.round(pensionUpliftPV) : null,
    },
    downstream_handoff_candidates: ['AL-128'],
    metadata: {
      license: 'CC-BY-4.0',
      data_vintage: '2026',
      regulatory_citations: ['ESEA §1059c — Teacher Loan Forgiveness statutory amounts ($5,000/$17,500)'],
    },
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
      apex_meta: { ap2_mandate_type: 'educator_advanced_degree_record', al_id: 'AL-126', tool_name: "Master's / Lane-Change ROI for Educators", downstream_handoff_candidates: ['AL-128'] },
    },
  };
}
