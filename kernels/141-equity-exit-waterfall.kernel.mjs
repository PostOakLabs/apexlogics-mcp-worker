/**
 * 141-equity-exit-waterfall.kernel.mjs
 * OpenChainGraph server-side kernel — Equity Exit Waterfall Calculator (AL-148).
 *
 * Compute ported VERBATIM from repo/tools/141-equity-exit-waterfall/index.html
 * (calculate() L268-378 + exportAP2 preimage L468-511). _cgDomain-family preimage
 * (blocklist-filtered payload -> {inputs, outputs, downstream_handoff_candidates, metadata}).
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '141-equity-exit-waterfall';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-148',
  mcp_name:     'calculate_equity_waterfall',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'equity_waterfall_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const exitVal            = num(g('exitValuation'));
  const totalInvested      = num(g('totalInvested'));
  const prefOwnerPct       = num(g('preferredOwnership')) / 100;
  const prefMultiple       = num(g('prefMultiple'));
  const participationType  = g('participationType');
  const participationCap   = num(g('participationCap'));
  const yourRole           = g('yourRole');
  const yourOwnerPct       = num(g('yourOwnership')) / 100;
  const yourStrike         = num(g('yourStrikeTotal'));
  const yourBasis          = num(g('yourCostBasis'));

  const commonOwnerPct  = 1 - prefOwnerPct;
  const liquidPref      = totalInvested * prefMultiple;
  let remaining         = exitVal;
  const layers          = [];

  // Layer 1: Liquidation preference
  const prefPref = Math.min(remaining, liquidPref);
  remaining -= prefPref;
  layers.push({ label: 'Preferred Liquidation Preference', recipient: 'Preferred investors', amount: prefPref });

  // Layer 2: Participation (if applicable) or conversion to common
  let prefParticipation = 0;
  let commonPool = 0;

  if (participationType === 'non') {
    const prefProRata = exitVal * prefOwnerPct;
    if (prefProRata > liquidPref) {
      layers.length = 0;
      layers.push({ label: 'Pro-Rata (Preferred converts to common)', recipient: 'All stockholders', amount: exitVal });
      prefParticipation = exitVal * prefOwnerPct - liquidPref;
      commonPool = exitVal * commonOwnerPct;
      layers[0].amount = exitVal * prefOwnerPct;
      layers.push({ label: 'Pro-Rata Common', recipient: 'Common stockholders', amount: commonPool });
    } else {
      commonPool = remaining;
      if (commonPool > 0) layers.push({ label: 'Common Pro-Rata', recipient: 'Common stockholders', amount: commonPool });
    }
  } else if (participationType === 'full') {
    prefParticipation = remaining * prefOwnerPct;
    commonPool = remaining * commonOwnerPct;
    if (prefParticipation > 0) layers.push({ label: 'Preferred Participation (pro-rata)', recipient: 'Preferred investors', amount: prefParticipation });
    if (commonPool > 0)         layers.push({ label: 'Common Pro-Rata', recipient: 'Common stockholders', amount: commonPool });
  } else {
    // Capped participating
    const capAmount = totalInvested * participationCap;
    const maxParticipation = Math.max(0, capAmount - liquidPref);
    const prefParticipationRaw = remaining * prefOwnerPct;
    prefParticipation = Math.min(prefParticipationRaw, maxParticipation);
    const remainingAfterCap = remaining - prefParticipation;
    const hitCap = prefParticipationRaw > maxParticipation;
    if (hitCap) {
      commonPool = remaining * commonOwnerPct + prefParticipationRaw - prefParticipation;
    } else {
      commonPool = remaining * commonOwnerPct;
    }
    if (prefParticipation > 0) layers.push({ label: 'Preferred Participation (capped ' + participationCap + '×)', recipient: 'Preferred investors', amount: prefParticipation });
    if (commonPool > 0)         layers.push({ label: 'Common Pro-Rata', recipient: 'Common stockholders', amount: commonPool });
  }

  // Total preferred
  const prefTotal = prefPref + prefParticipation;

  // Your share
  let yourGross = 0;
  if (yourRole === 'preferred') {
    yourGross = prefTotal * (yourOwnerPct / prefOwnerPct);
  } else {
    const commonShare = commonOwnerPct > 0 ? yourOwnerPct / commonOwnerPct : 0;
    yourGross = commonPool * commonShare;
  }
  const yourNet = Math.max(0, yourGross - yourStrike);
  const yourGain = Math.max(0, yourNet - yourBasis);

  // Break-even exit for common
  let breakEvenExit = 0;
  if (yourRole !== 'preferred' && commonOwnerPct > 0) {
    if (participationType === 'non') {
      breakEvenExit = liquidPref;
    } else {
      breakEvenExit = liquidPref;
    }
    const commonShareFrac = yourOwnerPct / commonOwnerPct;
    if (commonShareFrac > 0) {
      breakEvenExit = liquidPref + (yourStrike / (commonOwnerPct * commonShareFrac));
    }
  }

  const _cgDomain = {
    inputs: {
      exitValuation: exitVal,
      totalInvested: totalInvested,
      preferredOwnershipPct: +prefOwnerPct.toFixed(4),
      prefMultiple: prefMultiple,
      participationType: participationType,
      yourOwnershipPct: +yourOwnerPct.toFixed(4),
      yourRole: yourRole,
      yourStrikeTotal: yourStrike,
    },
    outputs: {
      liquidationPreference: Math.round(liquidPref),
      preferredTotal: Math.round(prefTotal),
      commonPool: Math.round(commonPool),
      yourGrossProceeds: Math.round(yourGross),
      yourNetProceeds: Math.round(yourNet),
      yourTaxableGain: Math.round(yourGain),
      breakEvenExit: Math.round(breakEvenExit),
    },
    downstream_handoff_candidates: ['AL-147', 'AL-149'],
    metadata: { license: 'CC-BY-4.0', data_vintage: 'Structural model; NVCA standard term sheet conventions' },
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
      apex_meta: { ap2_mandate_type: 'equity_waterfall_record', al_id: 'AL-148', tool_name: 'Equity Exit Waterfall Calculator', downstream_handoff_candidates: ['AL-147', 'AL-149'] },
    },
  };
}
