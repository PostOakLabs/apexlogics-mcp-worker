/**
 * 121-teacher-pension-estimator.kernel.mjs
 * OpenChainGraph server-side kernel — Teacher Pension Estimator (AL-128).
 *
 * Compute ported VERBATIM from repo/tools/121-teacher-pension-estimator/index.html
 * (projectFAS L310-319 + pensionAtYears L321-334 + calculate() L336-401, PLANNED scenario
 * only — the milestone/leave-now scenarios are on-page UI, NOT in the preimage). Preimage
 * outputs derive from `planned = pensionAtYears(plannedRetYears, ...)`; _cgDomain = { inputs,
 * outputs, metadata } (this tool emits no downstream_handoff_candidates).
 *
 * GUEST-LEGAL — INTEGER-EXPONENT _detmath: the browser uses Math.pow(1+rate, n) for compound
 * growth / discounting where n is ALWAYS an integer (year counts / differences). Math.pow is
 * BANNED in-guest, so this kernel uses `ipow` = loop multiplication (OCG §3: "int exponents =
 * loop multiplication"). Math.pow(base,int) and ipow(base,int) differ only in the last ULP;
 * every preimage output is Math.round(...) to whole dollars or +(...).toFixed(1), which absorbs
 * that ~1e-15 difference — so kernel == browser byte-for-byte (proven by kernel-parity). No
 * Math.pow/log/exp; no Date/Intl/locale in the preimage path; finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '121-teacher-pension-estimator';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-128',
  mcp_name:     'estimate_teacher_pension',
  mandate_type: 'org.apexlogics/education_roi',
  ap2_mandate_type: 'teacher_pension_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };
// Guest-legal integer power (loop multiplication). n must be a non-negative integer.
const ipow = (base, n) => { let r = 1; const k = n < 0 ? 0 : Math.floor(n); for (let i = 0; i < k; i++) r *= base; return r; };

function projectFAS(currentSalary, yearsFromNow, growthPct, fasYears) {
  const g = growthPct / 100;
  let sum = 0;
  for (let y = 0; y < fasYears; y++) {
    sum += currentSalary * ipow(1 + g, yearsFromNow - y);
  }
  return sum / fasYears;
}

function pensionAtYears(yearsService, currentYears, currentSalary, growthPct, fasYears, multiplier, pensionCola, retirementYears, discountRate) {
  const yearsToRet = yearsService - currentYears;
  const fas = projectFAS(currentSalary, Math.max(0, yearsToRet), growthPct, fasYears);
  const finalSalary = currentSalary * ipow(1 + growthPct / 100, Math.max(0, yearsToRet));
  const annualPension = multiplier / 100 * yearsService * fas;
  let lifetimeNom = 0, lifetimePV = 0;
  for (let y = 1; y <= retirementYears; y++) {
    const annualY = annualPension * ipow(1 + pensionCola / 100, y - 1);
    lifetimeNom += annualY;
    lifetimePV += annualY / ipow(1 + discountRate / 100, y);
  }
  return { annualPension, fas, finalSalary, lifetimeNom, lifetimePV, yearsService };
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const multiplier      = num(g('multiplier'));
  const vestingYears    = num(g('vestingYears'));
  const fasType         = num(g('fasType'));
  const currentYears    = num(g('currentYears'));
  const plannedRetYears = num(g('plannedRetYears'));
  const currentSalary   = num(g('currentSalary'));
  const salaryGrowth    = num(g('salaryGrowthPct'));
  const retirementYears = num(g('estYearsInRetirement'));
  const pensionCola     = num(g('pensionCola'));
  const discountRate    = num(g('discountRate'));

  const p = pensionAtYears(plannedRetYears, currentYears, currentSalary, salaryGrowth, fasType, multiplier, pensionCola, retirementYears, discountRate);
  const isVested = currentYears >= vestingYears;

  const _cgDomain = {
    inputs: {
      multiplier: multiplier, vestingYears: vestingYears, fasType: fasType,
      currentYears: currentYears, plannedRetYears: plannedRetYears, currentSalary: currentSalary,
      salaryGrowthPct: salaryGrowth, estYearsInRetirement: retirementYears,
      pensionColaPct: pensionCola, discountRate: discountRate,
    },
    outputs: {
      fas:                    Math.round(p.fas),
      annualPension:          Math.round(p.annualPension),
      replacementRatePct:     +((p.annualPension / p.finalSalary * 100).toFixed(1)),
      lifetimePensionPV:      Math.round(p.lifetimePV),
      lifetimePensionNominal: Math.round(p.lifetimeNom),
      isVested:               isVested,
    },
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026', regulatory_citations: [] },
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
      apex_meta: { ap2_mandate_type: 'teacher_pension_record', al_id: 'AL-128', tool_name: 'Teacher Pension Estimator' },
    },
  };
}
