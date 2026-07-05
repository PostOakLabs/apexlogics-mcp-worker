/**
 * 134-cobra-vs-aca-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — COBRA vs. ACA Marketplace Optimizer (AL-141).
 *
 * Compute ported VERBATIM from repo/tools/134-cobra-vs-aca-optimizer/index.html
 * (getFPL/getPTCContributionPct L305-317, calculate() L324-375 + exportAP2 preimage
 * L510-552). _cgDomain-family preimage. Reproduces the browser §6 execution_hash
 * byte-for-byte; kernel-parity.mjs proves it.
 *
 * NOTE: calculate()'s break-even AGI search loop (L358-366) is NOT part of the
 * exported _cgDomain (breakEvenAGI isn't in inputs/outputs) — omitted from the
 * kernel preimage accordingly (still computed in the browser for on-page display only).
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '134-cobra-vs-aca-optimizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-141',
  mcp_name:     'optimize_cobra_vs_aca',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'coverage_transition_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

// HHS 2026 Federal Poverty Guidelines (effective January 13, 2026)
const FPL_2026 = {
  lower48: { base: 15960, perPerson: 5620 },
  ak:      { base: 19950, perPerson: 7020 },
  hi:      { base: 18360, perPerson: 6470 },
};

// ACA §36B Baseline PTC contribution percentage table (2026)
const PTC_TABLE = [
  { maxPct: 1.33, contrib: 0.00 },
  { maxPct: 1.50, contrib: 0.020 },
  { maxPct: 2.00, contrib: 0.040 },
  { maxPct: 2.50, contrib: 0.060 },
  { maxPct: 3.00, contrib: 0.085 },
  { maxPct: 4.00, contrib: 0.085 },
];

function getFPL(householdSize, state) {
  const tbl = FPL_2026[state];
  return tbl.base + (householdSize - 1) * tbl.perPerson;
}

function getPTCContributionPct(fplPct) {
  if (fplPct > 4.0) return null;
  if (fplPct < 1.0) return null;
  for (const band of PTC_TABLE) {
    if (fplPct <= band.maxPct) return band.contrib;
  }
  return PTC_TABLE[PTC_TABLE.length - 1].contrib;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const cobraMonthly   = num(g('cobraMonthly'));
  const benchmarkMo    = num(g('benchmarkMonthly'));
  const coverageMonths = num(g('coverageMonths'));
  const agi            = num(g('estimatedAGI'));
  const householdSize  = num(g('householdSize'));
  const state          = g('state');

  const fpl          = getFPL(householdSize, state);
  const fplPct       = agi / fpl;
  const contribPct   = getPTCContributionPct(fplPct);

  let ptcAnnual = 0;
  let mktNetMonthly = benchmarkMo;

  if (contribPct !== null && fplPct >= 1.0) {
    const maxAnnualContrib = contribPct * agi;
    const benchmarkAnnual  = benchmarkMo * 12;
    ptcAnnual = Math.max(0, benchmarkAnnual - maxAnnualContrib);
    mktNetMonthly = Math.max(0, benchmarkMo - ptcAnnual / 12);
  }

  const cobraTotal = cobraMonthly * coverageMonths;
  const mktTotal   = mktNetMonthly * coverageMonths;
  const savings    = cobraTotal - mktTotal;

  const _cgDomain = {
    inputs: {
      cobraMonthly: cobraMonthly,
      benchmarkMonthly: benchmarkMo,
      coverageMonths: coverageMonths,
      estimatedAGI: agi,
      householdSize: householdSize,
      state: state,
    },
    outputs: {
      cobraMonthly: cobraMonthly,
      marketplaceNetMonthly: Math.round(mktNetMonthly),
      ptcAnnual: Math.round(ptcAnnual),
      fplPct: +fplPct.toFixed(3),
      subsidyCliffAGI: Math.round(4.0 * fpl),
      aboveCliff: fplPct > 4.0,
      recommendedPath: mktNetMonthly < cobraMonthly ? 'marketplace' : 'cobra',
      totalSavings: Math.round(Math.abs(savings)),
    },
    downstream_handoff_candidates: ['AL-142', 'AL-23'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'HHS 2026 FPL' },
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
      apex_meta: { ap2_mandate_type: 'coverage_transition_record', al_id: 'AL-141', tool_name: 'COBRA vs. ACA Marketplace Optimizer', downstream_handoff_candidates: ['AL-142', 'AL-23'] },
    },
  };
}
