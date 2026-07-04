/**
 * 40-gig-income-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — Part-Time / Gig Income Optimizer (AL-45).
 *
 * PURPOSE: byte-for-byte reproduce the browser tool's §6 execution_hash so an agent
 * (or a firm running the worker inside its own walls) gets the SAME deterministic
 * artifact the human gets in the browser. The compute below is ported VERBATIM from
 * repo/tools/40-gig-income-optimizer/index.html (calculate() + computeSETax /
 * federalTaxOnIncome / marginalBracket + the 2026 bracket tables + exportAP2's exact
 * preimage assembly). scripts/kernel-parity.mjs proves browser==kernel by real execution.
 *
 * GUEST-LEGAL PATTERN (OCG §17/§18 in-guest rules — this kernel is proving-ready):
 *   - imports ONLY './_hash.mjs' (exact specifier; banner-free byte-exact SSOT, body sha 9d60ba8b).
 *   - NO Math.pow/log/exp/sin/cos, NO Date/Math.random/toLocaleString/Intl/localeCompare,
 *     NO .normalize()/TextEncoder/crypto.subtle in the preimage path, NO WASM.
 *     (Math.min/max/round/abs and plain arithmetic only — all IEEE-exact. No _detmath
 *     needed: this tool has no pow/log/exp. Defer _detmath to the first NPV/IRR/loan kernel.)
 *   - every numeric is finite-guarded via n(); compute({}) emits no NaN/Infinity.
 *
 * INPUT CONTRACT (raw browser field values; first 7 = preimage inputs, last 2 = execution-only):
 *   { w2_salary, filing_status, state_rate_pct, gross_gig_income, business_expenses,
 *     billing_rate_hr, prior_year_federal_tax, w2_withholding, prior_year_agi }
 *   w2_withholding + prior_year_agi are NOT in the hash preimage but DO affect
 *   output_payload.quarterly_payment_amount (safe-harbor path), so the kernel needs them.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '40-gig-income-optimizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-45',
  mcp_name:     'optimize_gig_income',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'gig_income_record',
  gpu:          false,
};

// ── TAX CONSTANTS (ported verbatim from the tool; 2026 vintage) ───────────────
const BRACKETS = {
  single: [
    { min: 0,      max: 12400,    rate: 0.10 },
    { min: 12400,  max: 50400,    rate: 0.12 },
    { min: 50400,  max: 105700,   rate: 0.22 },
    { min: 105700, max: 201775,   rate: 0.24 },
    { min: 201775, max: 256225,   rate: 0.32 },
    { min: 256225, max: 640600,   rate: 0.35 },
    { min: 640600, max: Infinity, rate: 0.37 },
  ],
  mfj: [
    { min: 0,      max: 24800,    rate: 0.10 },
    { min: 24800,  max: 100800,   rate: 0.12 },
    { min: 100800, max: 211400,   rate: 0.22 },
    { min: 211400, max: 403550,   rate: 0.24 },
    { min: 403550, max: 512450,   rate: 0.32 },
    { min: 512450, max: 768700,   rate: 0.35 },
    { min: 768700, max: Infinity, rate: 0.37 },
  ],
};
const STD_DED          = { single: 16100, mfj: 32200 };
const SS_WAGE_BASE     = 184500;   // 2026 (SSA); verify annually
const SE_ADJ           = 0.9235;   // net SE income factor
const SE_RATE_MEDICARE = 0.029;
const SE_RATE_SS       = 0.124;
const AIMPT_RATE       = 0.009;    // Additional Medicare 0.9%
const AIMPT_THRESH     = { single: 200000, mfj: 250000 };

// parseFloat(...)||0 mirror; finite-guards every numeric input (guest-legal).
const n = (v) => { const p = parseFloat(v); return Number.isFinite(p) ? p : 0; };

// ── TAX ENGINE (ported verbatim) ──────────────────────────────────────────────
function marginalBracket(taxableIncome, status) {
  const b = BRACKETS[status];
  for (let i = b.length - 1; i >= 0; i--) {
    if (taxableIncome > b[i].min) return b[i].rate;
  }
  return 0.10;
}
function federalTaxOnIncome(income, status) {
  const taxable = Math.max(0, income - STD_DED[status]);
  let tax = 0;
  for (const b of BRACKETS[status]) {
    if (taxable <= b.min) break;
    tax += (Math.min(taxable, b.max) - b.min) * b.rate;
  }
  return tax;
}
function computeSETax(netSEIncome, w2Salary) {
  const seBase      = netSEIncome * SE_ADJ;
  const ssRemaining = Math.max(0, SS_WAGE_BASE - w2Salary);
  const ssTaxBase   = Math.min(seBase, ssRemaining);
  const ssTax       = ssTaxBase * SE_RATE_SS;
  const medTax      = seBase * SE_RATE_MEDICARE;
  return { seTax: ssTax + medTax, seBase, ssTaxBase };
}

/**
 * compute(inputs) — reproduces calculate() (L391-461) + exportAP2 preimage assembly
 * (L629-651) of the browser tool. Returns { policy_parameters, output_payload,
 * compliance_flags } — the same policy_parameters / output_payload the browser hashes.
 */
