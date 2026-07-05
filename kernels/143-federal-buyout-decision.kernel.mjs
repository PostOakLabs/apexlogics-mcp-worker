/**
 * 143-federal-buyout-decision.kernel.mjs
 * OpenChainGraph server-side kernel — Federal / Public Buyout Decision Engine (AL-150).
 *
 * Compute ported VERBATIM from repo/tools/143-federal-buyout-decision/index.html
 * (calculate() L315-414 + exportAP2 preimage L513-536). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '143-federal-buyout-decision';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-150',
  mcp_name:     'decide_federal_buyout',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'buyout_decision_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
const fmt = (n) => '$' + Math.round(Math.abs(n)).toString();

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const currentSalary       = num(g('currentSalary'));
  const yearsService        = num(g('yearsService'));
  const currentAge          = num(g('currentAge'));
  const retirementSystem    = g('retirementSystem');
  const severancePay        = num(g('severancePay'));
  const continuedHealthMos  = num(g('continuedHealthMonths'));
  const taxRate             = num(g('taxRate'));
  const monthlyHealthCost   = num(g('monthlyHealthCost'));
  const pensionReducPct     = num(g('pensionReducPct')) / 100;
  const privateOfferLow     = num(g('privateOfferLow'));
  const privateOfferBase    = num(g('privateOfferBase'));
  const privateOfferHigh    = num(g('privateOfferHigh'));
  const searchMonths        = num(g('searchMonths'));
  const stayYears           = num(g('stayYears'));

  // ── Net buyout ──
  const netSeverance        = severancePay * (1 - taxRate);
  const healthBridgeValue   = continuedHealthMos * monthlyHealthCost;
  const netBuyout           = netSeverance + healthBridgeValue;

  // ── Pension impact ──
  let annualPensionFull = 0;
  let annualPensionEarly = 0;
  if (retirementSystem === 'fers') {
    const multiplier = (currentAge + stayYears >= 62 && yearsService + stayYears >= 20) ? 0.011 : 0.010;
    annualPensionFull  = multiplier * currentSalary * (yearsService + stayYears);
    annualPensionEarly = annualPensionFull * (1 - pensionReducPct);
  } else if (retirementSystem === 'csrs') {
    annualPensionFull  = 0.02 * currentSalary * (yearsService + stayYears);
    annualPensionEarly = annualPensionFull * (1 - pensionReducPct);
  } else if (retirementSystem === 'state_db') {
    annualPensionFull  = 0.015 * currentSalary * (yearsService + stayYears);
    annualPensionEarly = annualPensionFull * (1 - pensionReducPct);
  } else {
    annualPensionFull  = 0;
    annualPensionEarly = 0;
  }

  const yearsInRetirement  = Math.max(0, 85 - (currentAge + stayYears));
  const pensionLifetimeLost = (annualPensionFull - annualPensionEarly) * yearsInRetirement;

  // ── Income lost during job search ──
  const incomeLostSearch = (currentSalary / 12) * searchMonths * (1 - taxRate);

  // ── 5-year income comparison ──
  const YEARS = 5;
  function exitIncome(offer) {
    const yr1 = offer * ((12 - searchMonths) / 12) * (1 - taxRate);
    const yrN = offer * (1 - taxRate);
    return yr1 + yrN * (YEARS - 1);
  }
  const stayTotal5yr = currentSalary * (1 - taxRate) * YEARS;
  const exitTotalLow  = exitIncome(privateOfferLow)  + netBuyout;
  const exitTotalBase = exitIncome(privateOfferBase) + netBuyout;
  const exitTotalHigh = exitIncome(privateOfferHigh) + netBuyout;

  const netGainLoss = exitTotalBase - stayTotal5yr;

  // ── Scorecard ──
  const scores = [
    { label: 'Net buyout vs. 3 months salary', pass: netBuyout >= currentSalary * 0.25, note: `Buyout net ${fmt(netBuyout)} vs. 3-mo buffer ${fmt(currentSalary * 0.25)}` },
    { label: 'Base private offer > current salary', pass: privateOfferBase > currentSalary, note: `Base offer ${fmt(privateOfferBase)} vs. current ${fmt(currentSalary)}` },
    { label: 'Health coverage bridged', pass: continuedHealthMos >= searchMonths, note: `${continuedHealthMos} mo coverage vs. ${searchMonths} mo search` },
    { label: '5-yr net gain positive (base scenario)', pass: netGainLoss > 0, note: `5-yr net: ${netGainLoss >= 0 ? '+' : ''}${fmt(netGainLoss)}` },
    { label: 'Pension cost acceptable (<20% of 5-yr stay income)', pass: pensionLifetimeLost < stayTotal5yr * 0.2, note: `Pension cost ${fmt(pensionLifetimeLost)} vs. 20% threshold ${fmt(stayTotal5yr * 0.2)}` },
  ];

  const scoreTotal = scores.filter((s) => s.pass).length;
  const scorePct   = Math.round(scoreTotal / scores.length * 100);

  let verdict;
  if (scorePct >= 80) {
    verdict = 'Buyout Favored — Strong Financial Case';
  } else if (scorePct >= 60) {
    verdict = 'Borderline — Depends on Private Offer Quality';
  } else {
    verdict = 'Stay — Financial Profile Favors Remaining';
  }

  const _cgDomain = {
    inputs: {
      currentSalary: currentSalary, yearsService: yearsService, currentAge: currentAge,
      retirementSystem: retirementSystem, severancePay: severancePay,
      continuedHealthMonths: continuedHealthMos, taxRate: taxRate,
      monthlyHealthCost: monthlyHealthCost, pensionReductionPct: pensionReducPct,
      privateOfferBase: privateOfferBase, searchMonths: searchMonths,
    },
    outputs: {
      netBuyout: Math.round(netBuyout), healthBridgeValue: Math.round(healthBridgeValue),
      pensionLifetimeLost: Math.round(pensionLifetimeLost),
      fiveYearNetGainLoss: Math.round(netGainLoss),
      scorecard: scorePct, verdict: verdict,
    },
    downstream_handoff_candidates: ['AL-141', 'AL-143', 'AL-120'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'VSIP cap 5 USC §3523; FERS/CSRS simplified formulas; ACA/COBRA cost estimates' },
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
      apex_meta: { ap2_mandate_type: 'buyout_decision_record', al_id: 'AL-150', tool_name: 'Federal / Public Buyout Decision Engine', downstream_handoff_candidates: ['AL-141', 'AL-143', 'AL-120'] },
    },
  };
}
