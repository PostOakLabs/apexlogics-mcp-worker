/**
 * 122-trade-wage-progression-projector.kernel.mjs
 * OpenChainGraph server-side kernel — Apprentice -> Journeyman -> Master Wage-Progression
 * Projector (AL-129).
 *
 * Compute ported VERBATIM from repo/tools/122-trade-wage-progression-projector/index.html
 * (calculate() L326-433 + buildAP2 L559-590). _cgDomain preimage = { inputs, outputs,
 * downstream_handoff_candidates, metadata }.
 *
 * GUEST-LEGAL — INTEGER-EXPONENT _detmath: the browser uses Math.pow(1+annualRaise, n) where
 * n = journeymanYearsWorked / yearsInCurrentStage (integer loop counters, 0..yearsProject), and
 * an amortization Math.pow(1+monthlyRate, nPayments) where nPayments = LOAN_YEARS*12 = 120
 * (integer), plus Math.pow(1+degreeRaise, degreeYear-1) where degreeYear is an integer loop
 * counter. Math.pow is BANNED in-guest, so this kernel uses `ipow` = loop multiplication
 * (OCG §3). Math.pow(base,int) and ipow(base,int) differ only in the last ULP; every preimage
 * output is Math.round(...) to whole dollars, which absorbs that ~1e-15 difference — so
 * kernel == browser byte-for-byte (proven by kernel-parity). No Math.pow/log/exp; no
 * Date/Intl/locale in the preimage path; finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '122-trade-wage-progression-projector';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-129',
  mcp_name:     'project_trade_wage_progression',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'trade_wage_progression_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
// Guest-legal integer power (loop multiplication). n must be a non-negative integer.
const ipow = (base, n) => { let r = 1; const k = n < 0 ? 0 : Math.floor(n); for (let i = 0; i < k; i++) r *= base; return r; };

const TRADE_WAGES = {
  electrician: 31.00,
  plumber: 30.00,
  hvac: 27.00,
  carpenter: 25.00,
  welder: 23.00,
  other: 27.00,
};

const APPRENT_RAMP = [0.50, 0.60, 0.70, 0.80, 0.90, 0.95];
const WEEKS_PER_YEAR = 52;
const OT_MULT = 1.5;
const LOAN_RATE = 0.06;
const LOAN_YEARS = 10;

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const trade = g('trade') ?? 'other';
  const currentStage = g('currentStage') ?? 'apprentice';
  const journeymanWage = num(g('journeymanWage')) || (TRADE_WAGES[trade] ?? 30);
  const apprenticeYears = Math.trunc(num(g('apprenticeYears'))) || 4;
  const masterPremium = num(g('masterPremium')) / 100 || 0.25;
  const weeklyHours = num(g('weeklyHours')) || 40;
  const otHours = num(g('otHours')) || 0;
  const annualRaise = num(g('annualRaise')) / 100 || 0.025;
  const yearsProject = Math.trunc(num(g('yearsProject'))) || 20;
  const currentYearInStage = Math.trunc(num(g('currentYear'))) || 1;
  const degreeCost = num(g('degreeCost')) || 0;
  const degreeStartSalary = num(g('degreeStartSalary')) || 55000;
  const degreeRaise = num(g('degreeRaise')) / 100 || 0.03;

  const masterWage = journeymanWage * (1 + masterPremium);
  const baseHoursAnnual = weeklyHours * WEEKS_PER_YEAR;

  const rows = [];
  let stageTracker = currentStage;
  let yearsInCurrentStage = currentYearInStage - 1;
  let cumulative = 0;
  let journeymanYearsWorked = 0;

  for (let y = 1; y <= yearsProject; y++) {
    let stage, hourly;

    if (stageTracker === 'apprentice') {
      const rampIdx = Math.min(yearsInCurrentStage, APPRENT_RAMP.length - 1);
      hourly = journeymanWage * APPRENT_RAMP[rampIdx];
      stage = `Apprentice Y${yearsInCurrentStage + 1}`;
      yearsInCurrentStage++;
      if (yearsInCurrentStage >= apprenticeYears) {
        stageTracker = 'journeyman';
        yearsInCurrentStage = 0;
      }
    } else if (stageTracker === 'journeyman') {
      hourly = journeymanWage * ipow(1 + annualRaise, journeymanYearsWorked);
      stage = 'Journeyman';
      yearsInCurrentStage++;
      journeymanYearsWorked++;
    } else {
      hourly = masterWage * ipow(1 + annualRaise, yearsInCurrentStage);
      stage = 'Master/Foreman';
      yearsInCurrentStage++;
    }

    const baseAnnual = hourly * baseHoursAnnual;
    const otAnnual = hourly * OT_MULT * otHours;
    const totalAnnual = baseAnnual + otAnnual;
    cumulative += totalAnnual;

    rows.push({ year: y, stage, hourly, baseAnnual, otAnnual, totalAnnual, cumulative });
  }

  const lifetimeEarnings = cumulative;
  const journeymanAnnual = journeymanWage * baseHoursAnnual;
  const masterAnnual = masterWage * baseHoursAnnual;
  const otContrib = journeymanWage * OT_MULT * otHours;

  let degreeData = null;
  if (degreeCost > 0 || degreeStartSalary > 0) {
    const monthlyRate = LOAN_RATE / 12;
    const nPayments = LOAN_YEARS * 12;
    const monthlyPayment = degreeCost > 0
      ? degreeCost * (monthlyRate * ipow(1 + monthlyRate, nPayments)) / (ipow(1 + monthlyRate, nPayments) - 1)
      : 0;
    const annualLoanPayment = monthlyPayment * 12;

    let degreeCumul = 0;
    let breakEvenYear = null;
    let tradesCumul = 0;

    for (let y = 1; y <= yearsProject; y++) {
      let degreeNetIncome;
      if (y <= 4) {
        degreeNetIncome = 0;
      } else {
        const degreeYear = y - 4;
        const degreeSalary = degreeStartSalary * ipow(1 + degreeRaise, degreeYear - 1);
        const loanPaymentThisYear = y <= 4 + LOAN_YEARS ? annualLoanPayment : 0;
        degreeNetIncome = degreeSalary - loanPaymentThisYear;
      }
      degreeCumul += Math.max(0, degreeNetIncome);
      tradesCumul = rows[y - 1].cumulative;
      if (breakEvenYear === null && degreeCumul >= tradesCumul) {
        breakEvenYear = y;
      }
    }
    const headstart = tradesCumul - degreeCumul;
    degreeData = { degreeCumul, tradesCumul, headstart, breakEvenYear };
  }

  const _cgDomain = {
    inputs: {
      trade: trade,
      currentStage: currentStage,
      journeymanWage: journeymanWage,
      apprenticeYears: apprenticeYears,
      masterPremiumPct: masterPremium * 100,
      weeklyHours: weeklyHours,
      otHoursPerYear: otHours,
      annualRaisePct: annualRaise * 100,
      yearsProject: yearsProject,
    },
    outputs: {
      lifetimeEarnings: Math.round(lifetimeEarnings),
      journeymanAnnual: Math.round(journeymanAnnual),
      masterAnnual: Math.round(masterAnnual),
      otAnnualContribution: Math.round(otContrib),
      tradeAdvantageVsDegree: degreeData ? Math.round(degreeData.headstart) : null,
      degreeBreakEvenYear: degreeData ? degreeData.breakEvenYear : null,
    },
    downstream_handoff_candidates: ['AL-130', 'AL-131'],
    metadata: {
      data_vintage: 'BLS OEWS May 2025',
      tool_name: 'Apprentice → Journeyman → Master Wage-Progression Projector',
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
      apex_meta: { ap2_mandate_type: 'trade_wage_progression_record', al_id: 'AL-129', tool_name: 'Apprentice → Journeyman → Master Wage-Progression Projector', downstream_handoff_candidates: ['AL-130', 'AL-131'] },
    },
  };
}
