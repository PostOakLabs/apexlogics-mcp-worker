/**
 * 36-workforce-pell-eligibility-screener.kernel.mjs
 * OpenChainGraph server-side kernel — Workforce Pell Eligibility Screener (AL-41).
 *
 * Compute ported VERBATIM from repo/tools/36-workforce-pell-eligibility-screener/index.html
 * (calculate() L575-618 + estimateSAI/pellFromSAI/prorate helpers + exportAP2 preimage).
 * The `.check-item` checkboxes come from querySelectorAll (empty in the parity harness fake
 * DOM) so allOk=true / failCount=0 in the fixture. Emits `results.eligibility_status`
 * (eligible / review / ineligible) — the field the D3 §4a gated chain routes on.
 *
 * GUEST-LEGAL: imports only ./_hash.mjs; Math.min/max/round/floor only (no pow/exp/log);
 * no Date/Intl/locale in the preimage path; finite-guarded. Input keys mirror DOM ids.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '36-workforce-pell-eligibility-screener';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-41',
  mcp_name:     'screen_workforce_pell_eligibility',
  mandate_type: 'org.apexlogics/workforce_analytics',
  ap2_mandate_type: 'workforce_pell_record',
  gpu:          false,
};

const PELL_MAX   = 7395;
const PELL_MIN   = 740;
const SAI_CUTOFF = 14790;
const HRS_DENOM  = 900;
const WKS_DENOM  = 24;
const IPA = { 1: 12010, 2: 15810, 3: 19690, 4: 24290, 5: 28690, 6: 33090, 7: 37490, 8: 41890 };
const r5 = (n) => Math.round(n / 5) * 5;

function estimateSAI(agi, famSize) {
  const s = Math.min(Math.max(1, famSize), 8);
  const ipa = IPA[s];
  const avail = Math.max(0, agi - ipa);
  return Math.max(-1500, Math.round(avail * 0.22));
}
function pellFromSAI(sai) {
  if (sai >= SAI_CUTOFF) return 0;
  const raw = r5(PELL_MAX - Math.max(0, sai));
  return Math.max(PELL_MIN, Math.min(raw, PELL_MAX));
}
function prorate(basePell, hrs, wks) {
  const rH = hrs / HRS_DENOM;
  const rW = wks / WKS_DENOM;
  const ratio = Math.min(rH, rW);
  return { award: r5(ratio * basePell), ratio, binding: rH <= rW ? 'hours' : 'weeks' };
}

export function compute(inputs = {}) {
  const g = (k) => inputs[k];
  const pf = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  const pi = (v) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : NaN; };
  const agi      = pf(g('agi'));
  const saiRaw   = String(g('saiDirect') ?? '').trim();
  const famSize  = pi(g('familySize'));
  const pellUsed = parseFloat(g('pellYearsUsed'));
  const degLevel = g('degreeLevel');
  const hrs      = pi(g('clockHours'));
  const wks      = pi(g('programWeeks'));
  const occ      = g('occCategory');
  const cost     = pf(g('programCost'));
  const dep      = g('dep') ?? 'independent';     // browser _dep default; harness never toggles it

  // .check-item checkboxes are querySelectorAll -> [] in the harness fixture.
  const checks   = Array.isArray(g('checks')) ? g('checks') : [];
  const allOk    = checks.every(Boolean);
  const failCount = checks.filter((c) => !c).length;

  let sai, saiSrc;
  if (saiRaw !== '' && !isNaN(+saiRaw)) {
    sai = +saiRaw;
    saiSrc = 'Direct entry (from FAFSA Student Aid Report)';
  } else {
    sai = estimateSAI(agi, famSize);
    saiSrc = 'Estimated: AGI − IPA × 22% (independent student formula)';
  }

  const gradIneligible = degLevel === 'graduate';
  const pellExhausted  = pellUsed >= 6;
  const validRange     = hrs >= 150 && hrs <= 599 && wks >= 8 && wks <= 14;
  const basePell       = pellFromSAI(sai);
  const finEligible    = basePell > 0;

  let pro = null;
  if (validRange && finEligible && !gradIneligible && !pellExhausted) pro = prorate(basePell, hrs, wks);

  const reasons = [];
  if (gradIneligible) reasons.push('graduate/professional degree holders are not eligible');
  if (pellExhausted)  reasons.push('lifetime Pell limit of 6 years has been reached');
  if (!finEligible)   reasons.push('SAI ≥ $14,790 (above OBBBA income threshold)');
  if (!validRange)    reasons.push('program outside 150–599 hrs / 8–14 wks range');
  if (!allOk)         reasons.push(failCount + ' eligibility requirement(s) unchecked');

  const status = reasons.length > 0 ? 'ineligible'
    : (occ === '' || occ === 'unknown') ? 'review' : 'eligible';
  const award = pro ? pro.award : 0;
  const pellRemaining = Math.max(0, 6 - pellUsed);

  const _cgDomain = {
    inputs: {
      agi: agi, sai: sai, sai_source: saiSrc,
      family_size: famSize, dependency_status: dep,
      pell_years_used: pellUsed, highest_degree: degLevel,
      clock_hours: hrs, program_weeks: wks,
      occupation_category: occ, program_cost: cost,
    },
    results: {
      eligibility_status: status,
      estimated_sai: sai,
      base_pell_annual: basePell,
      proration_ratio: pro ? parseFloat(pro.ratio.toFixed(4)) : 0,
      binding_constraint: pro ? pro.binding : null,
      workforce_pell_award: award,
      pell_years_remaining: pellRemaining,
      program_cost_coverage_pct: (cost > 0 && award > 0) ? parseFloat(((award / cost) * 100).toFixed(1)) : null,
      out_of_pocket: cost > 0 ? Math.max(0, cost - award) : null,
      ineligibility_reasons: reasons.length > 0 ? reasons : null,
    },
    downstream_handoff_candidates: ['AL-02', 'AL-01'],
    data_sources: [
      'ED Dear Colleague Letter Jan 2026 — 2026-27 Pell max $7,395 / min $740',
      'OBBBA P.L. 119-21 (signed July 4, 2025) — SAI cutoff expanded to $14,790',
      'Federal Register 2026-04520 (March 9, 2026) — Workforce Pell Final Rule',
    ],
    license: 'CC-BY-4.0',
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
      apex_meta: { ap2_mandate_type: 'workforce_pell_record', al_id: 'AL-41', tool_name: 'Workforce Pell Eligibility Screener', downstream_handoff_candidates: ['AL-02', 'AL-01'] },
    },
  };
}
