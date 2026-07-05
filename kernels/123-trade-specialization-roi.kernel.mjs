/**
 * 123-trade-specialization-roi.kernel.mjs
 * OpenChainGraph server-side kernel — Trade Specialization & Certification ROI (AL-130).
 *
 * Compute ported VERBATIM from repo/tools/123-trade-specialization-roi/index.html
 * (npvCalc() L288-297 + calculate() L299-333 + buildAP2 L433-459). _cgDomain preimage =
 * { inputs, outputs, downstream_handoff_candidates, metadata }.
 *
 * In the browser, certs are read from up to 4 fixed DOM ids (certName-1..4, cost-1..4,
 * etc.) via getElementById, defaulting each missing field to 0. This kernel takes an
 * equivalent `certs` array of { name, cost, premium, newWork, renewCost, renewYears }
 * objects (empty array = no certs, matching the fake-DOM fixture case where no cert rows
 * are present in the harness — same "0 certs -> alert() no-op" behavior in the browser,
 * so an empty certs array is a degenerate case handled the same way here).
 *
 * GUEST-LEGAL — INTEGER-EXPONENT _detmath: the browser uses Math.pow(1+rate, y) in npvCalc
 * where y is an integer loop counter (1..years). Math.pow is BANNED in-guest, so this kernel
 * uses `ipow` = loop multiplication (OCG §3). Math.pow(base,int) and ipow(base,int) differ
 * only in the last ULP; every preimage output is Math.round(...) to whole dollars, which
 * absorbs that ~1e-15 difference — so kernel == browser byte-for-byte (proven by
 * kernel-parity). No Math.pow/log/exp; no Date/Intl/locale in the preimage path;
 * finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '123-trade-specialization-roi';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-130',
  mcp_name:     'calculate_trade_specialization_roi',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'trade_specialization_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
// Guest-legal integer power (loop multiplication). n must be a non-negative integer.
const ipow = (base, n) => { let r = 1; const k = n < 0 ? 0 : Math.floor(n); for (let i = 0; i < k; i++) r *= base; return r; };

function npvCalc(annualBenefit, cost, renewalCost, renewalYears, years, rate) {
  let pv = -cost;
  for (let y = 1; y <= years; y++) {
    const benefit = annualBenefit / ipow(1 + rate, y);
    const renewal = (renewalYears > 0 && y > 0 && y % renewalYears === 0)
      ? renewalCost / ipow(1 + rate, y) : 0;
    pv += benefit - renewal;
  }
  return pv;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const currentEarnings = num(g('currentEarnings')) || 62000;
  const yearsRemaining = Math.trunc(num(g('yearsRemaining'))) || 20;
  const discountRate = num(g('discountRate')) / 100 || 0.04;
  const rawCerts = Array.isArray(g('certs')) ? g('certs') : [];

  const certs = [];
  for (const c of rawCerts) {
    const name = (c && c.name) || `Cert #${certs.length + 1}`;
    const cost = num(c && c.cost) || 0;
    const premium = num(c && c.premium) || 0;
    const newWork = num(c && c.newWork) || 0;
    const renewCost = num(c && c.renewCost) || 0;
    const renewYears = Math.trunc(num(c && c.renewYears)) || 0;

    const annualBenefit = premium + newWork;
    const npv = npvCalc(annualBenefit, cost, renewCost, renewYears, yearsRemaining, discountRate);
    const bcr = cost > 0 ? (annualBenefit * yearsRemaining) / (cost + (renewYears > 0 ? renewCost * Math.floor(yearsRemaining / renewYears) : 0)) : Infinity;
    const paybackYears = annualBenefit > 0 ? cost / annualBenefit : null;

    certs.push({ name, cost, premium, newWork, annualBenefit, renewCost, renewYears, npv, bcr, paybackYears });
  }

  const totalNPV = certs.reduce((s, c) => s + c.npv, 0);
  const totalCost = certs.reduce((s, c) => s + c.cost, 0);
  const totalAnnualPremium = certs.reduce((s, c) => s + c.annualBenefit, 0);
  const sortedByNPV = [...certs].sort((a, b) => b.npv - a.npv);

  const _cgDomain = {
    inputs: {
      currentEarnings: currentEarnings,
      yearsRemaining: yearsRemaining,
      discountRatePct: discountRate * 100,
      certs: certs.map((c) => ({ name: c.name, cost: c.cost, annualPremium: c.premium, newWorkValue: c.newWork })),
    },
    outputs: {
      totalNPV: Math.round(totalNPV),
      totalCost: Math.round(totalCost),
      combinedAnnualPremium: Math.round(totalAnnualPremium),
      bestCert: sortedByNPV.length ? sortedByNPV[0].name : null,
      bestCertNPV: sortedByNPV.length ? Math.round(sortedByNPV[0].npv) : null,
      certRanking: sortedByNPV.map((c) => ({ name: c.name, npv: Math.round(c.npv) })),
    },
    downstream_handoff_candidates: ['AL-131', 'AL-28'],
    metadata: {
      data_vintage: 'Zero maint — pure NPV formula',
      tool_name: 'Trade Specialization & Certification ROI',
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
      apex_meta: { ap2_mandate_type: 'trade_specialization_record', al_id: 'AL-130', tool_name: 'Trade Specialization & Certification ROI', downstream_handoff_candidates: ['AL-131', 'AL-28'] },
    },
  };
}
