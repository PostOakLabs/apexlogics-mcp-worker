/**
 * 125-gi-bill-benefit-maximizer.kernel.mjs
 * OpenChainGraph server-side kernel — GI Bill Benefit Maximizer (AL-132).
 *
 * Compute ported VERBATIM from repo/tools/125-gi-bill-benefit-maximizer/index.html
 * (calculate() L293-363 + buildAP2()/exportAP2() preimage L425-462). _cgDomain-family
 * preimage. Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs
 * proves it.
 *
 * NOTE: calculate()'s year-by-year rows/salaryRows (L309-354) drive on-page tables only —
 * neither array appears in buildAP2()'s inputs/outputs — omitted from the kernel preimage
 * accordingly (still computed here only insofar as needed to reach totalBenefit/netBenefit).
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '125-gi-bill-benefit-maximizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-132',
  mcp_name:     'maximize_gi_bill_benefit',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'gi_bill_benefit_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

const GIBILL_CH33_PUBLIC_CAP  = 27120;
const GIBILL_CH33_PRIVATE_CAP = 29920.95;
const GIBILL_BOOKS_MONTHLY    = 41.67;
const MGIB_CH30_MONTHLY       = 2518;

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const chapter        = g('giBillChapter');
  const eligPct        = num(g('eligibilityPct')) || 1.0;
  const schoolType     = g('schoolType');
  const annualTuition  = num(g('annualTuition')) || 12000;
  const bahRate        = num(g('bahRate')) || 2200;
  const yellowRibbon   = num(g('yellowRibbon')) || 0;
  const programYears   = num(g('programYears')) || 4;
  const partTimeIncome = num(g('partTimeIncome')) || 800;
  const altIncome      = num(g('altIncome')) || 3800;
  const postDegSalary  = num(g('postDegSalary')) || 70000;
  const altSalary      = num(g('altSalary')) || 52000;
  const salaryGrowth   = (num(g('salaryGrowth')) / 100) || 0.03;
  const modelYears     = num(g('modelYears')) || 10;
  const taxRate        = (num(g('taxRate')) / 100) || 0.22;

  let totalTuitionCovered = 0, totalBAH = 0, totalBooks = 0, totalOppCost = 0, totalPT = 0;

  for (let y = 1; y <= programYears; y++) {
    let tuitionCovered = 0, bahAnnual = 0, booksAnnual = 0;

    if (chapter === '33') {
      let cap = schoolType === 'public' ? GIBILL_CH33_PUBLIC_CAP :
                schoolType === 'private' ? GIBILL_CH33_PRIVATE_CAP : 5000;
      const yrCap = Math.min(annualTuition, cap + yellowRibbon * 2);
      tuitionCovered = yrCap * eligPct;
      bahAnnual = bahRate * 9 * eligPct;
      booksAnnual = GIBILL_BOOKS_MONTHLY * 9 * eligPct;
    } else {
      tuitionCovered = 0;
      bahAnnual = MGIB_CH30_MONTHLY * 9;
      booksAnnual = 0;
    }

    const partAnnual = partTimeIncome * 12;
    const oppCostAnnual = altIncome * 12 - partAnnual;

    totalTuitionCovered += tuitionCovered;
    totalBAH += bahAnnual;
    totalBooks += booksAnnual;
    totalOppCost += oppCostAnnual;
    totalPT += partAnnual;
  }

  const totalBenefit = totalTuitionCovered + totalBAH + totalBooks + totalPT;
  const netBenefit = totalBenefit - totalOppCost;

  const _cgDomain = {
    inputs: {
      chapter: chapter, eligibilityPct: eligPct * 100, schoolType: schoolType,
      annualTuition: annualTuition, bahRate: bahRate, yellowRibbon: yellowRibbon,
      programYears: programYears, altIncome: altIncome, postDegSalary: postDegSalary,
    },
    outputs: {
      totalBenefit: Math.round(totalBenefit), tuitionCovered: Math.round(totalTuitionCovered),
      bahTotal: Math.round(totalBAH), opportunityCost: Math.round(totalOppCost),
      netGiBillValue: Math.round(netBenefit),
    },
    downstream_handoff_candidates: ['AL-133', 'AL-134'],
    metadata: { data_vintage: 'VA.gov Post-9/11 rate table AY2025-26 (effective Aug 1, 2025); MGIB FY2026', tool_name: 'GI Bill Benefit Maximizer' },
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
      apex_meta: { ap2_mandate_type: 'gi_bill_benefit_record', al_id: 'AL-132', tool_name: 'GI Bill Benefit Maximizer', downstream_handoff_candidates: ['AL-133', 'AL-134'] },
    },
  };
}
