/**
 * 144-h1b-job-change-risk.kernel.mjs
 * OpenChainGraph server-side kernel — H-1B Job-Change Risk & Cost Calculator (AL-151).
 *
 * Compute ported VERBATIM from repo/tools/144-h1b-job-change-risk/index.html
 * (calculate() L331-437 + exportAP2 preimage L530-577). _cgDomain-family preimage
 * (blocklist-filtered payload -> {inputs, outputs, downstream_handoff_candidates, metadata}).
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.ceil/max only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 * Note: uscisFilingFee is used to compute totalFees/employeeShare but is NOT part of
 * the tool's exported `inputs` (browser omits it from the payload too) — kept as a
 * local-only value, mirroring the browser.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '144-h1b-job-change-risk';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-151',
  mcp_name:     'assess_h1b_job_change',
  mandate_type: 'org.apexlogics/immigration_assessment',
  ap2_mandate_type: 'h1b_change_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const h1bStatus        = g('h1bStatus');
  const i94Expiry        = num(g('i94Expiry'));
  const priorityDate     = g('priorityDate');
  const yearsOnH1b       = num(g('yearsOnH1b'));
  const nationality      = g('nationality');
  const currentSalary    = num(g('currentSalary'));
  const newSalary        = num(g('newSalary'));
  const signingBonus     = num(g('signingBonus'));
  const startStrategy    = g('startStrategy');
  const gapWeeks         = num(g('gapWeeks'));
  const attorneyFee      = num(g('attorneyFee'));
  const uscisFilingFee   = num(g('uscisFilingFee'));
  const premiumProc      = num(g('premiumProcessing'));
  const paidByEmployer   = g('paidByEmployer');
  const transferTimeline = num(g('transferTimeline'));

  // ── Total cost + employee share ──
  const totalFees = attorneyFee + uscisFilingFee + premiumProc;
  let employeeShare;
  if (paidByEmployer === 'employer')      employeeShare = 0;
  else if (paidByEmployer === 'split')    employeeShare = attorneyFee;
  else                                    employeeShare = totalFees;

  // ── Salary gain & payback ──
  const salaryGain = newSalary - currentSalary;
  const firstYearGain = signingBonus + salaryGain - employeeShare;
  const paybackMonths = employeeShare > 0 ? Math.ceil(employeeShare / (salaryGain / 12)) : 0;

  // ── Risk assessment ──
  const gapDays = gapWeeks * 7;
  let unlawfulPresenceLevel = 'none';
  if (gapDays > 0 && gapDays <= 180) unlawfulPresenceLevel = 'low';
  if (gapDays > 180 && gapDays <= 365) unlawfulPresenceLevel = 'high_3yr_bar';
  if (gapDays > 365) unlawfulPresenceLevel = 'high_10yr_bar';

  const h1bYearsLeft = 6 - yearsOnH1b;
  const needsExtension = h1bYearsLeft <= 1.5;
  const extensionPossible = priorityDate === 'yes_backlogged' || priorityDate === 'yes_current';

  let riskLevel;
  if (unlawfulPresenceLevel === 'high_3yr_bar' || unlawfulPresenceLevel === 'high_10yr_bar') {
    riskLevel = 'high';
  } else if (gapDays > 0 || (needsExtension && !extensionPossible) || i94Expiry < 6) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Build risk flags (only need the count of danger/warn for the preimage)
  const flags = [];
  if (gapWeeks > 0) flags.push({ level: 'danger' });
  if (unlawfulPresenceLevel === 'high_3yr_bar') flags.push({ level: 'danger' });
  if (unlawfulPresenceLevel === 'high_10yr_bar') flags.push({ level: 'danger' });
  if (needsExtension && !extensionPossible) flags.push({ level: 'warn' });
  if (needsExtension && extensionPossible) flags.push({ level: 'info' });
  if (i94Expiry < 6) flags.push({ level: 'warn' });
  if (startStrategy === 'portability') flags.push({ level: 'info' });
  if (startStrategy === 'wait_approval') flags.push({ level: 'warn' });
  if (nationality === 'india' && priorityDate === 'yes_backlogged') flags.push({ level: 'warn' });

  const _cgDomain = {
    inputs: {
      h1bStatus: h1bStatus, i94ExpiryMonths: i94Expiry,
      priorityDate: priorityDate, yearsOnH1b: yearsOnH1b, nationality: nationality,
      currentSalary: currentSalary, newSalary: newSalary, signingBonus: signingBonus,
      startStrategy: startStrategy, gapWeeks: gapWeeks,
      attorneyFee: attorneyFee, premiumProcessing: premiumProc > 0,
      paidByEmployer: paidByEmployer, transferTimelineWeeks: transferTimeline,
    },
    outputs: {
      riskLevel: riskLevel, employeeOutOfPocket: employeeShare,
      annualSalaryGain: salaryGain, firstYearNetGain: Math.round(firstYearGain),
      paybackMonths: paybackMonths, unlawfulPresenceRisk: unlawfulPresenceLevel,
      gapDays: gapDays, needsExtension: needsExtension,
      riskFlagCount: flags.filter((f) => f.level === 'danger' || f.level === 'warn').length,
    },
    downstream_handoff_candidates: ['AL-152', 'AL-120'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'INA §214(n) AC21; USCIS fee schedule 2024; not legal advice' },
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
      apex_meta: { ap2_mandate_type: 'h1b_change_record', al_id: 'AL-151', tool_name: 'H-1B Job-Change Risk & Cost Calculator', downstream_handoff_candidates: ['AL-152', 'AL-120'] },
    },
  };
}
