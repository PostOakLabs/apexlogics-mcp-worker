/**
 * kernel-parity.mjs — DIGEST-PARITY GATE (OCG §17/§18 kernel identity).
 *
 * Proves, by REAL execution, that a server-side kernel reproduces the browser
 * tool's §6 execution_hash BYTE-FOR-BYTE. This is the gate where a false-pass would
 * poison every downstream kernel + §18 proof, so it derives its golden from the tool's
 * REAL calculate()+exportAP2() path (extracted from the shipped index.html and run in a
 * sandbox) — NOT from hand-typed numbers — then runs the kernel independently and asserts
 * execution_hash + policy_parameters + output_payload are canonically identical.
 *
 * Usage:
 *   node scripts/kernel-parity.mjs            # verify (exit 0 = parity, non-0 = RED)
 *   node scripts/kernel-parity.mjs --write    # verify + regenerate the repo golden
 *
 * Cross-repo: reads the sibling repo/ (../repo). Local dev gate — CI self-containment
 * is provided separately by the repo-side hash-freeze gate on the regenerated golden.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { getKernel } from '../kernels/index.mjs';
import { cgCanon } from '../kernels/_hash.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = HERE + '../../repo/';

// ─────────────────────────────────────────────────────────────────────────────
// Per-tool parity fixtures. Raw browser FIELD values (element ids), incl. the two
// execution-only fields (w2Withholding, priorYearAGI) that steer the safe-harbor
// quarterly amount but are not in the hash preimage. `kernelInputs` maps the same
// case onto the kernel's input contract.
// ─────────────────────────────────────────────────────────────────────────────
const CASES = [
  {
    tool_id: '40-gig-income-optimizer',
    toolHtml: REPO + 'tools/40-gig-income-optimizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/40-gig-income-optimizer.golden.json',
    // element-id -> value (what the user would type)
    fields: {
      w2Salary: 90000, filingStatus: 'single', stateRate: 5, w2Withholding: 12000,
      gigIncome: 30000, gigExpenses: 4000, gigHourlyRate: 60,
      priorYearTax: 15000, priorYearAGI: 90000,
    },
    kernelInputs: {
      w2_salary: 90000, filing_status: 'single', state_rate_pct: 5,
      gross_gig_income: 30000, business_expenses: 4000, billing_rate_hr: 60,
      prior_year_federal_tax: 15000, w2_withholding: 12000, prior_year_agi: 90000,
    },
    // browser artifact envelope is compute_mode:"browser"; pin generated_at for a
    // reproducible golden file (excluded from the hash preimage anyway).
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
];

// ─── permissive fake DOM so the tool's render() churn runs harmlessly ──────────
function permissiveProxy() {
  const target = function () {};
  const p = new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'length') return 0;
      if (prop === 'value' || prop === 'textContent' || prop === 'innerHTML') return '';
      if (prop === 'checked') return false;
      return p; // any property or method → the same callable permissive proxy
    },
    set() { return true; },
    apply() { return p; },
    has() { return true; },
  });
  return p;
}

function makeDocument(fields) {
  const PERM = permissiveProxy();
  const elFor = (id) => {
    const has = Object.prototype.hasOwnProperty.call(fields, id);
    const val = has ? String(fields[id]) : '';
    const target = function () {};
    return new Proxy(target, {
      get(_t, prop) {
        if (prop === 'value') return val;
        if (prop === 'checked') return false;
        if (prop === Symbol.toPrimitive) return () => val;
        return PERM[prop];
      },
      set() { return true; },
      apply() { return PERM; },
      has() { return true; },
    });
  };
  return {
    getElementById: elFor,
    querySelector: () => PERM,
    querySelectorAll: () => [],
    createElement: () => PERM,
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    body: PERM,
    documentElement: PERM,
    addEventListener: () => {},
    createElementNS: () => PERM,
  };
}

// Extract the <script> block that defines the tool's compute+export path.
function extractComputeScript(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const block = blocks.find((b) => /function\s+exportAP2\b/.test(b) && /function\s+calculate\b/.test(b));
  if (!block) throw new Error('Could not find the calculate()+exportAP2() <script> block in the tool HTML.');
  return block;
}

async function runBrowserArtifact(caseDef) {
  const html = readFileSync(caseDef.toolHtml, 'utf8');
  const script = extractComputeScript(html);

  const sandbox = {
    console,
    Math, JSON, Number, parseFloat, parseInt, isNaN, isFinite, Infinity, NaN, String, Array, Object, Boolean, Date,
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder,
    URLSearchParams,
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
    Blob: function () {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    alert: () => {},
    location: { search: '', href: '', hash: '' },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    navigator: { language: 'en-US', languages: ['en-US'], userAgent: 'node' },
    history: { pushState: () => {}, replaceState: () => {} },
    document: makeDocument(caseDef.fields),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // After the tool's code, reassign dlFile to CAPTURE the artifact JSON instead of
  // triggering a download, then expose an async runner that walks the REAL path:
  // calculate() populates _lastResults, exportAP2() assembles the exact preimage + hash.
  const harness = `
;dlFile = function (_name, content) { globalThis.__captured = content; };
globalThis.__run = async function () {
  calculate();
  await exportAP2();
  return globalThis.__captured;
};
`;
  const context = vm.createContext(sandbox);
  vm.runInContext(script + harness, context, { filename: caseDef.tool_id + '.tool.js' });
  const json = await sandbox.__run();
  if (!json) throw new Error('Browser exportAP2() produced no artifact (validation may have failed).');
  return JSON.parse(json);
}

const canonEq = (a, b) => JSON.stringify(cgCanon(a)) === JSON.stringify(cgCanon(b));

async function verifyCase(caseDef, write) {
  const browser = await runBrowserArtifact(caseDef);
  const kernel = getKernel(caseDef.tool_id);
  if (!kernel) throw new Error(`No kernel registered for ${caseDef.tool_id}`);
  const kArt = await kernel.buildArtifact(caseDef.kernelInputs, { now: caseDef.goldenGeneratedAt });

  const hashEq = browser.execution_hash === kArt.execution_hash;
  const ppEq = canonEq(browser.policy_parameters, kArt.policy_parameters);
  const opEq = canonEq(browser.output_payload, kArt.output_payload);

  console.log(`\n── ${caseDef.tool_id} ──`);
  console.log(`  browser execution_hash : ${browser.execution_hash}`);
  console.log(`  kernel  execution_hash : ${kArt.execution_hash}`);
  console.log(`  execution_hash byte-equal : ${hashEq ? 'PASS' : 'FAIL'}`);
  console.log(`  policy_parameters equal   : ${ppEq ? 'PASS' : 'FAIL'}`);
  console.log(`  output_payload equal      : ${opEq ? 'PASS' : 'FAIL'}`);

  if (!hashEq || !ppEq || !opEq) {
    if (!ppEq) {
      console.log('  browser pp:', JSON.stringify(browser.policy_parameters));
      console.log('  kernel  pp:', JSON.stringify(kArt.policy_parameters));
    }
    if (!opEq) {
      console.log('  browser op:', JSON.stringify(browser.output_payload));
      console.log('  kernel  op:', JSON.stringify(kArt.output_payload));
    }
    return false;
  }

  if (write) {
    // Regenerate the repo golden from the REAL browser artifact (real calc numbers),
    // with generated_at pinned for a reproducible file. hash-freeze recomputes the hash
    // from policy_parameters+output_payload, so the pinned timestamp does not affect it.
    const golden = { ...browser, generated_at: caseDef.goldenGeneratedAt };
    writeFileSync(caseDef.goldenPath, JSON.stringify(golden, null, 2) + '\n');
    console.log(`  ✓ golden regenerated from REAL calc → ${caseDef.goldenPath.replace(REPO, 'repo/')}`);
  }
  return true;
}

const write = process.argv.includes('--write');
let allPass = true;
for (const c of CASES) {
  try {
    const ok = await verifyCase(c, write);
    allPass = allPass && ok;
  } catch (e) {
    console.error(`\n✗ ${c.tool_id}: ${e.stack || e.message}`);
    allPass = false;
  }
}
console.log(`\n${allPass ? '✓ KERNEL-PARITY: all cases byte-exact (browser calc == kernel).' : '✗ KERNEL-PARITY: FAILED — do not commit.'}`);
process.exit(allPass ? 0 : 1);
