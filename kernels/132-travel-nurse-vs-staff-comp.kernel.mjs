/**
 * 132-travel-nurse-vs-staff-comp.kernel.mjs
 * OpenChainGraph server-side kernel — Travel Nurse vs. Staff Nurse Comp (AL-139).
 *
 * Compute ported VERBATIM from repo/tools/132-travel-nurse-vs-staff-comp/index.html
 * (calculate() L259-309 + exportAP2 preimage L386-405). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '132-travel-nurse-vs-staff-comp';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-139',
  mcp_name:     'compare_travel_nurse_vs_staff_comp',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'travel_nurse_comp_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const staffRate        = parseFloat(g('staffRate')) || 38;
  const staffHours       = parseFloat(g('staffHours')) || 36;
  const staffBenefits    = parseFloat(g('staffBenefits')) || 12000;
  const staffWeeks       = parseFloat(g('staffWeeks')) || 50;
  const taxRate          = parseFloat(g('taxRate')) / 100 || 0.22;
  const travelBase       = parseFloat(g('travelBase')) || 22;
  const housingStipend   = parseFloat(g('housingStipend')) || 1200;
  const mieStipend       = parseFloat(g('mieStipend')) || 350;
  const contractWeeks    = parseFloat(g('contractWeeks')) || 13;
  const contractsPerYear = parseFloat(g('contractsPerYear')) || 3;
  const gapWeeks         = parseFloat(g('gapWeeks')) || 3;
  const travelHours      = parseFloat(g('travelHours')) || 36;
  const travelCost       = parseFloat(g('travelCost')) || 1500;
  const ttpHousingCost   = parseFloat(g('ttpHousingCost')) || 200;

  // STAFF
  const staffGrossAnnual = staffRate * staffHours * staffWeeks;
  const staffNetNoFringe = staffGrossAnnual * (1 - taxRate);

  // TRAVEL
  const weeksWorked = contractWeeks * contractsPerYear;
  const totalAnnualGapWeeks = gapWeeks * contractsPerYear;
  const travelTaxableAnnual = travelBase * travelHours * weeksWorked;
  const housingAnnual = housingStipend * weeksWorked; // tax-free
  const mieAnnual = mieStipend * weeksWorked; // tax-free
  const travelTaxableNet = travelTaxableAnnual * (1 - taxRate);
  const travelTravelCostAnnual = travelCost * contractsPerYear;
  const ttpHousingCostAnnual = ttpHousingCost * weeksWorked;
  const travelNetAnnual = travelTaxableNet + housingAnnual + mieAnnual - travelTravelCostAnnual - ttpHousingCostAnnual;

  const stipendTaxSavings = (housingAnnual + mieAnnual) * taxRate;
  const gapCost = staffRate * travelHours * totalAnnualGapWeeks;

  const totalHoursWorked = travelHours * weeksWorked;
  const effectiveHourly = totalHoursWorked > 0 ? travelNetAnnual / totalHoursWorked : 0;

  const delta = travelNetAnnual - staffNetNoFringe;

  const _cgDomain = {
    inputs: {
      staffRate: staffRate, staffHours: staffHours, staffBenefits: staffBenefits,
      travelBase: travelBase, housingStipend: housingStipend, mieStipend: mieStipend,
      contractsPerYear: contractsPerYear, contractWeeks: contractWeeks, gapWeeks: gapWeeks,
    },
    outputs: {
      staffNetAnnual: Math.round(staffNetNoFringe), travelNetAnnual: Math.round(travelNetAnnual),
      annualDelta: Math.round(delta), stipendTaxSavings: Math.round(stipendTaxSavings),
      effectiveHourlyRate: Math.round(effectiveHourly * 100) / 100,
    },
    downstream_handoff_candidates: ['AL-140', 'AL-28'],
    metadata: { data_vintage: 'IRS Rev. Rul. 59-58; IRC §162(a)(2); GSA M&IE rates 2025', tool_name: 'Travel Nurse vs. Staff Nurse Comp' },
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
      apex_meta: { ap2_mandate_type: 'travel_nurse_comp_record', al_id: 'AL-139', tool_name: 'Travel Nurse vs. Staff Nurse Comp', downstream_handoff_candidates: ['AL-140', 'AL-28'] },
    },
  };
}
