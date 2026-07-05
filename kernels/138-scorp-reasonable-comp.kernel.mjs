/**
 * 138-scorp-reasonable-comp.kernel.mjs
 * OpenChainGraph server-side kernel — S-Corp Reasonable Compensation (AL-145).
 *
 * Compute ported VERBATIM from repo/tools/138-scorp-reasonable-comp/index.html
 * (calcFICA/calcSolePropFICA L280-297, calculate() L301-351 + exportAP2 preimage
 * L427-468). _cgDomain-family preimage. Reproduces the browser §6 execution_hash
 * byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '138-scorp-reasonable-comp';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-145',
  mcp_name:     'optimize_scorp_reasonable_comp',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'reasonable_comp_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

// 2026 FICA constants (verbatim from tool)
const SS_WAGE_BASE  = 184500;
const SS_RATE       = 0.062;
const MED_RATE      = 0.0145;
const ADD_MED_RATE  = 0.009;
const ADD_MED_THRESHOLD = { single: 200000, mfj: 250000 };

function calcFICA(salary, filingStatus) {
  const ssBase   = Math.min(salary, SS_WAGE_BASE);
  const ssTotal  = ssBase * SS_RATE * 2;
  const medTotal = salary * MED_RATE * 2;
  const thresh   = ADD_MED_THRESHOLD[filingStatus];
  const addMed   = salary > thresh ? (salary - thresh) * ADD_MED_RATE : 0;
  return { ssTotal, medTotal, addMed, total: ssTotal + medTotal + addMed };
}

function calcSolePropFICA(income, filingStatus) {
  const seNet    = income * 0.9235;
  const ssBase   = Math.min(seNet, SS_WAGE_BASE);
  const seTax    = ssBase * 0.153 + Math.max(0, seNet - ssBase) * 0.029;
  const thresh   = ADD_MED_THRESHOLD[filingStatus];
  const addMed   = seNet > thresh ? (seNet - thresh) * ADD_MED_RATE : 0;
  return seTax + addMed;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const netIncome       = num(g('netIncome'));
  const proposedSalary  = num(g('proposedSalary'));
  const filingStatus    = g('filingStatus');
  const customBenchmark = num(g('customBenchmark'));

  const distribution = Math.max(0, netIncome - proposedSalary);

  const ficaProposed = calcFICA(proposedSalary, filingStatus);
  const ficaSoleProp = calcSolePropFICA(netIncome, filingStatus);
  const ficaSaved = Math.max(0, ficaSoleProp - ficaProposed.total);

  const ratio = customBenchmark > 0 ? proposedSalary / customBenchmark : 1;
  let riskScore;
  let riskLevel;
  if (ratio >= 0.9) { riskScore = 15; riskLevel = 'low'; }
  else if (ratio >= 0.7) { riskScore = 45; riskLevel = 'medium'; }
  else if (ratio >= 0.5) { riskScore = 70; riskLevel = 'high'; }
  else { riskScore = 90; riskLevel = 'high'; }
  if (netIncome > 50000 && proposedSalary < 35000) { riskScore = Math.max(riskScore, 80); riskLevel = 'high'; }
  if (netIncome > 100000 && proposedSalary < 50000) { riskScore = Math.max(riskScore, 65); riskLevel = riskScore >= 65 ? 'high' : 'medium'; }

  const _cgDomain = {
    inputs: {
      netIncome: netIncome,
      proposedSalary: proposedSalary,
      filingStatus: filingStatus,
      benchmarkSalary: customBenchmark,
    },
    outputs: {
      distribution: distribution,
      ficaTotal: Math.round(ficaProposed.total),
      ficaSaved: Math.round(ficaSaved),
      benchmarkRatio: +ratio.toFixed(3),
      auditRiskLevel: riskLevel,
      riskScore: riskScore,
    },
    downstream_handoff_candidates: ['AL-144', 'AL-118'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026: SS wage base $184,500; IRC §3121; Watson v. US (2012)' },
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
      apex_meta: { ap2_mandate_type: 'reasonable_comp_record', al_id: 'AL-145', tool_name: 'S-Corp Reasonable Compensation', downstream_handoff_candidates: ['AL-144', 'AL-118'] },
    },
  };
}