export function compute(inputs = {}) {
  const w2       = n(inputs.w2_salary);
  const status   = (inputs.filing_status === 'mfj') ? 'mfj' : 'single';
  const stRate   = n(inputs.state_rate_pct) / 100;           // browser: parseFloat(value)/100
  const w2With   = n(inputs.w2_withholding);
  const gigGross = n(inputs.gross_gig_income);
  const gigExp   = n(inputs.business_expenses);
  const hrRate   = n(inputs.billing_rate_hr);
  const priorTax = n(inputs.prior_year_federal_tax);
  const priorAGI = n(inputs.prior_year_agi);

  const netGig = Math.max(0, gigGross - gigExp);

  const { seTax } = computeSETax(netGig, w2);
  const seDeduction = seTax * 0.5;                            // IRC §164(f)

  const w2Taxable       = Math.max(0, w2 - STD_DED[status]);
  const combinedTaxable = w2Taxable + netGig - seDeduction;
  const gigAdjIncome    = netGig - seDeduction;

  const taxCombined = federalTaxOnIncome(w2 + netGig - seDeduction, status);
  const taxW2Only   = federalTaxOnIncome(w2, status);
  const fedTaxOnGig = taxCombined - taxW2Only;

  const marginalRate  = marginalBracket(combinedTaxable, status);
  const stateTaxOnGig = gigAdjIncome * stRate;

  const totalEarned = w2 + netGig;
  const aimptThresh = AIMPT_THRESH[status];
  const aimpt = totalEarned > aimptThresh ? (totalEarned - aimptThresh) * AIMPT_RATE : 0;

  const totalGigTax       = fedTaxOnGig + seTax + stateTaxOnGig + aimpt;
  const effectiveMarginal = gigGross > 0 ? totalGigTax / gigGross : 0;
  const netAfterTax       = gigGross - totalGigTax;

  const qtrRequired    = totalGigTax > 1000;
  const annualEstimate = totalGigTax;
  const qtrPayment     = annualEstimate / 4;

  let safeHarbor;
  if (priorTax > 0) {
    const multiplier = priorAGI > 150000 ? 1.10 : 1.00;
    safeHarbor = (priorTax * multiplier - w2With) / 4;
  } else {
    safeHarbor = (annualEstimate * 0.90) / 4;
  }
  safeHarbor = Math.max(0, safeHarbor);
  const usePayment = Math.min(qtrPayment, safeHarbor > 0 ? safeHarbor : qtrPayment);

  // ── exact preimage (exportAP2 L629-651) ────────────────────────────────────
  const policy_parameters = {
    execution_backend: 'js',
    hash_precision:    'monetary_usd:2dp',
    inputs: {
      w2_salary:              w2,
      filing_status:          status,
      state_rate_pct:         stRate * 100,
      gross_gig_income:       gigGross,
      business_expenses:      gigExp,
      billing_rate_hr:        hrRate,
      prior_year_federal_tax: priorTax,
    },
  };
  const output_payload = {
    net_gig_income:              Math.round(netGig),
    self_employment_tax:         Math.round(seTax),
    se_deduction:                Math.round(seDeduction),
    federal_tax_on_gig:          Math.round(fedTaxOnGig),
    state_tax_on_gig:            Math.round(stateTaxOnGig),
    total_gig_tax:               Math.round(totalGigTax),
    effective_marginal_rate_pct: parseFloat((effectiveMarginal * 100).toFixed(2)),
    net_after_tax_gig:           Math.round(netAfterTax),
    quarterly_payment_required:  qtrRequired,
    quarterly_payment_amount:    Math.round(usePayment),
    data_sources: [
      'IRS 2026 tax brackets (projected from Rev. Proc. 2025-32)',
      'IRC §1401 — Self-employment tax rate 15.3%',
      'IRC §164(f) — 50% SE tax above-the-line deduction',
      'SS wage base $184,500 (2026)',
    ],
  };
  // marginalRate/hrRate are computed by the tool but not emitted into the AP2 preimage;
  // reference them so an accidental future removal is a visible diff, not a silent drop.
  void marginalRate; void hrRate;

  return { policy_parameters, output_payload, compliance_flags: [] };
}

/**
 * buildArtifact(pp, ctx) — server-side artifact (compute_mode:"server") carrying the
 * SAME execution_hash the browser emits. run_chain calls this and threads parent hashes.
 */
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
      server_side_executed: true,
      zero_pii_verified:    true,
      deterministic_run:    true,
      apex_meta: {
        ap2_version:      '2.0',
        ap2_mandate_type: 'gig_income_record',
        al_id:            'AL-45',
        tool_name:        'Part-Time / Gig Income Optimizer',
        downstream_handoff_candidates: ['AL-23', 'AL-32'],
      },
    },
  };
}
