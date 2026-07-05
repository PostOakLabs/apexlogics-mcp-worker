/**
 * 126-skillbridge-credential-transfer-roi.kernel.mjs
 * OpenChainGraph server-side kernel — SkillBridge & Credential Transfer ROI (AL-133).
 *
 * Compute ported VERBATIM from repo/tools/126-skillbridge-credential-transfer-roi/index.html
 * (getCredentials() L310-323, calculate() L327-371 + exportAP2 preimage L432-464).
 * _cgDomain-family preimage. Reproduces the browser §6 execution_hash byte-for-byte;
 * kernel-parity.mjs proves it.
 *
 * NOTE: calculate()'s year-by-year rows[] (L351-361) drive on-page table only —
 * not part of exportAP2's inputs/outputs — omitted from the kernel preimage
 * accordingly (totalPremium/netROI still computed here from the same loop).
 *
 * Browser reads credential rows from the DOM (.cred-block groups: cred-cost-N,
 * cred-months-N, cred-lift-N, cred-ace-N). Kernel input contract flattens this into
 * a `creds` array of { cost, months, annualLift } (name/aceHours are display-only —
 * not used by calculate()'s totals, so they don't affect the hash).
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '126-skillbridge-credential-transfer-roi';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-133',
  mcp_name:     'assess_skillbridge_credential_roi',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'skillbridge_credential_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const civSalary   = num(g('civSalary')) || 75000;
  const salaryGrowth = (num(g('salaryGrowth')) / 100) || 0.035;
  const taxRate     = (num(g('taxRate')) / 100) || 0.22;
  const projYears   = num(g('projYears')) || 5;
  const sbMonths    = num(g('sbMonths')) || 0;
  const sbOffer     = num(g('sbOffer')) || 78000;
  const sbConvPct   = (num(g('sbConvPct')) / 100) || 0.75;
  const credsIn     = Array.isArray(g('creds')) ? g('creds') : [];
  const creds       = credsIn.map((c) => ({
    cost: num(c && c.cost),
    months: num(c && c.months),
    annualLift: num(c && c.annualLift),
  }));

  const totalCredCost = creds.reduce((s, c) => s + c.cost, 0);
  const totalCredLift = creds.reduce((s, c) => s + c.annualLift, 0);

  const sbEV = sbConvPct * sbOffer + (1 - sbConvPct) * civSalary;
  const sbAnnualLift = Math.max(0, sbEV - civSalary);
  const sbValue5yr = sbAnnualLift * 5 * (1 - taxRate);

  const totalAnnualLift = totalCredLift + sbAnnualLift;
  const breakEvenMonths = totalCredCost > 0 ? totalCredCost / ((totalAnnualLift / 12) * (1 - taxRate)) : 0;

  let cumPremium = 0;
  let salWith = civSalary + totalAnnualLift;
  let salWithout = civSalary;
  for (let y = 1; y <= projYears; y++) {
    const premium = (salWith - salWithout) * (1 - taxRate);
    cumPremium += premium;
    salWith *= (1 + salaryGrowth);
    salWithout *= (1 + salaryGrowth);
  }
  const totalPremium = cumPremium;
  const netROI = totalPremium - totalCredCost;

  const _cgDomain = {
    inputs: {
      civSalary: civSalary, sbMonths: sbMonths, sbConvPct: sbConvPct * 100,
      credentialCount: creds.length, totalCredCost: totalCredCost, projYears: projYears,
    },
    outputs: {
      totalSalaryPremium: Math.round(totalPremium), skillBridgeEV5yr: Math.round(sbValue5yr),
      breakEvenMonths: Math.ceil(breakEvenMonths), netROI: Math.round(netROI),
    },
    downstream_handoff_candidates: ['AL-134', 'AL-132'],
    metadata: { data_vintage: 'DoDI 1322.29 (SkillBridge); zero embedded salary tables', tool_name: 'SkillBridge & Credential Transfer ROI' },
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
      apex_meta: { ap2_mandate_type: 'skillbridge_credential_record', al_id: 'AL-133', tool_name: 'SkillBridge & Credential Transfer ROI', downstream_handoff_candidates: ['AL-134', 'AL-132'] },
    },
  };
}
