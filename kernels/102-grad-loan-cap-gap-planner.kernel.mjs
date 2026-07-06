/**
 * 102-grad-loan-cap-gap-planner.kernel.mjs
 * OpenChainGraph server-side kernel — Grad Loan Cap Gap Planner (AL-109).
 *
 * Compute ported VERBATIM from repo/tools/102-grad-loan-cap-gap-planner/index.html
 * calcGap() (L543-579) + PROG_CAPS. The exported artifact's preimage is driven by
 * lastGapResult ONLY — the Tab-2 amortization (stdPayment / Math.pow) is NOT in the
 * hash preimage, so this kernel is pure arithmetic (caps + a per-year min/max loop).
 * Emits summary.funding_gap — the field the D3 §4a gated chain routes on.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only; finite-guarded.
 * Input keys mirror the tool's DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '102-grad-loan-cap-gap-planner';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-109',
  mcp_name:     'plan_grad_loan_cap_gap',
  mandate_type: 'org.apexlogics/student_finance',
  ap2_mandate_type: 'grad_loan_gap_record',
  gpu:          false,
};

// OBBBA 2025 federal loan caps, effective 2026-07-01 for new borrowers.
const PROG_CAPS = {
  grad_other: { annual: 20500, lifetime: 100000, label: 'Graduate (MS/MPH/MPA…)' },
  mba:        { annual: 20500, lifetime: 100000, label: 'MBA (full-time)' },
  law:        { annual: 50000, lifetime: 200000, label: 'Law (JD)' },
  med:        { annual: 50000, lifetime: 200000, label: 'Medicine (MD/DO)' },
  dent:       { annual: 50000, lifetime: 200000, label: 'Dentistry (DMD/DDS)' },
  pharm:      { annual: 50000, lifetime: 200000, label: 'Pharmacy (PharmD)' },
};

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const pf = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
  const pi = (v, d) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : d; };

  const progType   = g('prog_type');
  const coa        = pf(g('coa'), 0);
  const years      = pi(g('years'), 2);
  const existingFed= pf(g('existing_fed'), 0);
  const fellowship = pf(g('fellowship'), 0);
  const empTuition = pf(g('employer_tuition'), 0);
  const savings    = pf(g('savings_contrib'), 0);
  const otherAid   = pf(g('other_aid'), 0);

  const cap = PROG_CAPS[progType];
  const annualAid = fellowship + empTuition + otherAid;
  const savingsPerYear = savings / years;
  const totalAidPerYear = annualAid + savingsPerYear;

  let fedRemaining = cap.lifetime - existingFed;
  let totalFedBorrowed = 0;
  let totalAid = 0;
  let totalGap = 0;
  const totalCOA = coa * years;

  for (let yr = 1; yr <= years; yr++) {
    const fedElig   = Math.min(cap.annual, Math.max(0, fedRemaining));
    const actualFed = Math.min(fedElig, Math.max(0, coa - totalAidPerYear));
    const actualAid = Math.min(totalAidPerYear, coa);
    const gap       = Math.max(0, coa - actualFed - actualAid);
    fedRemaining -= actualFed;
    totalFedBorrowed += actualFed;
    totalAid += actualAid;
    totalGap += gap;
  }

  // ── exported artifact preimage (_cgDomain), matching exportAP2 key order ──
  const _cgDomain = {
    inputs: {
      program_type: progType || null,
      annual_coa: coa || null,
      program_years: years || null,
      existing_federal_balance: existingFed || 0,
      annual_fellowship: fellowship || 0,
      employer_tuition: empTuition || 0,
      savings_contrib: savings || 0,
    },
    summary: {
      total_coa: Math.round(totalCOA),
      federal_available: Math.round(totalFedBorrowed),
      total_aid: Math.round(totalAid),
      funding_gap: Math.round(totalGap),
    },
    downstream_handoff_candidates: ['AL-98', 'AL-96', 'AL-26'],
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
      apex_meta: { ap2_mandate_type: 'grad_loan_gap_record', al_id: 'AL-109', tool_name: 'Grad Loan Cap Gap Planner', downstream_handoff_candidates: ['AL-98', 'AL-96', 'AL-26'] },
    },
  };
}
