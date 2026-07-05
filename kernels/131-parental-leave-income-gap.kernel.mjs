/**
 * 131-parental-leave-income-gap.kernel.mjs
 * OpenChainGraph server-side kernel — Parental Leave Income Gap Planner (AL-138).
 *
 * Compute ported VERBATIM from repo/tools/131-parental-leave-income-gap/index.html
 * (calculate() L259-328 + exportAP2 preimage L382-416). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * NOTE: calculate()'s week-by-week rows[] (L283-310) and weeklyNet drive on-page
 * table/text only — not part of exportAP2's inputs/outputs — omitted from the
 * kernel preimage accordingly (totalGap/avgLeaveMonthly/etc. still computed here
 * since they ARE exported).
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round/ceil/abs only
 * (no pow/exp/log); no Date/Intl/locale in the preimage path; finite-guarded.
 * Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '131-parental-leave-income-gap';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-138',
  mcp_name:     'plan_parental_leave_income_gap',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'parental_leave_income_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

const STATE_PFL_RATES = {
  none: 0, ca: 0.65, ny: 0.67, nj: 0.85, wa: 0.75, co: 0.90, or: 0.60, custom: null,
};
const STATE_CAPS_WEEKLY = {
  none: 0, ca: 1620, ny: 1177, nj: 1055, wa: 1574, co: 1292, or: 1470, custom: 99999,
};

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const baseSalary          = num(g('baseSalary')) || 85000;
  const taxRate             = (num(g('taxRate')) / 100) || 0.22;
  const monthlyExpenses     = num(g('monthlyExpenses')) || 6500;
  const partnerIncome       = num(g('partnerIncome')) || 0;
  const savings             = num(g('savings')) || 20000;
  const employerPaidWeeks   = num(g('employerPaidWeeks')) || 0;
  const employerPartialWeeks = num(g('employerPartialWeeks')) || 0;
  const employerPartialPct = (num(g('employerPartialPct')) / 100) || 0.60;
  const stateProgram        = g('stateProgram');
  const statePflWeeks       = num(g('statePflWeeks')) || 0;
  const customPflRate       = (num(g('customPflRate')) / 100) || 0.60;
  const totalLeaveWeeks     = num(g('totalLeaveWeeks')) || 16;
  const babyExpense         = num(g('babyExpense')) || 0;

  const weeklyGross = baseSalary / 52;
  const weeklyNet = weeklyGross * (1 - taxRate);
  const weeklyExpenses = (monthlyExpenses + babyExpense) / 4.333;
  const weeklyPartner = partnerIncome / 4.333;

  const statePflRate = stateProgram === 'custom' ? customPflRate : STATE_PFL_RATES[stateProgram];
  const stateCap = STATE_CAPS_WEEKLY[stateProgram] || 99999;
  const statePflWeekly = Math.min(weeklyGross * statePflRate, stateCap) * (1 - taxRate * 0.5);

  let totalGap = 0;
  let totalIncome = 0;

  for (let w = 1; w <= totalLeaveWeeks; w++) {
    let empPay, statePfl;

    if (w <= employerPaidWeeks) {
      empPay = weeklyNet;
    } else if (w <= employerPaidWeeks + employerPartialWeeks) {
      empPay = weeklyNet * employerPartialPct;
    } else {
      empPay = 0;
    }

    statePfl = w <= statePflWeeks ? statePflWeekly : 0;
    const combinedIncome = Math.min(empPay + statePfl, weeklyNet * 1.05) + weeklyPartner;
    const net = combinedIncome - weeklyExpenses;
    if (net < 0) totalGap += Math.abs(net);
    totalIncome += combinedIncome;
  }

  const avgLeaveMonthly = (totalIncome / totalLeaveWeeks) * 4.333;
  const savingsNeeded = totalGap;
  const isFullyCovered = savings >= savingsNeeded;

  const returnMonthlyNet = (baseSalary / 12) * (1 - taxRate);
  const surplusPerMonth = Math.max(0, returnMonthlyNet + partnerIncome - monthlyExpenses - babyExpense);
  const recoveryMonths = surplusPerMonth > 0 ? Math.ceil(savingsNeeded / surplusPerMonth) : 999;

  const _cgDomain = {
    inputs: {
      baseSalary: baseSalary, totalLeaveWeeks: totalLeaveWeeks,
      employerPaidWeeks: employerPaidWeeks, statePflWeeks: statePflWeeks,
      stateProgram: stateProgram, monthlyExpenses: monthlyExpenses, babyExpense: babyExpense,
    },
    outputs: {
      totalIncomeGap: Math.round(totalGap), avgLeaveMonthly: Math.round(avgLeaveMonthly),
      savingsNeeded: Math.round(savingsNeeded), recoveryMonths: recoveryMonths < 999 ? recoveryMonths : null,
      isFullyCovered: isFullyCovered,
    },
    downstream_handoff_candidates: ['AL-137'],
    metadata: { data_vintage: '29 CFR §825 (FMLA); state PFL rates 2025 (CA/NY/NJ/WA/CO/OR)', tool_name: 'Parental Leave Income Gap Planner' },
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
      apex_meta: { ap2_mandate_type: 'parental_leave_income_record', al_id: 'AL-138', tool_name: 'Parental Leave Income Gap Planner', downstream_handoff_candidates: ['AL-137'] },
    },
  };
}
