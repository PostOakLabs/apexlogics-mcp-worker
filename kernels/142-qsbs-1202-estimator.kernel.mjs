/**
 * 142-qsbs-1202-estimator.kernel.mjs
 * OpenChainGraph server-side kernel — QSBS §1202 Exclusion Estimator (AL-149).
 *
 * Compute ported VERBATIM from repo/tools/142-qsbs-1202-estimator/index.html
 * (TIERS/obbbaTier L300-318 + calculate() L322-377 + exportAP2 preimage L538-585).
 * _cgDomain-family preimage (blocklist-filtered payload -> {inputs, outputs,
 * downstream_handoff_candidates, metadata}). Reproduces the browser §6 execution_hash
 * byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '142-qsbs-1202-estimator';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-149',
  mcp_name:     'estimate_qsbs_1202',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'qsbs_exclusion_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
const bool = (v) => v === true || v === 'true';

const QSBS_CAP       = 10_000_000;
const QSBS_CAP_OBBBA = 15_000_000;
const GROSS_ASSETS_LIMIT       = 50;
const GROSS_ASSETS_LIMIT_OBBBA = 75;

const TIERS = [
  { id: 'pre2010',  label: 'Before Aug 11, 2010',       pct: 0.50, amtPref: true  },
  { id: '2010',     label: 'Aug 11 – Sep 27, 2010',      pct: 0.75, amtPref: true  },
  { id: '2010b',    label: 'Sep 28 – Dec 31, 2010',      pct: 1.00, amtPref: false },
  { id: '2011plus', label: 'Jan 1, 2011 – Jul 4, 2025',  pct: 1.00, amtPref: false },
];

function obbbaTier(holdYears) {
  if (holdYears >= 5) return { id: 'obbba', label: 'OBBBA · held ≥5 yrs', pct: 1.00, amtPref: false };
  if (holdYears >= 4) return { id: 'obbba', label: 'OBBBA · held ≥4 yrs', pct: 0.75, amtPref: false };
  if (holdYears >= 3) return { id: 'obbba', label: 'OBBBA · held ≥3 yrs', pct: 0.50, amtPref: false };
  return { id: 'obbba', label: 'OBBBA · held <3 yrs', pct: 0, amtPref: false };
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const acquireDate     = g('acquireDate');
  const grossAssets     = num(g('grossAssets'));
  const holdYears       = num(g('holdYears'));
  const costBasis       = num(g('costBasis'));
  const saleProceeds    = num(g('saleProceeds'));
  const ltcgRate        = num(g('ltcgRate'));
  const stateRate       = num(g('stateRate')) / 100;

  const isCCorp         = bool(g('isCCorp'));
  const isOriginalIssue = bool(g('isOriginalIssue'));
  const isActiveBiz     = bool(g('isActiveBusiness'));
  const cashOrService   = bool(g('cashOrService'));
  const notPublic       = bool(g('notPublic'));
  const noRepurchase    = bool(g('noRepurchase'));

  const gain = Math.max(0, saleProceeds - costBasis);
  const isObbba = acquireDate === 'obbba';
  const tier = isObbba ? obbbaTier(holdYears) : TIERS.find((t) => t.id === acquireDate);
  const exclusionPct = tier.pct;
  const holdOk = isObbba ? holdYears >= 3 : holdYears > 5;
  const assetLimit = isObbba ? GROSS_ASSETS_LIMIT_OBBBA : GROSS_ASSETS_LIMIT;
  const assetOk = grossAssets <= assetLimit;
  const coreCrit = isCCorp && isOriginalIssue && isActiveBiz && cashOrService && notPublic && noRepurchase;

  const eligible = coreCrit && holdOk && assetOk && exclusionPct > 0;

  const capBase = isObbba ? QSBS_CAP_OBBBA : QSBS_CAP;
  const tenXBasis = 10 * costBasis;
  const cap = Math.max(capBase, tenXBasis);
  const excludableGain = Math.min(gain, cap);
  const excludedGain = eligible ? excludableGain * exclusionPct : 0;
  const taxableGain  = eligible ? gain - excludedGain : gain;

  const federalTaxWithout = gain * ltcgRate;
  const federalTaxWith    = taxableGain * ltcgRate;
  const federalSaving     = eligible ? federalTaxWithout - federalTaxWith : 0;

  const _cgDomain = {
    inputs: {
      acquisitionPeriod: acquireDate,
      grossAssetsAtIssuanceMillion: grossAssets,
      holdYears: holdYears,
      costBasis: costBasis,
      saleProceeds: saleProceeds,
      ltcgRate: ltcgRate,
      stateRate: stateRate,
      eligibilityFlags: {
        isCCorp: isCCorp, isOriginalIssue: isOriginalIssue,
        isActiveBusiness: isActiveBiz, cashOrService: cashOrService,
        notPublic: notPublic, noRepurchase: noRepurchase,
      },
    },
    outputs: {
      eligible: eligible,
      exclusionTier: (exclusionPct * 100).toFixed(0) + '%',
      totalGain: Math.round(gain),
      excludedGain: Math.round(excludedGain),
      taxableGain: Math.round(taxableGain),
      federalTaxWithout: Math.round(federalTaxWithout),
      federalTaxWith: Math.round(federalTaxWith),
      federalSaving: Math.round(federalSaving),
      capApplied: Math.round(cap),
      amtPreferenceItem: tier.amtPref,
    },
    downstream_handoff_candidates: ['AL-116'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'IRC §1202; OBBBA 2025 / P.L. 119-21 ($15M cap, 3/4/5-yr tiers, $75M gross-assets for stock acquired after Jul 4, 2025)' },
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
      apex_meta: { ap2_mandate_type: 'qsbs_exclusion_record', al_id: 'AL-149', tool_name: 'QSBS §1202 Exclusion Estimator', downstream_handoff_candidates: ['AL-116'] },
    },
  };
}
