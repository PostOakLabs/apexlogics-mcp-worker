/**
 * 134-cobra-vs-aca-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — COBRA vs. ACA Marketplace Optimizer (AL-141).
 *
 * Compute ported VERBATIM from repo/tools/134-cobra-vs-aca-optimizer/index.html
 * (getFPL/applicablePct/getPTCContributionPct/getEnhancedContributionPct, calculate() L324-375 + exportAP2 preimage
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

// Premium tax credits for 2026 coverage use the 2025 HHS poverty guidelines
// (the guidelines in effect at the start of open enrollment). Source: 2026 Form 8962 instructions.
const FPL_FOR_2026_COVERAGE = {
  lower48: { base: 15650, perPerson: 5500 },
  ak:      { base: 19550, perPerson: 6880 },
  hi:      { base: 17990, perPerson: 6330 },
};

// 2026 applicable percentage table, Rev. Proc. 2025-25 sec. 3.01 (current law: the enhanced
// ARPA/IRA credits expired 12/31/2025). [from, to, initial, final] as a share of FPL; the
// percentage rises linearly within each band and is rounded to 0.01%. Above 400% FPL: no credit.
const PTC_BANDS_2026 = [
  [1.00, 1.33, 0.0210, 0.0210],
  [1.33, 1.50, 0.0314, 0.0419],
  [1.50, 2.00, 0.0419, 0.0660],
  [2.00, 2.50, 0.0660, 0.0844],
  [2.50, 3.00, 0.0844, 0.0996],
  [3.00, 4.00, 0.0996, 0.0996],
];

// Enhanced ARPA/IRA schedule (2021-2025), shown only as an "if the enhanced subsidies are
// extended" comparison. No 400% cliff: 8.5% applies above 400% FPL.
const PTC_BANDS_ENHANCED = [
  [1.00, 1.50, 0.000, 0.000],
  [1.50, 2.00, 0.000, 0.020],
  [2.00, 2.50, 0.020, 0.040],
  [2.50, 3.00, 0.040, 0.060],
  [3.00, 4.00, 0.060, 0.085],
];

function getFPL(householdSize, state) {
  const tbl = FPL_FOR_2026_COVERAGE[state];
  return tbl.base + (householdSize - 1) * tbl.perPerson;
}

// Applicable percentage for a household income ratio (AGI / FPL), or null when no credit.
function applicablePct(fplPct, bands, cliff) {
  if (!(fplPct >= 1.0)) return null; // below 100% FPL: Medicaid territory, not PTC
  const last = bands[bands.length - 1];
  if (fplPct > last[1]) return cliff ? null : last[3];
  for (const b of bands) {
    if (fplPct < b[1] || b === last) {
      const pct = b[2] + (b[3] - b[2]) * (fplPct - b[0]) / (b[1] - b[0]);
      return Math.round(pct * 10000) / 10000;
    }
  }
  return null;
}

function getPTCContributionPct(fplPct) {
  return applicablePct(fplPct, PTC_BANDS_2026, true); // 2026 law, 400% cliff
}

function getEnhancedContributionPct(fplPct) {
  return applicablePct(fplPct, PTC_BANDS_ENHANCED, false); // if extended, no cliff
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

  // Comparison: if the enhanced ARPA/IRA subsidies are extended (not current law).
  const enhContribPct = getEnhancedContributionPct(fplPct);
  let enhPtcAnnual = 0;
  let enhNetMonthly = benchmarkMo;
  if (enhContribPct !== null) {
    enhPtcAnnual  = Math.max(0, benchmarkMo * 12 - enhContribPct * agi);
    enhNetMonthly = Math.max(0, benchmarkMo - enhPtcAnnual / 12);
  }
  const enhTotal   = enhNetMonthly * coverageMonths;
  const enhSavings = cobraTotal - enhTotal;

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
      contributionPct: contribPct,
      ifEnhancedExtended: {
        contributionPct: enhContribPct,
        marketplaceNetMonthly: Math.round(enhNetMonthly),
        ptcAnnual: Math.round(enhPtcAnnual),
        recommendedPath: enhNetMonthly < cobraMonthly ? 'marketplace' : 'cobra',
        totalSavings: Math.round(Math.abs(enhSavings)),
      },
    },
    downstream_handoff_candidates: ['AL-142', 'AL-23'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2025 HHS FPL (2026 coverage) · Rev. Proc. 2025-25 · ARPA/IRA if extended' },
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
