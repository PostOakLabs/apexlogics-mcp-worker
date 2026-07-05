/**
 * 127-veteran-income-bridge.kernel.mjs
 * OpenChainGraph server-side kernel — Veteran Income Bridge (AL-134).
 *
 * Compute ported VERBATIM from repo/tools/127-veteran-income-bridge/index.html
 * (lookupVARate() L282-285, calculate() L289-369 + exportAP2 preimage L426-459).
 * _cgDomain-family preimage. Reproduces the browser §6 execution_hash byte-for-byte;
 * kernel-parity.mjs proves it.
 *
 * NOTE: calculate()'s month-by-month rows[] (L334-357) and civMonthlyNet drive
 * on-page table/text only — not part of exportAP2's inputs/outputs — omitted from
 * the kernel preimage accordingly (monthlyBridgeDuringGap/coverageRatio/runwayEnd
 * still computed here since they ARE exported).
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.round/max only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '127-veteran-income-bridge';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-134',
  mcp_name:     'bridge_veteran_income',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'veteran_income_bridge_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

const VA_RATES_FY2025 = {
  10: 175.51, 20: 346.95, 30: 537.42, 40: 774.16, 50: 1102.04,
  60: 1395.93, 70: 1759.19, 80: 2044.89, 90: 2297.96, 100: 3831.30,
};

function lookupVARate(rating) {
  const snapped = Math.round(rating / 10) * 10;
  return VA_RATES_FY2025[snapped] || 0;
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const sepType          = g('sepType');
  const yos              = num(g('yos')) || 8;
  const basePay          = num(g('basePay')) || 4200;
  const age              = num(g('age')) || 30;
  const disabilityRating = num(g('disabilityRating')) || 0;
  const gapMonths        = num(g('gapMonths')) || 3;
  const severanceLump    = num(g('severanceLump')) || 0;
  const tspMonthly       = num(g('tspMonthly')) || 0;
  const spouseIncome     = num(g('spouseIncome')) || 0;
  const uiMonthly        = num(g('uiMonthly')) || 0;
  const bridgeIncome     = num(g('bridgeIncome')) || 0;
  const monthlyExpenses  = num(g('monthlyExpenses')) || 5500;
  const civSalary        = num(g('civSalary')) || 72000;
  const taxRate          = (num(g('taxRate')) / 100) || 0.22;
  const modelMonths      = num(g('modelMonths')) || 18;
  const savingsAvail     = num(g('savingsAvail')) || 15000;

  let calcSeverance = severanceLump;
  if (severanceLump === 0) {
    if (sepType === 'involuntary') {
      calcSeverance = basePay * 2 * yos;
    } else if (sepType === 'retirement') {
      calcSeverance = 0;
    } else if (sepType === 'medical') {
      calcSeverance = basePay * 2 * yos;
    }
  }

  const vaMonthly = lookupVARate(disabilityRating);
  const retirementMonthly = sepType === 'retirement' ? basePay * 0.025 * yos : 0;
  const tspPenalty = (age < 55 && tspMonthly > 0) ? tspMonthly * 0.10 : 0;
  const civMonthlyNet = civSalary / 12 * (1 - taxRate);

  let savings = savingsAvail;
  let runwayEnd = null;
  for (let m = 1; m <= modelMonths; m++) {
    const inGap = m <= gapMonths;
    const hasCivJob = !inGap;

    const civIncome = hasCivJob ? civMonthlyNet : 0;
    const uiThisMonth = inGap ? uiMonthly : 0;
    const bridgeThisMonth = inGap ? bridgeIncome : 0;
    const tspThis = inGap ? Math.max(0, tspMonthly - tspPenalty) : 0;
    const severanceMonthly = inGap && gapMonths > 0 ? calcSeverance / gapMonths : 0;

    const totalIn = vaMonthly + retirementMonthly + spouseIncome + uiThisMonth + bridgeThisMonth + tspThis + severanceMonthly + civIncome;
    const netMonth = totalIn - monthlyExpenses;
    savings += netMonth;
    if (savings < 0 && runwayEnd === null) runwayEnd = m - 1;
  }

  const monthlyBridgeDuringGap = vaMonthly + retirementMonthly + spouseIncome + uiMonthly + bridgeIncome + (tspMonthly > 0 ? Math.max(0, tspMonthly - tspPenalty) : 0) + (gapMonths > 0 ? calcSeverance / gapMonths : 0);
  const coverageRatio = monthlyExpenses > 0 ? monthlyBridgeDuringGap / monthlyExpenses : 0;

  const _cgDomain = {
    inputs: {
      sepType: sepType, yos: yos, basePay: basePay, disabilityRating: disabilityRating,
      gapMonths: gapMonths, monthlyExpenses: monthlyExpenses, civSalary: civSalary,
    },
    outputs: {
      monthlyBridgeIncome: Math.round(monthlyBridgeDuringGap), coverageRatioPct: +(coverageRatio * 100).toFixed(1),
      vaMonthly: Math.round(vaMonthly), calcSeverance: Math.round(calcSeverance),
      runwayMonths: runwayEnd === null ? modelMonths : runwayEnd,
    },
    downstream_handoff_candidates: ['AL-132', 'AL-133'],
    metadata: { data_vintage: 'VA FY2025 disability rates (38 CFR, Dec 1 2024); 10 U.S.C. §1174; IRC §72(t)', tool_name: 'Veteran Income Bridge' },
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
      apex_meta: { ap2_mandate_type: 'veteran_income_bridge_record', al_id: 'AL-134', tool_name: 'Veteran Income Bridge', downstream_handoff_candidates: ['AL-132', 'AL-133'] },
    },
  };
}
