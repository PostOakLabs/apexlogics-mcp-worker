/**
 * 173-parallel-trends-placebo-checker.kernel.mjs
 * OpenChainGraph server-side kernel — Parallel-Trends & Placebo Checker (AL-187).
 *
 * Compute ported VERBATIM from repo/tools/173-parallel-trends-placebo-checker/index.html
 * (Tab-1 runTrends() over the top-level loadExample() panel state + the shared numeric
 * core logGamma/betacf/regIncompleteBeta/tTwoSidedP/transpose/matMul/matInv/ols +
 * exportAP2 preimage). _cgDomain-family preimage: `inputs`/`summary`/
 * `downstream_handoff_candidates` survive the OCG v0.4 strict-envelope filter
 * (inputs/outputs deletion exemption, AL-EXPORT-ENVELOPE-FIX PR #140) and BOTH
 * policy_parameters.inputs and output_payload point at that same object. Reproduces
 * the browser §6 execution_hash byte-for-byte; kernel-parity.mjs proves it.
 *
 * The page path is calcFn 'runTrends' (not calculate): the preimage is the Tab-1
 * pre-trend fit (gap/se/t/p over the pre-treatment window) plus the FULL panel state
 * in inputs.periods. The other three tabs (event/placebo/twobytwo) only enter the
 * preimage via lastResult fields that stay null unless their run buttons fire — the
 * parity harness (and this kernel's contract, mirroring the page's reachable
 * loadExample() state) always has them null.
 *
 * Kernel input contract mirrors the page's top-level state: `rows`
 * [{label, treat, control} × N], `treatmentStartLabel` (label of the first
 * post-treatment row; null/absent = no post rows, all rows pre — matching
 * treatmentStartId=null semantics), optional treatLabel/controlLabel (display-only,
 * never in the preimage). Fewer than three pre-treatment rows throws (the page
 * alerts and never produces an artifact) → run_chain reports input_required.
 *
 * NOT YET GUEST-LEGAL — Math.log/Math.exp TIER (kernel-22 precedent): the p-value
 * path (logGamma → betacf/regIncompleteBeta → tTwoSidedP) uses Math.log/Math.exp
 * same-expression-as-browser; a _detmath import would violate the kernels'
 * _hash.mjs-only import fence. Byte-exact under kernel-parity.mjs (both sides
 * execute in the same Node/V8 process) but not proven bit-identical against a
 * Workers/zkVM-guest libm. Flag for a future _detmath pass alongside the 120-style
 * browser patch if this kernel is ever routed to §18 proving.
 */
import { executionHash } from './_hash.mjs';

const TOOL_ID      = '173-parallel-trends-placebo-checker';
const TOOL_VERSION = '1.0.0';

export const meta = {
  tool_id:      TOOL_ID,
  tool_version: TOOL_VERSION,
  al_id:        'AL-187',
  mcp_name:     'parallel_trends_placebo_checker',
  mandate_type: 'org.apexlogics/career_mobility',
  ap2_mandate_type: 'parallel_trends_record',
  gpu:          false,
};

const num = (v) => { const x = +v; return Number.isFinite(x) ? x : 0; };

/* ── NUMERIC CORE — ported verbatim from the page (pure JS + Math.log/exp) ── */

function logGamma(x) {
  const g = 7;
  const c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(x, a, b) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
  return 1 - bt * betacf(1 - x, b, a) / b;
}

// Two-sided p-value for a t-statistic on `df` degrees of freedom, via the
// regularized incomplete beta function (Numerical Recipes betacf/betai form).
function tTwoSidedP(t, df) {
  if (!isFinite(t) || df <= 0) return NaN;
  const at = Math.abs(t);
  const x = df / (df + at * at);
  const ib = regIncompleteBeta(x, df / 2, 0.5);
  return ib; // this equals the two-sided tail probability directly
}

function transpose(M) { return M[0].map((_, j) => M.map(row => row[j])); }

