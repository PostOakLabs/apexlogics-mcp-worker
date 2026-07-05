/**
 * 38-early-career-net-worth-engine.kernel.mjs
 * OpenChainGraph server-side kernel — Early Career Net Worth Trajectory Engine (AL-43).
 *
 * Compute ported VERBATIM from repo/tools/38-early-career-net-worth-engine/index.html
 * (BRACKETS/STD_DED/FICA/K401_LIMIT + federalTax + afterTax + project() L375-420 +
 * calculate() L426-455 + exportAP2 preimage L706-753). Direct-artifact preimage shape
 * (tool-40 family): policy_parameters = {execution_backend, hash_precision, inputs},
 * output_payload = the results object. kernel-parity.mjs proves browser==kernel.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs. The tool's salary compounding uses
 * Math.pow(1+g/100, y) with y an INTEGER year index (1..10) — replaced here by ipow()
 * loop-multiply (§18.5 integer-exponent rule): Math.pow(b,int) and ipow(b,int) differ
 * only in the last ULP, which the dollar-rounded outputs absorb → byte-exact vs the
 * browser with NO browser change (same procedure as kernels 119/121/122/123). No
 * pow/exp/log/Date/Intl in the preimage path (toLocaleString lives only in UI fmt
 * helpers, omitted). Finite-guarded. Input keys mirror DOM ids via the CASE.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '38-early-career-net-worth-engine';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-43',
  mcp_name:     'project_early_career_net_worth',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'net_worth_trajectory_record',
  gpu:          false,
};

// ── TAX CONSTANTS (ported verbatim; 2026 vintage) ─────────────────────────────
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
const STD_DED    = { single: 16100, mfj: 32200 };
const FICA       = 0.0765;
const K401_LIMIT = 24500;

// Faithful `parseFloat(x) || D` mirror: NaN or 0 collapse to the (finite) default.
// Guest-legal — result is always finite because every D is finite.
const num = (v, d) => { const p = parseFloat(v); return p || d; };

// Integer-exponent power via loop-multiply (guest-legal; replaces Math.pow(b, int)).
function ipow(base, n) {
  let r = 1;
  for (let i = 0; i < n; i++) r *= base;
  return r;
}

function federalTax(gross, status, contrib401k) {
  const deduct = STD_DED[status];
  const taxable = Math.max(0, gross - contrib401k - deduct);
  let tax = 0;
  for (const b of BRACKETS[status]) {
    if (taxable <= b.min) break;
    tax += (Math.min(taxable, b.max) - b.min) * b.rate;
  }
  return tax;
}

function afterTax(gross, status, contrib401k) {
  const ftax = federalTax(gross, status, contrib401k);
  const fica = gross * FICA;
  return gross - contrib401k - ftax - fica;
}

function project(params, years) {
  const { startSalary, growthRate, savingsRate, status,
          debtBalance, loanRate, monthlyPmt,
          contrib401kPct, matchPct, matchCap, returnRate } = params;

  const rows = [];
  let portfolio = 0;
  let debt = debtBalance;
  const annualPmt = monthlyPmt * 12;

  rows.push({ year: 0, salary: startSalary, afterTaxIncome: 0,
    newSavings: 0, portfolio: 0, debt, netWorth: -debt, note: 'Starting position' });

  for (let y = 1; y <= years; y++) {
    const salary = startSalary * ipow(1 + growthRate / 100, y);   // integer y → ipow

    const empContrib = Math.min(salary * contrib401kPct / 100, K401_LIMIT);
    const matchable  = Math.min(salary * contrib401kPct / 100, salary * matchCap / 100);
    const empMatch   = matchable * matchPct / 100;
    const total401k  = empContrib + empMatch;

    const atIncome = afterTax(salary, status, empContrib);
    const brokerageSavings = atIncome * savingsRate / 100;

    portfolio = (portfolio + brokerageSavings + total401k) * (1 + returnRate / 100);

    if (debt > 0) {
      const interestAccrued = debt * loanRate / 100;
      const payment = Math.min(annualPmt, debt + interestAccrued);
      const principal = Math.max(0, payment - interestAccrued);
      debt = Math.max(0, debt - principal);
    }

    const netWorth = portfolio - debt;
    rows.push({ year: y, salary, afterTaxIncome: atIncome, empContrib, empMatch,
      newSavings: brokerageSavings + total401k, portfolio, debt, netWorth });
  }
  return rows;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const startSalary  = num(g('startSalary'), 52000);
  const growthRate   = num(g('salaryGrowth'), 4);
  const savingsRate  = num(g('savingsRate'), 15);
  const status       = (g('filingStatus') === 'mfj') ? 'mfj' : 'single';
  const debtBalance  = num(g('debtBalance'), 0);
  const loanRate     = num(g('loanRate'), 5.5);
  const monthlyPmt   = num(g('monthlyPayment'), 0);
  const contrib401k  = num(g('contrib401k'), 0);
  const matchPct     = num(g('matchPct'), 0);
  const matchCap     = num(g('matchCap'), 0);
  const returnRate   = num(g('investReturn'), 7);
  const YEARS = 10;

  const base = { startSalary, growthRate, savingsRate, status, debtBalance,
    loanRate, monthlyPmt, contrib401kPct: contrib401k, matchPct, matchCap, returnRate };

  const aggRate = Math.min(70, savingsRate + 10);
  const conRate = Math.max(0,  savingsRate - 10);

  const agg  = project({ ...base, savingsRate: aggRate }, YEARS);
  const main = project(base,                              YEARS);
  const con  = project({ ...base, savingsRate: conRate }, YEARS);

  const scenarios = [
    { name: 'Aggressive',  rate: aggRate,     data: agg  },
    { name: 'Base',        rate: savingsRate, data: main },
    { name: 'Under-saver', rate: conRate,     data: con  },
  ];

  const results = {
    scenarios: scenarios.map((sc) => ({
      name: sc.name, savings_rate_pct: sc.rate,
      net_worth_yr5:  Math.round(sc.data[5].netWorth),
      net_worth_yr10: Math.round(sc.data[10].netWorth),
      portfolio_yr10: Math.round(sc.data[10].portfolio),
      debt_yr10:      Math.round(sc.data[10].debt),
      break_even_year: (() => { const r = sc.data.find((r) => r.netWorth >= 0 && r.year > 0); return r ? r.year : null; })(),
    })),
    scenario_gap_yr10: Math.round(scenarios[0].data[10].netWorth - scenarios[2].data[10].netWorth),
  };

  const policy_parameters = {
    execution_backend: 'js',
    hash_precision:    'monetary_usd:2dp',
    inputs: {
      starting_salary:       startSalary,
      salary_growth_pct:     growthRate,
      base_savings_rate_pct: savingsRate,
      filing_status:         status,
      student_debt_balance:  debtBalance,
      loan_rate_pct:         loanRate,
      monthly_loan_payment:  monthlyPmt,
      contrib_401k_pct:      contrib401k,
      employer_match_pct:    matchPct,
      employer_match_cap_pct: matchCap,
      investment_return_pct: returnRate,
    },
  };
  const output_payload = results;
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
      apex_meta: { ap2_mandate_type: 'net_worth_trajectory_record', al_id: 'AL-43', tool_name: 'Early Career Net Worth Trajectory Engine', downstream_handoff_candidates: ['AL-13', 'AL-25'] },
    },
  };
}
