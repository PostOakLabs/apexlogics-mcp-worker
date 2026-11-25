/**
 * 137-qbi-199a-optimizer.kernel.mjs
 * OpenChainGraph server-side kernel — QBI §199A Deduction Optimizer (AL-144).
 *
 * Compute ported VERBATIM from repo/tools/137-qbi-199a-optimizer/index.html
 * (calculate() L279-375 + exportAP2 preimage L454-500). _cgDomain-family preimage.
 * Reproduces the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '137-qbi-199a-optimizer';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-144',
  mcp_name:     'optimize_qbi_199a',
  mandate_type: 'org.apexlogics/tax_projection',
  ap2_mandate_type: 'qbi_deduction_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const qbi           = num(g('qbi'));
  const taxableIncome = num(g('taxableIncome'));
  const filingStatus  = g('filingStatus');
  const isSSTB        = g('sstb') === 'yes';
  const w2Wages       = num(g('w2Wages'));
  const ubia          = num(g('ubia'));
  const threshold     = num(g('threshold'));
  const phaseoutBand  = num(g('phaseoutBand'));

  const phaseoutEnd = threshold + phaseoutBand;
  const tentative = qbi * 0.20;

  const w2Limit  = w2Wages * 0.50;
  const ubaLimit = w2Wages * 0.25 + ubia * 0.025;
  const propertyLimit = Math.max(w2Limit, ubaLimit);

  let deduction = 0;
  let sstbDisallowed = false;
  let phaseoutPct = 0;
  let leverW2Needed = 0;

  // §199A(b)(2)-(3), (d)(3): the W-2/UBIA limit applies whenever it is lower than
  // 20% of QBI, including when it is $0. In the phase-in range the excess over the
  // limit is phased in; for an SSTB, QBI, W-2 wages and UBIA are first scaled by the
  // applicable percentage (1 - phase-in %). The result is capped at 20% of taxable
  // income (§199A(a)(1)(B); no net-capital-gain input here).
  if (taxableIncome <= threshold) {
    deduction = tentative;
  } else if (taxableIncome >= phaseoutEnd) {
    if (isSSTB) {
      deduction = 0;
      sstbDisallowed = true;
    } else {
      deduction = Math.min(tentative, propertyLimit);
      if (w2Wages < qbi * 0.5 && tentative > propertyLimit) {
        leverW2Needed = Math.round((tentative - propertyLimit) / 0.5);
      }
    }
  } else {
    phaseoutPct = (taxableIncome - threshold) / phaseoutBand;
    const applicablePct = isSSTB ? 1 - phaseoutPct : 1;
    const scaledTentative = tentative * applicablePct;
    const scaledLimit = propertyLimit * applicablePct;
    deduction = scaledTentative - phaseoutPct * Math.max(0, scaledTentative - scaledLimit);
  }
  deduction = Math.max(0, Math.min(deduction, taxableIncome * 0.20));

  const minDed = (qbi >= 1000 && deduction < 400) ? 400 : 0;
  const finalDeduction = Math.max(deduction, minDed);

  const taxSaved = finalDeduction * 0.22;

  const _cgDomain = {
    inputs: {
      qbi: qbi,
      taxableIncome: taxableIncome,
      filingStatus: filingStatus,
      isSSTB: isSSTB,
      w2Wages: w2Wages,
      ubia: ubia,
      threshold: threshold,
      phaseoutBand: phaseoutBand,
    },
    outputs: {
      qbiDeduction: Math.round(finalDeduction),
      tentativeDeduction: Math.round(tentative),
      bindingLimit: Math.round(propertyLimit),
      taxSavedEstimate: Math.round(taxSaved),
      phaseoutPct: +phaseoutPct.toFixed(3),
      sstbDisallowed: sstbDisallowed,
      leverW2Needed: leverW2Needed,
    },
    downstream_handoff_candidates: ['AL-118'],
    metadata: { license: 'CC-BY-4.0', data_vintage: '2026 §199A OBBBA-permanent; thresholds $201,750/$403,500' },
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
      apex_meta: { ap2_mandate_type: 'qbi_deduction_record', al_id: 'AL-144', tool_name: 'QBI §199A Deduction Optimizer', downstream_handoff_candidates: ['AL-118'] },
    },
  };
}
