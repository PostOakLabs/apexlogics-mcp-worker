/**
 * 120-nbct-roi-calculator.kernel.mjs
 * OpenChainGraph server-side kernel — NBCT ROI Calculator (AL-127).
 *
 * Compute ported VERBATIM from repo/tools/120-nbct-roi-calculator/index.html
 * (calculate() L266-323 + exportAP2 preimage L417-433). _cgDomain-family preimage.
 *
 * FRACTIONAL-EXPONENT _detmath (OCG SPEC §18.5): the discount factor uses
 * Math.pow(1+discountRate, certYear+yr) where certYear = prepMonths/12 is FRACTIONAL, so
 * loop-mult (ipow) is invalid. Math.pow/exp/log route to a different libm on V8 vs Workers
 * vs the RV32IM zkVM guest — NOT bit-reproducible. The fix (canonical, matches AINumbers):
 * both the browser tool AND this kernel call det.pow from the vendored pure-JS fdlibm
 * _detmath (only +,-,*,/,sqrt + bit ops — IEEE-portable on every surface), so browser ==
 * kernel == guest BYTE-FOR-BYTE for ALL inputs. The browser tool was patched to inline the
 * same _detmath and use det.pow (source fix per the §18.5 divergence rule).
 *
 * GUEST-LEGAL: imports ./_hash.mjs + ./_detmath.mjs (both vendored, pure-JS, guest-portable).
 * For the RV32IM guest (C1), _detmath is inlined at stage time (its IIFE is self-contained).
 * No engine Math.pow/exp/log; no Date/Intl/locale in the preimage path; finite-guarded.
 */
import { executionHash } from './_hash.mjs';
import { pow as detpow } from './_detmath.mjs';

const TOOL_ID      = '120-nbct-roi-calculator';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-127',
  mcp_name:     'calculate_nbct_roi',
  mandate_type: 'org.apexlogics/credential_assessment',
  ap2_mandate_type: 'nbct_roi_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const assessFee     = num(g('assessFee'));
  const retakesCost   = num(g('retakesCost'));
  const prepHrs       = num(g('prepHoursPerWeek'));
  const prepMonths    = num(g('prepMonths'));
  const hourlyRate    = num(g('currentHourlyRate'));
  const annualStipend = num(g('annualStipend'));
  const stipendYears  = num(g('stipendYears'));
  const renewalCost   = num(g('renewalCost'));
  const renewalYear   = num(g('renewalYear'));
  const discountRate  = num(g('discountRate')) / 100;

  const prepWeeks = prepMonths * 4.33;
  const oppCost   = prepHrs * prepWeeks * hourlyRate;

  const certYear = prepMonths / 12;
  let npvBenefits = 0;
  let lifetimeStipend = 0;
  for (let yr = 1; yr <= stipendYears; yr++) {
    const yr_disc = certYear + yr;
    npvBenefits += annualStipend / detpow(1 + discountRate, yr_disc);
    lifetimeStipend += annualStipend;
  }
  const renewalPV = renewalYear > 0 ? renewalCost / detpow(1 + discountRate, renewalYear) : 0;
  const totalCostNom = assessFee + retakesCost + oppCost;
  const npv = npvBenefits - totalCostNom - renewalPV;
  const bcRatio = npvBenefits / (totalCostNom + renewalPV);

  let cumBenefit = -(totalCostNom);
  let paybackMo = null;
  const certMo = prepMonths;
  for (let m = certMo; m <= certMo + stipendYears * 12; m++) {
    cumBenefit += annualStipend / 12;
    if (cumBenefit >= 0 && paybackMo === null) paybackMo = m;
  }

  let beLo = 100, beHi = 50000;
  for (let i = 0; i < 60; i++) {
    const mid = (beLo + beHi) / 2;
    let bPV = 0;
    for (let yr = 1; yr <= stipendYears; yr++)
      bPV += mid / detpow(1 + discountRate, certYear + yr);
    if (bPV > totalCostNom + renewalPV) beHi = mid; else beLo = mid;
  }
  const beStipend = (beLo + beHi) / 2;

  const _cgDomain = {
    inputs: {
      assessFee: assessFee, retakesCost: retakesCost, annualStipend: annualStipend,
      stipendYears: stipendYears, renewalCost: renewalCost, renewalYear: renewalYear,
      prepMonths: prepMonths, discountRate: +((discountRate * 100).toFixed(1)),
    },
    outputs: {
      npv:                    Math.round(npv),
      paybackMonths:          paybackMo,
      benefitCostRatio:       +(bcRatio.toFixed(2)),
      minStipendBreakEven:    Math.round(beStipend),
      lifetimeStipendNominal: Math.round(lifetimeStipend),
    },
    metadata: {
      license: 'CC-BY-4.0',
      data_vintage: '2026',
      regulatory_citations: ['NBCT assessment fee ~$1,900 (nbpts.org 2025 — labeled default, user-overridable)'],
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
      apex_meta: { ap2_mandate_type: 'nbct_roi_record', al_id: 'AL-127', tool_name: 'NBCT ROI Calculator' },
    },
  };
}
