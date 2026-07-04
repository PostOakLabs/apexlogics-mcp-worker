/**
 * 135-option-exercise-window.kernel.mjs
 * OpenChainGraph server-side kernel — Option Exercise Window (AL-142).
 *
 * Compute ported VERBATIM from repo/tools/135-option-exercise-window/index.html
 * (calculate() L301-377 + exportAP2 preimage L485-521). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.max/min/floor/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '135-option-exercise-window';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-142',
  mcp_name:     'model_option_exercise_window',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'exercise_window_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const vestedShares  = num(g('vestedShares'));
  const strikePrice   = num(g('strikePrice'));
  const fmv           = num(g('fmv'));
  const optionType    = g('optionType');
  const windowDays    = num(g('windowDays'));
  const cashAvailable = num(g('cashAvailable'));
  const exitLow       = num(g('exitLow'));
  const exitBase      = num(g('exitBase'));
  const exitHigh      = num(g('exitHigh'));
  const pBear         = num(g('pBear')) / 100;
  const pBase         = num(g('pBase')) / 100;
  const pBull         = num(g('pBull')) / 100;

  const exerciseCost = vestedShares * strikePrice;
  const spread = vestedShares * (fmv - strikePrice);
  const maxAffordable = cashAvailable > 0 && strikePrice > 0
    ? Math.floor(cashAvailable / strikePrice) : vestedShares;
  const exercisableShares = Math.min(vestedShares, cashAvailable > 0 ? maxAffordable : vestedShares);

  const scenarios = [
    { exit: exitLow,  p: pBear },
    { exit: exitBase, p: pBase },
    { exit: exitHigh, p: pBull },
  ];
  let evExercise = 0;
  for (const s of scenarios) {
    const grossProceeds = vestedShares * s.exit;
    const net = grossProceeds - exerciseCost;
    evExercise += s.p * Math.max(0, net);
  }

  const amtFlag = optionType === 'iso' && spread > 50000;
  const underwater = fmv <= strikePrice;

  const _cgDomain = {
    inputs: {
      vestedShares: vestedShares, strikePrice: strikePrice, fmv: fmv,
      optionType: optionType, windowDays: windowDays, cashAvailable: cashAvailable,
    },
    outputs: {
      exerciseCost:      Math.round(exerciseCost),
      spread:            Math.round(spread),
      evExercise:        Math.round(evExercise),
      exercisableShares: exercisableShares,
      amtFlag:           amtFlag,
      verdict:           underwater ? 'lapse' : evExercise > 0 ? 'exercise' : 'caution',
    },
    downstream_handoff_candidates: ['AL-116'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026' },
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
      apex_meta: { ap2_mandate_type: 'exercise_window_record', al_id: 'AL-142', tool_name: 'Option Exercise Window', downstream_handoff_candidates: ['AL-116'] },
    },
  };
}
