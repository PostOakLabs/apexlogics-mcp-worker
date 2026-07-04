/**
 * 136-severance-ui-timing.kernel.mjs
 * OpenChainGraph server-side kernel — Severance & UI Timing (AL-143).
 *
 * Compute ported VERBATIM from repo/tools/136-severance-ui-timing/index.html
 * (calculate() L245-305 + exportAP2 preimage L405-426). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only; no pow/exp/log,
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '136-severance-ui-timing';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-143',
  mcp_name:     'sequence_severance_ui_timing',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'severance_ui_timing_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const severanceForm  = g('severanceForm');
  const severanceTotal = num(g('severanceTotal'));
  const weeklySalary   = num(g('weeklySalary'));
  const stateBucket    = g('stateBucket');
  const weeklyBenefit  = num(g('weeklyBenefit'));
  const searchWeeks    = num(g('searchWeeks'));

  const continuationWeeks = weeklySalary > 0 ? Math.round(severanceTotal / weeklySalary) : 0;

  let delayWeeksOptimal = 0;
  let delayWeeksSuboptimal = 0;
  let optimalAction = '';

  if (stateBucket === 'nodelay') {
    delayWeeksOptimal = 0;
    delayWeeksSuboptimal = 0;
    optimalAction = severanceForm === 'lump'
      ? 'Request lump sum (no UI delay in your state)'
      : 'Salary continuation (no UI delay in your state)';
  } else {
    if (severanceForm === 'continuation') {
      delayWeeksOptimal = 0;
      delayWeeksSuboptimal = continuationWeeks;
      optimalAction = 'Negotiate to convert continuation to lump sum → file UI immediately';
    } else {
      delayWeeksOptimal = 0;
      delayWeeksSuboptimal = 0;
      optimalAction = 'File UI after standard waiting week (lump sum typically doesn\'t delay)';
    }
  }

  const maxUIWeeks = Math.min(searchWeeks, 26);
  const uiWeeksOptimal    = Math.max(0, maxUIWeeks - delayWeeksOptimal);
  const uiWeeksSuboptimal = Math.max(0, maxUIWeeks - delayWeeksSuboptimal);
  const totalUIOptimal    = uiWeeksOptimal    * weeklyBenefit;
  const totalUISuboptimal = uiWeeksSuboptimal * weeklyBenefit;
  const benefitLeft       = Math.max(0, totalUIOptimal - totalUISuboptimal);

  const _cgDomain = {
    inputs: {
      severanceForm: severanceForm, severanceTotal: severanceTotal, weeklySalary: weeklySalary,
      stateBucket: stateBucket, weeklyBenefit: weeklyBenefit, searchWeeks: searchWeeks,
    },
    outputs: {
      optimalAction:   optimalAction,
      uiDelayWeeks:    delayWeeksOptimal,
      uiWeeksCaptured: uiWeeksOptimal,
      totalUIOptimal:  Math.round(totalUIOptimal),
      benefitsAtRisk:  Math.round(benefitLeft),
    },
    downstream_handoff_candidates: ['AL-27'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026 state UI buckets' },
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
      apex_meta: { ap2_mandate_type: 'severance_ui_timing_record', al_id: 'AL-143', tool_name: 'Severance & UI Timing', downstream_handoff_candidates: ['AL-27'] },
    },
  };
}
