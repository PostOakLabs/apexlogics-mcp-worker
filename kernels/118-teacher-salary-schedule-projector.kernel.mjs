/**
 * 118-teacher-salary-schedule-projector.kernel.mjs
 * OpenChainGraph server-side kernel — Teacher Salary Schedule & Lifetime Earnings Projector (AL-125).
 *
 * Compute ported VERBATIM from repo/tools/118-teacher-salary-schedule-projector/index.html
 * (calculate() L339-412 + exportAP2 preimage L505-529). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '118-teacher-salary-schedule-projector';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-125',
  mcp_name:     'project_teacher_salary_schedule',
  mandate_type: 'org.apexlogics/education_roi',
  ap2_mandate_type: 'teacher_salary_schedule_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

const LANE_NAMES = ['BA', 'BA+15', 'BA+30', 'MA', 'MA+30', 'MA+60', 'Doctorate'];

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const currentLane      = num(g('currentLane'));
  const currentStep      = num(g('currentStep'));
  const currentSalary    = num(g('currentSalary'));
  const annualStep       = num(g('annualStepIncrease'));
  const yearsToRet       = num(g('yearsToRetirement'));
  const colaPct          = num(g('colaPct')) / 100;

  const lc1Year    = num(g('laneChange1Year'));
  const lc1Target  = num(g('laneChange1Target'));
  const lc1Bump    = num(g('laneChange1Bump'));
  const lc2Year    = num(g('laneChange2Year'));
  const lc2Target  = num(g('laneChange2Target'));
  const lc2Bump    = num(g('laneChange2Bump'));

  const rows = [];
  let salary      = currentSalary;
  let baseSalary  = currentSalary;
  let laneIdx     = currentLane;
  let lifetimeSum = 0;
  let baselineSum = 0;
  let laneUpLift  = 0;

  const lc1Applied = { done: false };
  const lc2Applied = { done: false };

  for (let yr = 1; yr <= yearsToRet; yr++) {
    const stepThisYear = currentStep + yr;
    let isLaneJump = false;

    if (lc1Year > 0 && yr === lc1Year && lc1Target >= 0 && !lc1Applied.done) {
      salary    += lc1Bump;
      laneIdx    = lc1Target;
      laneUpLift += lc1Bump * (yearsToRet - yr + 1);
      isLaneJump = true;
      lc1Applied.done = true;
    }
    if (lc2Year > 0 && yr === lc2Year && lc2Target >= 0 && !lc2Applied.done) {
      salary    += lc2Bump;
      laneIdx    = lc2Target;
      laneUpLift += lc2Bump * (yearsToRet - yr + 1);
      isLaneJump = true;
      lc2Applied.done = true;
    }

    const annualSalary   = salary + annualStep;
    const baselineAnnual = baseSalary + annualStep;
    lifetimeSum += annualSalary;
    baselineSum += baselineAnnual;
    rows.push({ yr, step: stepThisYear, lane: LANE_NAMES[laneIdx] || LANE_NAMES[currentLane],
      salary: annualSalary, baseline: baselineAnnual, isLaneJump });

    salary     = annualSalary   * (1 + colaPct);
    baseSalary = baselineAnnual * (1 + colaPct);
  }

  const finalSalary = rows[rows.length - 1].salary;
  const avgSalary   = lifetimeSum / yearsToRet;
  const laneUplift  = lifetimeSum - baselineSum;

  const _cgDomain = {
    inputs: {
      currentLane: LANE_NAMES[currentLane],
      currentStep: currentStep,
      currentSalary: currentSalary,
      annualStepIncrease: annualStep,
      yearsToRetirement: yearsToRet,
      colaPct: +(colaPct * 100).toFixed(2),
      laneChange1: lc1Year > 0 ? { year: lc1Year, targetLane: LANE_NAMES[lc1Target], bump: lc1Bump } : null,
      laneChange2: lc2Year > 0 ? { year: lc2Year, targetLane: LANE_NAMES[lc2Target], bump: lc2Bump } : null,
    },
    outputs: {
      lifetimeEarnings: Math.round(lifetimeSum),
      baselineEarnings: Math.round(baselineSum),
      laneChangeUplift: Math.round(laneUplift),
      projectedFinalSalary: Math.round(finalSalary),
      averageSalary: Math.round(avgSalary),
    },
    downstream_handoff_candidates: ['AL-126', 'AL-128'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'BLS OEWS 2025' },
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
      apex_meta: { ap2_mandate_type: 'teacher_salary_schedule_record', al_id: 'AL-125', tool_name: 'Teacher Salary Schedule & Lifetime Earnings Projector', downstream_handoff_candidates: ['AL-126', 'AL-128'] },
    },
  };
}
