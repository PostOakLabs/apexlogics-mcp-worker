/**
 * 133-shift-differential-overtime-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — Shift Differential & Overtime Optimizer (AL-140).
 *
 * Compute ported VERBATIM from repo/tools/133-shift-differential-overtime-optimizer/index.html
 * (calculate() + exportAP2 preimage assembly). _cgDomain-family preimage
 * (like AL-136): policy_parameters.inputs AND output_payload both = { inputs, outputs,
 * downstream_handoff_candidates, metadata }. Reproduces the browser §6 execution_hash
 * byte-for-byte; scripts/kernel-parity.mjs proves it by real execution.
 *
 * FLSA WEEKLY RULE (AL-133-OT-THRESHOLD, adopted from AINumbers art-340's implementation
 * of 29 CFR §778 — the rule, not the code): overtime hours are TOTAL weekly hours above
 * the otThreshold field; the shift differential is part of the regular rate; premium =
 * (multiplier − 1) × regular rate × overtime hours. Parity vectors copied from art-340's
 * fixture suite live in scripts/art340-parity-133.test.mjs.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; no Math.pow/log/exp/sin/cos (Math.max/min/round
 * only); no Date/Intl/locale; finite-guarded. Input keys mirror the tool's DOM field ids so
 * the same case drives both runtimes. Field defaults replicate the tool's `parseFloat||d`.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '133-shift-differential-overtime-optimizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-140',
  mcp_name:     'optimize_shift_differential_overtime',
  mandate_type: 'org.apexlogics/compensation_assessment',
  ap2_mandate_type: 'shift_differential_optimizer_record',
  gpu:          false,
};

const PRESET_SHIFTS = [
  { name: 'Day Shift (7a–3p)' },
  { name: 'Evening Shift (3p–11p)' },
  { name: 'Night Shift (11p–7a)' },
  { name: 'Weekend Night (3×12)' },
];

// browser reads: `parseFloat(v) || d` (0 and NaN both fall to the default).
const pf = (v, d) => parseFloat(v) || d;

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const baseRate         = pf(g('baseRate'), 32);
  const otThreshold      = pf(g('otThreshold'), 40);
  const otMult           = pf(g('otMultiplier'), 1.5);
  const taxRate          = (parseFloat(g('taxRate')) / 100) || 0.22;   // browser: /100 || 0.22
  const childcareCost    = pf(g('childcareCost'), 14400);
  const altChildcareCost = pf(g('altChildcareCost'), 8400);

  const results = [];
  for (let i = 0; i < 4; i++) {
    const hours   = pf(g(`s${i}-hours`), 36);
    const diffPct = (parseFloat(g(`s${i}-diff`)) / 100) || 0;
    const otHours = pf(g(`s${i}-ot`), 0);
    const weeks   = pf(g(`s${i}-weeks`), 50);
    const altCc   = g(`s${i}-alt`);

    // FLSA weekly rule (adopted from art-340, see header): overtime hours are total
    // weekly hours above the threshold; diff rides into the regular rate; premium =
    // (multiplier − 1) × regular rate × overtime hours.
    const effectiveBase  = baseRate * (1 + diffPct);
    const totalHours     = hours + otHours;
    const otPremHours    = Math.max(0, totalHours - otThreshold);
    const regularHours   = totalHours - otPremHours;
    const weeklyGross    = effectiveBase * regularHours + effectiveBase * otMult * otPremHours;
    const diffValueWeekly = baseRate * diffPct * totalHours;
    const otValueWeekly  = effectiveBase * (otMult - 1) * otPremHours;
    const annualGross    = weeklyGross * weeks;
    const annualDiffValue = diffValueWeekly * weeks;
    const annualOTValue  = otValueWeekly * weeks;
    const cc = altCc === 'none' ? 0 : altCc === 'yes' ? altChildcareCost : childcareCost;
    const tax = annualGross * taxRate;
    const netAnnual = annualGross - tax - cc;

    results.push({ idx: i, name: PRESET_SHIFTS[i].name, hours: totalHours, effectiveBase, annualGross, annualDiffValue, annualOTValue, cc, tax, netAnnual });
  }

  const best = results.reduce((a, b) => a.netAnnual > b.netAnnual ? a : b);
  const baseOnly = baseRate * 36 * 50 * (1 - taxRate) - childcareCost;
  const netVsBase = best.netAnnual - baseOnly;

  // ── exact preimage (_cgDomain, exportAP2 L351-378) ──────────────────────────
  const _cgDomain = {
    inputs: { baseRate: baseRate, otThreshold: otThreshold, taxRatePct: taxRate * 100, schedulesModeled: results.length },
    outputs: {
      bestSchedule:     best.name,
      bestNetAnnual:    Math.round(best.netAnnual),
      bestGrossAnnual:  Math.round(best.annualGross),
      netVsBaseSchedule: Math.round(netVsBase),
      allScheduleNets:  results.map((s) => ({ name: s.name, netAnnual: Math.round(s.netAnnual) })),
    },
    downstream_handoff_candidates: ['AL-28', 'AL-139'],
    metadata: { data_vintage: '29 U.S.C. §207 (FLSA OT); 29 CFR §778.207 (shift diff in OT rate)', tool_name: 'Shift Differential & Overtime Optimizer' },
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
      server_side_executed: true,
      zero_pii_verified:    true,
      deterministic_run:    true,
      apex_meta: {
        ap2_mandate_type: 'shift_differential_optimizer_record',
        al_id:            'AL-140',
        tool_name:        'Shift Differential & Overtime Optimizer',
        downstream_handoff_candidates: ['AL-28', 'AL-139'],
      },
    },
  };
}
