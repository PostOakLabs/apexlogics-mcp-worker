/**
 * 22-student-loan-repayment-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — Student Loan Repayment Optimizer (AL-13).
 *
 * Compute ported VERBATIM from repo/tools/22-student-loan-repayment-optimizer/index.html
 * (stdPayment/amortize-unused/calcGraduated/calcIDR/calcICR L920-1024 + calcAll() L1027-1089
 * + buildAP2() L1330-1406 preimage — the exportPSLFAP2() Tab-2 mandate is a SEPARATE export
 * path not covered by this kernel). _cgDomain here is NOT the {inputs,outputs,metadata} shape
 * used by the 118-145 batch — buildAP2() filters the top-level `mandate` object itself, so
 * _cgDomain = { payload, summary, audit_metadata } and BOTH policy_parameters.inputs and
 * output_payload point at that same object (verbatim, matches KERNEL-EXTRACTION-PATTERNS.md
 * "Two browser preimage shapes" note — this is a third, mandate-object-filter variant).
 *
 * The tool's pill-driven globals (`loanType`, `borrowerEra`) have no DOM inputs — they only
 * change via click handlers the parity harness never fires — so calcAll() always runs with
 * the module defaults ('ug','new'): IBR = 10% discretionary / 20yr forgiveness, PAYE eligible.
 * The kernel hardcodes the same defaults; there is no way to drive a different combination
 * through the exported artifact, matching the browser's actual (only) reachable behavior.
 *
 * INTEGER-EXPONENT _detmath: stdPayment's Math.pow(1+r, months) always has an integer month
 * count (120/144/300) — kernel uses `ipow` (loop multiplication) per OCG §3. Math.pow(base,int)
 * and ipow(base,int) differ only in the last ULP; every preimage output is Math.round(...) to
 * whole dollars, which absorbs that ~1e-15 difference (proven by kernel-parity).
 *
 * NOT YET GUEST-LEGAL: calcGraduated's k = Math.pow(3, 1/5) is a fixed FRACTIONAL exponent
 * constant (not input-driven). Kernel calls the same Math.pow(3, 1/5) expression the browser
 * does (not yet migrated to vendored _detmath.pow) — byte-exact under kernel-parity.mjs
 * (both sides execute in the same Node/V8 process) but not proven bit-identical against a
 * Workers/zkVM-guest libm. Flag for a future _detmath pass alongside the 120-style browser
 * patch if this kernel is ever routed to §18 proving.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '22-student-loan-repayment-optimizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-13',
  mcp_name:     'optimize_loan_repayment',
  mandate_type: 'org.apexlogics/student_finance',
  ap2_mandate_type: 'loan_repayment_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
// Guest-legal integer power (loop multiplication). n must be a non-negative integer.
const ipow = (base, n) => { let r = 1; const k = n < 0 ? 0 : Math.floor(n); for (let i = 0; i < k; i++) r *= base; return r; };

const FPL = { 1: 15650, 2: 21150, 3: 26650, 4: 32150, 5: 37650, 6: 43150, 7: 48650, 8: 54150 };

function stdPayment(bal, annualRate, months) {
  const r = annualRate / 100 / 12;
  if (r === 0) return bal / months;
  return bal * r * ipow(1 + r, months) / (ipow(1 + r, months) - 1);
}

function calcGraduated(bal, annualRate) {
  const r = annualRate / 100 / 12;
  const k = Math.pow(3, 1 / 5);
  function simulate(p0) {
    let b = bal, p = p0;
    for (let m = 0; m < 120; m++) {
      if (m > 0 && m % 24 === 0) p *= k;
      const interest = b * r;
      b = b + interest - p;
    }
    return b;
  }
  let lo = bal * r + 0.01, hi = bal * 0.1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    simulate(mid) > 0 ? lo = mid : hi = mid;
  }
  const p0 = (lo + hi) / 2;
  let totalPaid = 0, totalInterest = 0, p = p0, b = bal;
  for (let m = 0; m < 120; m++) {
    if (m > 0 && m % 24 === 0) p *= k;
    const interest = b * r;
    totalInterest += interest;
    b = b + interest - p;
    totalPaid += p;
  }
  return { payment: p0, totalPaid, totalInterest, months: 120, forgiven: 0 };
}

function calcIDR(bal, annualRate, agi, familySize, idrPct, capPmt, forgiveYrs, incomeGrowth) {
  const r = annualRate / 100 / 12;
  const fpl = FPL[Math.min(familySize, 8)] || FPL[8];
  const forgiveMonths = forgiveYrs * 12;
  let b = bal, totalPaid = 0, totalInterest = 0, currentAgi = agi;

  for (let m = 0; m < forgiveMonths; m++) {
    if (m > 0 && m % 12 === 0) { currentAgi *= (1 + incomeGrowth / 100); }
    const discretionary = Math.max(0, currentAgi - 1.5 * fpl);
    let pmt = Math.max(0, (idrPct / 100) * discretionary / 12);
    if (capPmt > 0) pmt = Math.min(pmt, capPmt);
    const interest = b * r;
    totalInterest += interest;
    const principal = Math.max(0, pmt - interest);
    b = Math.max(0, b - principal);
    totalPaid += pmt;
    if (b <= 0.01) {
      return { payment: (idrPct / 100) * Math.max(0, agi - 1.5 * fpl) / 12, totalPaid, totalInterest, months: m + 1, forgiven: 0, paidOff: true };
    }
  }
  return { payment: (idrPct / 100) * Math.max(0, agi - 1.5 * fpl) / 12, totalPaid, totalInterest, months: forgiveMonths, forgiven: Math.max(0, b) };
}

function calcICR(bal, annualRate, agi, familySize, incomeGrowth) {
  const r = annualRate / 100 / 12;
  const fpl = FPL[Math.min(familySize, 8)] || FPL[8];
  const forgiveMonths = 300;
  let b = bal, totalPaid = 0, totalInterest = 0, currentAgi = agi;

  for (let m = 0; m < forgiveMonths; m++) {
    if (m > 0 && m % 12 === 0) currentAgi *= (1 + incomeGrowth / 100);
    const discretionary = Math.max(0, currentAgi - fpl);
    const pmtA = 0.20 * discretionary / 12;
    const pmt = Math.max(5, pmtA);
    const interest = b * r;
    totalInterest += interest;
    const principal = Math.max(0, pmt - interest);
    b = Math.max(0, b - principal);
    totalPaid += pmt;
    if (b <= 0.01) {
      return { payment: pmtA, totalPaid, totalInterest, months: m + 1, forgiven: 0, paidOff: true };
    }
  }
  return { payment: 0.20 * Math.max(0, agi - fpl) / 12, totalPaid, totalInterest, months: forgiveMonths, forgiven: Math.max(0, b) };
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const bal   = num(g('balance'));
  const rate  = num(g('rate'));
  const agi   = num(g('agi'));
  const family = Math.trunc(num(g('family'))) || 1;
  const incGrowth = num(g('income_growth'));

  // Module defaults — the browser only ever ships these (no DOM path drives them).
  const loanType = 'ug';
  const borrowerEra = 'new';

  const stdPmt = stdPayment(bal, rate, 120);
  const standard = { name: 'Standard 10-Year', payment: stdPmt, totalPaid: stdPmt * 120, totalInterest: stdPmt * 120 - bal, months: 120, forgiven: 0, eligible: true };

  const grad = calcGraduated(bal, rate);
  grad.name = 'Graduated 10-Year';
  grad.eligible = true;

  const extended = { name: 'Extended 25-Year', eligible: bal >= 30000 };
  if (extended.eligible) {
    const extPmt = stdPayment(bal, rate, 300);
    extended.payment = extPmt;
    extended.totalPaid = extPmt * 300;
    extended.totalInterest = extPmt * 300 - bal;
    extended.months = 300;
    extended.forgiven = 0;
  }

  const ibrPct = borrowerEra === 'new' ? 10 : 15;
  const ibrForgiveYrs = (loanType === 'ug') ? 20 : 25;
  const ibr = calcIDR(bal, rate, agi, family, ibrPct, stdPmt, ibrForgiveYrs, incGrowth);
  ibr.name = `IBR (${ibrPct}% discretionary, ${ibrForgiveYrs}yr)`;
  ibr.eligible = true;

  const paye_eligible = borrowerEra === 'new';
  const paye = paye_eligible
    ? calcIDR(bal, rate, agi, family, 10, stdPmt, 20, incGrowth)
    : { eligible: false };
  paye.name = 'PAYE (10%, 20yr)';
  paye.eligible = paye_eligible;

  const icr = calcICR(bal, rate, agi, family, incGrowth);
  icr.name = 'ICR (20%, 25yr)';
  icr.eligible = true;

  const plans = [standard, grad, extended, ibr, paye, icr].filter((p) => p.eligible !== false);
  const eligible = plans.filter((p) => p.eligible);
  let bestIdx = 0;
  eligible.forEach((p, i) => { if (p.totalPaid < eligible[bestIdx].totalPaid) bestIdx = i; });
  const best = eligible[bestIdx];

  const payload = {
    loan_balance: bal,
    interest_rate: rate,
    agi,
    family_size: family,
    recommended_plan: best ? best.name : null,
    recommended_monthly_payment: best ? Math.round(best.payment) : null,
    recommended_total_paid: best ? Math.round(best.totalPaid) : null,
    recommended_total_interest: best ? Math.round(best.totalInterest) : null,
    recommended_forgiven: best ? Math.round(best.forgiven) : null,
    recommended_months: best ? best.months : null,
    plan_comparison: eligible.map((p) => ({
      name: p.name,
      monthly_payment_yr1: Math.round(p.payment),
      total_paid: Math.round(p.totalPaid),
      total_interest: Math.round(p.totalInterest),
      forgiven: Math.round(p.forgiven || 0),
      months: p.months,
    })),
    downstream_handoff_candidates: ['AL-26'],
    data_vintage: '2026-01',
  };

  const fmt = (n) => n.toLocaleString('en-US');
  const summary = `Loan balance: $${fmt(bal)} at ${rate}%. Best plan: ${best ? best.name : 'N/A'} — $${best ? fmt(Math.round(best.payment)) : 'N/A'}/mo, $${best ? fmt(Math.round(best.totalPaid)) : 'N/A'} total paid, $${best ? fmt(Math.round(best.forgiven || 0)) : '0'} forgiven.`;

  const audit_metadata = {
    execution_hash: null,
    client_side_executed: true,
    zero_pii_verified: true,
    deterministic_run: true,
    data_vintage: '2026-01',
  };

  const _cgDomain = { payload, summary, audit_metadata };
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
      apex_meta: { ap2_mandate_type: 'loan_repayment_record', al_id: 'AL-13', tool_name: 'Student Loan Repayment Optimizer', downstream_handoff_candidates: ['AL-26'] },
    },
  };
}
