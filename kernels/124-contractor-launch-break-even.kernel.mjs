/**
 * 124-contractor-launch-break-even.kernel.mjs
 * OpenChainGraph server-side kernel — Contractor Business Launch Break-Even (AL-131).
 *
 * Compute ported VERBATIM from repo/tools/124-contractor-launch-break-even/index.html
 * (calculate() L272-351 + buildAP2 preimage L453-476). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.abs/max/round only (no pow/exp/log — the
 * SE-tax rate floor is a 20-iteration fixed-point solve, the ramp is a 24-month loop);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '124-contractor-launch-break-even';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-131',
  mcp_name:     'model_contractor_launch_break_even',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'contractor_launch_record',
  gpu:          false,
};

const SE_TAX_RATE = 0.153;
const SE_DEDUCTIBLE_HALF = 0.0765;

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const w2Salary            = parseFloat(g('w2Salary')) || 65000;
  const benefitsValue       = parseFloat(g('benefitsValue')) || 12000;
  const taxRate             = (parseFloat(g('taxRate')) / 100) || 0.22;
  const startupCosts        = parseFloat(g('startupCosts')) || 12500;
  const monthlyOverhead     = parseFloat(g('monthlyOverhead')) || 1500;
  const materialsMarkup     = (parseFloat(g('materialsMarkup')) / 100) || 0.15;
  const materialsRevenue    = parseFloat(g('materialsRevenue')) || 2000;
  const ownerPay            = parseFloat(g('ownerPay')) || 70000;
  const rampMonths          = parseInt(g('rampMonths'), 10) || 6;
  const billableHoursPerWeek = parseFloat(g('billableHours')) || 32;
  const weeksWorked         = parseFloat(g('weeksWorked')) || 48;
  const rampUtilization     = (parseFloat(g('rampUtilization')) / 100) || 0.40;

  const annualBillableHours = billableHoursPerWeek * weeksWorked;
  const materialsNetAnnual  = materialsRevenue * 12 * materialsMarkup;
  const annualOverhead      = monthlyOverhead * 12;

  let grossBillable = ownerPay + annualOverhead - materialsNetAnnual + (ownerPay * SE_TAX_RATE * 0.5);
  for (let i = 0; i < 20; i++) {
    const netSE = grossBillable + materialsNetAnnual - annualOverhead
      - (grossBillable + materialsNetAnnual - annualOverhead) * SE_DEDUCTIBLE_HALF / (1 + SE_DEDUCTIBLE_HALF);
    const seTax = netSE * SE_TAX_RATE;
    const newGross = ownerPay + annualOverhead - materialsNetAnnual + seTax - (seTax * SE_DEDUCTIBLE_HALF);
    if (Math.abs(newGross - grossBillable) < 1) break;
    grossBillable = newGross;
  }
  const rateFloor = annualBillableHours > 0 ? grossBillable / annualBillableHours : 0;
  const seTaxAnnual = (grossBillable + materialsNetAnnual - annualOverhead) * SE_TAX_RATE;
  const annualRevTarget = grossBillable + materialsRevenue * 12;

  const w2MonthlyNet = (w2Salary + benefitsValue) * (1 - taxRate) / 12;

  let cumulativeNet = -startupCosts;
  let breakEvenMonth = null;
  for (let m = 1; m <= 24; m++) {
    const utilPct = m <= rampMonths ? rampUtilization + (1 - rampUtilization) * ((m - 1) / rampMonths) : 1.0;
    const billableRev = rateFloor * billableHoursPerWeek * utilPct * (weeksWorked / 12);
    const matNet = materialsRevenue * materialsMarkup;
    const seBase = Math.max(0, billableRev + matNet - monthlyOverhead);
    const seTaxMonthly = seBase * SE_TAX_RATE;
    const netMonthly = seBase - seTaxMonthly;
    cumulativeNet += netMonthly;
    if (breakEvenMonth === null && netMonthly >= w2MonthlyNet) breakEvenMonth = m;
  }
  const cashRunway = startupCosts + rampMonths * monthlyOverhead;

  const _cgDomain = {
    inputs: {
      w2Salary: w2Salary, benefitsValue: benefitsValue, taxRatePct: taxRate * 100,
      startupCosts: startupCosts, monthlyOverhead: monthlyOverhead,
      ownerPay: ownerPay, rampMonths: rampMonths,
      billableHoursPerWeek: billableHoursPerWeek, weeksWorked: weeksWorked,
    },
    outputs: {
      billableRateFloor: Math.round(rateFloor * 100) / 100,
      breakEvenMonth:    breakEvenMonth,
      annualRevTarget:   Math.round(annualRevTarget),
      seTaxAnnual:       Math.round(seTaxAnnual),
      cashRunwayNeeded:  Math.round(cashRunway),
    },
    downstream_handoff_candidates: ['AL-118', 'AL-23'],
    metadata: { data_vintage: 'SECA §1401 (SE tax 15.3%); zero embedded rate tables', tool_name: 'Contractor Business Launch Break-Even' },
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
      apex_meta: { ap2_mandate_type: 'contractor_launch_record', al_id: 'AL-131', tool_name: 'Contractor Business Launch Break-Even', downstream_handoff_candidates: ['AL-118', 'AL-23'] },
    },
  };
}
