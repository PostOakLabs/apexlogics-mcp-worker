/**
 * 170-workforce-cost-per-outcome.kernel.mjs
 * OpenChainGraph server-side kernel — Workforce Cost-per-Outcome Ladder (AL-184).
 *
 * Compute ported VERBATIM from repo/tools/170-workforce-cost-per-outcome/index.html
 * (readProgram/ladderFor/calcCostLadder + exportAP2 preimage). _cgDomain-family
 * preimage: the mandate's `inputs`/`summary`/`downstream_handoff_candidates` survive
 * the OCG v0.4 strict-envelope filter (inputs/outputs deletion exemption,
 * AL-EXPORT-ENVELOPE-FIX PR #140) and BOTH policy_parameters.inputs and
 * output_payload point at that same object, exactly as on the page. Reproduces the
 * browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * Kernel input contract is a SLOT-ALIGNED `programs` array: the page reads three DOM
 * slots (Program A/B/C) where B/C are gated on `p1On`/`p2On` checkboxes and then
 * `.filter(Boolean)`-ed, so the exported artifact only ever carries the surviving
 * programs. The kernel takes that surviving set as a plain array (parity fixture is
 * Program-A-only because the parity harness hardcodes `.checked=false`; slot i maps
 * 1:1 to array index in that case). Cost/enrollment-0 programs are dropped exactly
 * like the page's `if (!cost || !enrolled) return null`.
 *
 * GUEST-LEGAL — pure arithmetic only: no Math.pow/log/exp anywhere in the preimage
 * path; no Date/Intl/locale in the preimage (the mandate `generated_at` timestamp is
 * excluded from the §6 preimage by the envelope filter); finite-guarded.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '170-workforce-cost-per-outcome';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-184',
  mcp_name:     'workforce_cost_per_outcome_ladder',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'cost_per_outcome_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

export function compute(inputs = {}) {
  const programsIn = Array.isArray(inputs.programs) ? inputs.programs : [];
  const benchOutcome = num(inputs.benchOutcome) || 7500;  // DOM id `benchOutcome`, page default 7500
  const benchCped    = num(inputs.benchCped)    || 26;    // DOM id `benchCped`, page default 26

  // readProgram: browser coerces with parseFloat(...) || 0 (days: || 180) and falls
  // back on name to the slot letter. `days=0` falls back to 180 on the page too
  // (0 || 180), mirrored here.
  const progs = [];
  for (let i = 0; i < programsIn.length; i++) {
    const p = programsIn[i] || {};
    const name     = (typeof p.name === 'string' && p.name) ? p.name : ('Program ' + String.fromCharCode(65 + i));
    const cost     = num(p.cost);
    const enrolled = num(p.enrolled);
    if (!cost || !enrolled) continue;
    const employed = num(p.employed);
    const retained = num(p.retained);
    const gain     = num(p.gain);
    const days     = num(p.days) || 180;
    progs.push({ name, cost, enrolled, employed, retained, gain, days });
  }

  // ladderFor — verbatim.
  const ladderFor = (p) => {
    const cp  = p.cost / p.enrolled;
    const cee = p.employed > 0 ? p.cost / p.employed : null;
    const cre = p.retained > 0 ? p.cost / p.retained : null;
    const cie = p.gain > 0 ? p.cost / p.gain : null;
    const employedDays = p.retained * p.days;
    const cped = employedDays > 0 ? p.cost / employedDays : null;
    return { cp, cee, cre, cie, cped };
  };

  const rows = progs.map((p) => ({ p, l: ladderFor(p) }));

  // Benchmark flags — same per-program CEE-then-CPED order as the page.
  const flags = [];
  rows.forEach((r) => {
    if (r.l.cee !== null) {
      flags.push({ prog: r.p.name, metric: 'CEE', value: r.l.cee, bench: benchOutcome, over: r.l.cee > benchOutcome });
    }
    if (r.l.cped !== null) {
      flags.push({ prog: r.p.name, metric: 'CPED', value: r.l.cped, bench: benchCped, over: r.l.cped > benchCped });
    }
  });

  const _cgDomain = {
    inputs: {
      programs: progs.map((p) => ({ name: p.name, cost: p.cost, enrolled: p.enrolled, employed: p.employed, retained: p.retained, gain: p.gain, days: p.days })),
      benchmark_outcome_cap: benchOutcome,
      benchmark_cped: benchCped,
    },
    summary: {
      programs: rows.map((r) => ({ name: r.p.name, cp: r.l.cp, cee: r.l.cee, cre: r.l.cre, cie: r.l.cie, cped: r.l.cped })),
      flags,
    },
    downstream_handoff_candidates: ['AL-07', 'AL-113'],
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
      apex_meta: { ap2_mandate_type: 'cost_per_outcome_record', al_id: 'AL-184', tool_name: 'Workforce Cost-per-Outcome Ladder', downstream_handoff_candidates: ['AL-07', 'AL-113'] },
    },
  };
}
