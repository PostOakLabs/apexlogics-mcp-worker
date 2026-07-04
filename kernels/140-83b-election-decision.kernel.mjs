/**
 * 140-83b-election-decision.kernel.mjs
 * OpenChainGraph server-side kernel — 83(b) Election Decision (AL-147).
 *
 * Compute ported VERBATIM from repo/tools/140-83b-election-decision/index.html
 * (calculate() L305-385 + exportAP2 preimage L480-505). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.max/round only; no pow/exp/log,
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 * Note: forfeitureProb enters the preimage as the FRACTION (value/100); taxBracket and
 * ltcgRate are entered as decimal rates (used directly).
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '140-83b-election-decision';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-147',
  mcp_name:     'decide_83b_election',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'eighty_three_b_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const shares       = num(g('shares'));
  const strikePrice  = num(g('strikePrice'));
  const fmvAtGrant   = num(g('fmvAtGrant'));
  const vestingYears = num(g('vestingYears'));
  const grantType    = g('grantType');
  const fmvBase      = num(g('fmvBase'));
  const forfeitProb  = num(g('forfeitureProb')) / 100;
  const taxBracket   = num(g('taxBracket'));
  const ltcgRate     = num(g('ltcgRate'));

  const spreadAtGrant = Math.max(0, fmvAtGrant - strikePrice);   // per-share
  const taxAtElection = spreadAtGrant * shares * taxBracket;

  const taxAtVestScenario = (fmvVest) => Math.max(0, fmvVest - strikePrice) * shares * taxBracket;
  const taxWithout83b = (fmvVest, fmvExit) => {
    const ordinaryIncome = Math.max(0, fmvVest - strikePrice) * shares;
    const ltcgGain = Math.max(0, fmvExit - fmvVest) * shares;
    return ordinaryIncome * taxBracket + ltcgGain * ltcgRate;
  };
  const taxWith83b = (fmvExit) => {
    const electionTax = spreadAtGrant * shares * taxBracket;
    const ltcgGain = Math.max(0, fmvExit - fmvAtGrant) * shares;
    return electionTax + ltcgGain * ltcgRate;
  };

  // Only the base scenario (index 1) feeds the preimage outputs.
  const baseSavings = taxWithout83b(fmvBase, fmvBase) - taxWith83b(fmvBase);
  const evSavings = baseSavings * (1 - forfeitProb);
  const forfeitureDownside = taxAtElection;
  const expectedTaxAtVest = taxAtVestScenario(fmvBase) * (1 - forfeitProb);
  const shouldFile = evSavings > forfeitureDownside * forfeitProb;

  const _cgDomain = {
    inputs: {
      shares: shares, strikePrice: strikePrice, fmvAtGrant: fmvAtGrant,
      vestingYears: vestingYears, grantType: grantType, forfeitureProb: forfeitProb,
      ordinaryTaxRate: taxBracket, ltcgRate: ltcgRate,
    },
    outputs: {
      spreadAtGrant:        +((spreadAtGrant * shares).toFixed(0)),
      taxAtElection:        Math.round(taxAtElection),
      expectedTaxAtVest:    Math.round(expectedTaxAtVest),
      evSavingsFromFiling:  Math.round(Math.max(0, evSavings)),
      forfeitureDownside:   Math.round(taxAtElection),
      verdict:              taxAtElection === 0 ? 'file_free' : shouldFile ? 'file' : 'evaluate_carefully',
      zeroSpreadAtGrant:    spreadAtGrant === 0,
    },
    downstream_handoff_candidates: ['AL-116', 'AL-148', 'AL-149'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'IRC §83(b) statutory; tax buckets 2026 est.' },
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
      apex_meta: { ap2_mandate_type: 'eighty_three_b_record', al_id: 'AL-147', tool_name: '83(b) Election Decision', downstream_handoff_candidates: ['AL-116', 'AL-148', 'AL-149'] },
    },
  };
}