function matMul(A, B) {
  const out = [];
  for (let i = 0; i < A.length; i++) {
    const row = [];
    for (let j = 0; j < B[0].length; j++) {
      let s = 0;
      for (let k = 0; k < B.length; k++) s += A[i][k] * B[k][j];
      row.push(s);
    }
    out.push(row);
  }
  return out;
}

function matInv(M) {
  const n = M.length;
  const A = M.map((row, i) => row.concat(row.map((_, j) => (i === j ? 1 : 0))));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const pv = A[col][col] || 1e-12;
    for (let j = 0; j < 2 * n; j++) A[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map(row => row.slice(n));
}

// Closed-form ordinary least squares via normal equations: beta = (X'X)^-1 X'y.
function ols(X, y) {
  const n = X.length, k = X[0].length;
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtXinv = matInv(XtX);
  const Xty = matMul(Xt, y.map(v => [v]));
  const beta = matMul(XtXinv, Xty).map(r => r[0]);
  const fitted = X.map(row => row.reduce((s, v, i) => s + v * beta[i], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const SSE = resid.reduce((s, e) => s + e * e, 0);
  const df = n - k;
  const sigma2 = df > 0 ? SSE / df : NaN;
  const se = beta.map((_, j) => Math.sqrt(Math.max(sigma2 * XtXinv[j][j], 0)));
  const tstat = beta.map((b, j) => (se[j] > 0 ? b / se[j] : NaN));
  const pval = tstat.map(t => (df > 0 && isFinite(t) ? tTwoSidedP(t, df) : NaN));
  return { beta, se, tstat, pval, df, n, k };
}

export function compute(inputs = {}) {
  const rows = (Array.isArray(inputs.rows) ? inputs.rows : [])
    .map((r) => ({ label: r && r.label, treat: num(r && r.treat), control: num(r && r.control) }));
  const startLabel = typeof inputs.treatmentStartLabel === 'string' && inputs.treatmentStartLabel
    ? inputs.treatmentStartLabel : null;

  // treatmentStartId semantics, verbatim: null → all rows pre; found → slice at it;
  // not found → all rows pre and treatment_start_label null.
  const startIdx = startLabel ? rows.findIndex((r) => r.label === startLabel) : -1;
  const pre = startIdx === -1 ? rows.slice() : rows.slice(0, startIdx);

  // runTrends entry guard — the page alerts and never produces an artifact.
  if (pre.length < 3) throw new Error('Enter at least three pre-treatment periods before running the pre-trend test.');

  const X = [], y = [];
  pre.forEach((r, i) => {
    X.push([1, i, 1, i]); y.push(r.treat);
    X.push([1, i, 0, 0]); y.push(r.control);
  });
  const fit = ols(X, y);
  const controlSlope = fit.beta[1];
  const treatSlope = fit.beta[1] + fit.beta[3];
  const gap = fit.beta[3], gapSE = fit.se[3], gapT = fit.tstat[3], gapP = fit.pval[3];
  const flagged = isFinite(gapP) && gapP < 0.05;

  const startRow = startIdx === -1 ? null : rows[startIdx];
  const _cgDomain = {
    inputs: {
      periods: rows.map((p) => ({ label: p.label, treatment_outcome: p.treat, control_outcome: p.control })),
      treatment_start_label: startRow ? startRow.label : null,
      placebo_period_label: null,
      twobytwo_inputs: null,
    },
    summary: {
      pretrend_gap: gap,
      pretrend_gap_se: gapSE,
      pretrend_gap_t: gapT,
      pretrend_gap_p: gapP,
      pretrend_gap_flagged: flagged,
      event_coefficients: null,
      placebo_did: null,
      placebo_p: null,
      placebo_flagged: null,
      twobytwo_did: null,
    },
    downstream_handoff_candidates: ['81-survey-study-designer', '15-workforce-board-roi-report'],
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
      apex_meta: { ap2_mandate_type: 'parallel_trends_record', al_id: 'AL-187', tool_name: 'Parallel-Trends & Placebo Checker', downstream_handoff_candidates: ['81-survey-study-designer', '15-workforce-board-roi-report'] },
    },
  };
}
