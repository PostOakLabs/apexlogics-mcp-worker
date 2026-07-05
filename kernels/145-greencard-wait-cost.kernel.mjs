/**
 * 145-greencard-wait-cost.kernel.mjs
 * OpenChainGraph server-side kernel — Green-Card Priority-Date Wait-Cost Estimator (AL-152).
 *
 * Compute ported VERBATIM from repo/tools/145-greencard-wait-cost/index.html
 * (calculate() L304-388 + exportAP2 preimage L465-493). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.max/min/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 * NOTE: annualRaisePct is emitted as a STRING via (x*100).toFixed(1), matching the
 * browser's payload.inputs.annualRaisePct — replicated verbatim (no Number() coercion).
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '145-greencard-wait-cost';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-152',
  mcp_name:     'estimate_greencard_wait_cost',
  mandate_type: 'org.apexlogics/immigration_assessment',
  ap2_mandate_type: 'greencard_wait_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

// toFixed(1) replicate without locale/Intl dependency (native Number.prototype.toFixed
// is guest-legal — it is not Intl/Date/locale-sensitive).
const toFixed1 = (n) => n.toFixed(1);

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const category          = g('category');
  const chargeability     = g('chargeability');
  const waitYears         = num(g('estimatedWaitYears'));
  const i140Approved      = g('i140Approved');
  const i485Filed         = g('i485Filed');
  const h1bYearsRemaining = num(g('h1bYearsRemaining'));
  const currentSalary     = num(g('currentSalary'));
  const opportunitySalary = num(g('opportunitySalary'));
  const annualRaise       = num(g('annualRaise')) / 100;
  const opportunityGrowth = num(g('opportunityGrowthPct')) / 100;
  const mobilityPerYear   = num(g('mobilityRestriction'));
  const h1bExtCost        = num(g('h1bExtensionCost'));
  const h1bExtFreq        = num(g('h1bExtensionFreqYears'));
  const otherAnnualCost   = num(g('otherAnnualImmigCost'));

  // ── Year-by-year computation ──
  const YEARS = Math.min(waitYears, 30);
  let cumulativeCost = 0;
  const yearData = [];

  let currentSal = currentSalary;
  let outsideSal = opportunitySalary;

  for (let y = 1; y <= YEARS; y++) {
    const salaryGap = Math.max(0, outsideSal - currentSal);
    const h1bExtThisYear = (y % h1bExtFreq === 0) && (i140Approved === 'approved' || h1bYearsRemaining >= y) ? h1bExtCost : 0;
    const immigCostYr = otherAnnualCost + h1bExtThisYear;
    const mobilityCostYr = mobilityPerYear;
    const yearTotal = salaryGap + immigCostYr + mobilityCostYr;
    cumulativeCost += yearTotal;

    yearData.push({
      year: y,
      salaryGap: Math.round(salaryGap),
      immigCost: Math.round(immigCostYr),
      mobilityYr: Math.round(mobilityCostYr),
      yearTotal: Math.round(yearTotal),
      cumulative: Math.round(cumulativeCost),
    });

    currentSal *= (1 + annualRaise);
    outsideSal *= (1 + opportunityGrowth);
  }

  // Totals
  const totalOpportunityCost = yearData.reduce((s, y) => s + y.salaryGap, 0);
  const totalMobility        = yearData.reduce((s, y) => s + y.mobilityYr, 0);
  const totalImmigCost       = yearData.reduce((s, y) => s + y.immigCost, 0);
  const annualCostYr1        = yearData.length ? yearData[0].yearTotal : 0;

  const _cgDomain = {
    inputs: {
      category: category, chargeability: chargeability,
      estimatedWaitYears: waitYears, i140Approved: i140Approved,
      i485Filed: i485Filed, currentSalary: currentSalary,
      opportunitySalary: opportunitySalary,
      annualRaisePct: toFixed1(annualRaise * 100),
      mobilityRestrictionPerYear: mobilityPerYear,
      h1bExtensionCost: h1bExtCost, h1bExtensionFreqYears: h1bExtFreq,
      otherAnnualImmigCost: otherAnnualCost,
    },
    outputs: {
      totalWaitCost: Math.round(cumulativeCost),
      opportunityCost: Math.round(totalOpportunityCost),
      mobilityCost: Math.round(totalMobility),
      immigrationFilingCost: Math.round(totalImmigCost),
      annualCostYear1: Math.round(annualCostYr1),
      yearsModeled: YEARS,
    },
    downstream_handoff_candidates: ['AL-120'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'INA §203(b) EB rules; USCIS Visa Bulletin (wait estimates user-entered); not legal advice' },
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
      apex_meta: { ap2_mandate_type: 'greencard_wait_record', al_id: 'AL-152', tool_name: 'Green-Card Priority-Date Wait-Cost Estimator', downstream_handoff_candidates: ['AL-120'] },
    },
  };
}
