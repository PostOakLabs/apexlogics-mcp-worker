/**
 * 139-home-office-augusta.kernel.mjs
 * OpenChainGraph server-side kernel — Home Office & Augusta Rule (AL-146).
 *
 * Compute ported VERBATIM from repo/tools/139-home-office-augusta/index.html
 * (calculate() L282-330 + exportAP2 preimage L434-482). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '139-home-office-augusta';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-146',
  mcp_name:     'optimize_home_office_augusta',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'home_office_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

const SIMPLIFIED_RATE = 5;
const SIMPLIFIED_MAX_SQFT = 300;

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const officeSqFt    = num(g('officeSqFt')) || 0;
  const homeSqFt      = num(g('homeSqFt')) || 1;
  const buPctOverride = g('businessUsePct');
  const buPct         = buPctOverride ? (num(buPctOverride) / 100) : (officeSqFt / homeSqFt);
  const annualRent     = num(g('annualRent')) || 0;
  const utilities      = num(g('utilities')) || 0;
  const otherHomeExp   = num(g('otherHomeExp')) || 0;
  const grossIncome    = num(g('grossIncome')) || 0;
  const entityTypeHO   = g('entityTypeHO');

  const totalHomeExp  = annualRent + utilities + otherHomeExp;
  const regularDeduction = Math.min(totalHomeExp * buPct, grossIncome);
  const simplifiedDeduction = Math.min(officeSqFt, SIMPLIFIED_MAX_SQFT) * SIMPLIFIED_RATE;
  const bestHO = Math.max(regularDeduction, simplifiedDeduction);
  const bestHOMethod = regularDeduction >= simplifiedDeduction ? 'Regular' : 'Simplified';

  const rentalDays    = num(g('rentalDays')) || 0;
  const dailyRate     = num(g('dailyRentalRate')) || 0;
  const corpTaxRate   = num(g('corpTaxRate')) / 100 || 0.37;
  const ownerMargRate = num(g('ownerMarginalRate')) / 100 || 0.32;
  const entityTypeAug = g('entityTypeAug');

  const totalRental     = rentalDays * dailyRate;
  const qualifies       = rentalDays <= 14;
  const augTaxFreeIncome = qualifies ? totalRental : 0;
  const augCorpDeduction = entityTypeAug === 'scorp' && qualifies ? totalRental : 0;
  const augTaxBenefit   = entityTypeAug === 'scorp' && qualifies
    ? totalRental * corpTaxRate
    : 0;

  const hoBenefit = bestHO * ownerMargRate;
  const totalTaxBenefit = hoBenefit + augTaxBenefit;

  const _cgDomain = {
    inputs: {
      officeSqFt: officeSqFt,
      homeSqFt: homeSqFt,
      businessUsePct: +buPct.toFixed(4),
      totalHomeExpenses: totalHomeExp,
      grossBusinessIncome: grossIncome,
      entityType: entityTypeHO,
      augustaRentalDays: rentalDays,
      augustaDailyRate: dailyRate,
      augustaEntityType: entityTypeAug,
    },
    outputs: {
      homeOfficeDeduction: Math.round(bestHO),
      homeOfficeBestMethod: bestHOMethod,
      regularMethodDeduction: Math.round(regularDeduction),
      simplifiedMethodDeduction: Math.round(simplifiedDeduction),
      augustaTaxFreeIncome: Math.round(augTaxFreeIncome),
      augustaCorpDeduction: Math.round(augCorpDeduction),
      augustaQualifies: qualifies,
      combinedEstTaxBenefit: Math.round(totalTaxBenefit),
    },
    downstream_handoff_candidates: ['AL-145', 'AL-144'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'IRC §280A; Rev. Proc. 2013-13 ($5/sq ft simplified); IRS Pub. 587 (2026)' },
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
      apex_meta: { ap2_mandate_type: 'home_office_record', al_id: 'AL-146', tool_name: 'Home Office & Augusta Rule', downstream_handoff_candidates: ['AL-145', 'AL-144'] },
    },
  };
}
