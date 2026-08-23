// gate-mcp-era.mjs — offline gate for the SEP-2243 header rules and the 2026-07-28 era-gated
// request rules (AL-MCP-728-B).
//
// scripts/smoke-mcp.mjs proves these against a DEPLOYED endpoint; this gate proves the same rules
// in CI BEFORE anything deploys, by invoking the Worker's fetch handler directly against the
// committed ./data fixtures. A rule that only a post-deploy smoke can catch is a rule that reaches
// production before it is checked, and /mcp is the outage-class surface.
//
// The pairing is the point. Every modern-era rejection below has a LEGACY CONTROL asserting an old
// client still gets 200 for the same shape. Backwards compatibility is a hard requirement, so a
// change that strands old clients fails HERE, not in the field.
//
// Shape deliberately mirrors the sister compute worker's scripts/gate-mcp-era.mjs — one lineage,
// never a fork (SO 12).
//
// Self-test: `node scripts/gate-mcp-era.mjs --self-test` re-runs the suite against a mutated
// worker in which SEP-2243 validation is disabled, and FAILS if the suite stays green. A gate that
// has never failed is not known to work.
//
// Usage: node scripts/gate-mcp-era.mjs [--self-test]
// Exit 0 = conformant; exit 1 = a rule regressed.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const MODERN = '2026-07-28';
const LEGACY = '2025-06-18';
const URL_MCP = 'https://mcp.apexlogics.org/mcp';
const ACCEPT = 'application/json, text/event-stream';

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': MODERN,
  'io.modelcontextprotocol/clientCapabilities': {},
};

// Minimal env/ctx. ANALYTICS is optional in worker.mjs (guarded), so an empty env is the
// no-telemetry path; waitUntil is a no-op because nothing here awaits a background task.
const ENV = {};
const CTX = { waitUntil() {} };

let failures = 0;
let checks = 0;
function check(label, cond, detail) {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

// ── request helpers ──────────────────────────────────────────────────────────

function makeCaller(worker) {
  const post = (headers, body) =>
    worker.fetch(
      new Request(URL_MCP, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: ACCEPT, ...headers },
        body: JSON.stringify(body),
      }),
      ENV,
      CTX,
    );
  const verb = (method) => worker.fetch(new Request(URL_MCP, { method }), ENV, CTX);
  return { post, verb };
}

// The worker answers either plain JSON or SSE framing depending on the path taken.
async function readJson(res) {
  const text = await res.text();
  if (text.startsWith('event:')) {
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    if (line) return JSON.parse(line.slice(6));
  }
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text.slice(0, 200) };
  }
}

// ── the suite ────────────────────────────────────────────────────────────────

async function runSuite(worker) {
  const { post, verb } = makeCaller(worker);
  const errCode = async (res) => (await readJson(res))?.error?.code;

  // (1) LEGACY CONTROL — a bare, header-less, _meta-less request still works. This is the
  //     outage guard: it goes red the moment validation starts rejecting on ABSENCE for
  //     everyone rather than for modern-era clients only.
  {
    const res = await post({}, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const obj = await readJson(res);
    check('legacy bare tools/list is 200', res.status === 200, `got ${res.status}`);
    check('legacy bare tools/list returns tools', (obj?.result?.tools?.length ?? 0) > 0);
    check('legacy bare tools/list stamps resultType', obj?.result?.resultType === 'complete',
      `got ${obj?.result?.resultType}`);
  }

  // (2) SEP-2243 presence — each of the three headers, omitted IN TURN on a modern-era
  //     request, is 400 + -32020. Mcp-Name is required only on the name-carrying methods,
  //     so it is exercised through tools/call.
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: MODERN_META } },
    );
    check('modern request missing Mcp-Method is 400', res.status === 400, `got ${res.status}`);
    check('modern request missing Mcp-Method is -32020', (await errCode(res)) === -32020);
  }
  {
    // MCP-Protocol-Version omitted but _meta still asserts the modern era.
    const res = await post(
      { 'mcp-method': 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: MODERN_META } },
    );
    check('modern request missing MCP-Protocol-Version is 400', res.status === 400, `got ${res.status}`);
    check('modern request missing MCP-Protocol-Version is -32020', (await errCode(res)) === -32020);
  }
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/call' },
      {
        jsonrpc: '2.0', id: 4, method: 'tools/call',
        params: { name: 'find_tool', arguments: { query: 'pension' }, _meta: MODERN_META },
      },
    );
    check('modern tools/call missing Mcp-Name is 400', res.status === 400, `got ${res.status}`);
    check('modern tools/call missing Mcp-Name is -32020', (await errCode(res)) === -32020);
  }

  // (2b) LEGACY CONTROL for the same three omissions — no era assertion, so absence is fine.
  {
    const res = await post(
      {},
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'find_tool', arguments: { query: 'pension' } } },
    );
    const obj = await readJson(res);
    check('legacy tools/call without SEP-2243 headers is 200', res.status === 200, `got ${res.status}`);
    check('legacy tools/call without SEP-2243 headers succeeds', !obj?.error && !obj?.result?.isError);
  }

  // (3) SEP-2243 mismatch — header disagrees with body. Applies in BOTH eras: a header that is
  //     sent must be true, whatever era the client is in.
  {
    const res = await post(
      { 'mcp-method': 'prompts/get' },
      { jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} },
    );
    check('legacy Mcp-Method mismatch is 400', res.status === 400, `got ${res.status}`);
    check('legacy Mcp-Method mismatch is -32020', (await errCode(res)) === -32020);
  }
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/call', 'mcp-name': 'find_chain' },
      {
        jsonrpc: '2.0', id: 7, method: 'tools/call',
        params: { name: 'find_tool', arguments: { query: 'x' }, _meta: MODERN_META },
      },
    );
    check('Mcp-Name mismatch is 400', res.status === 400, `got ${res.status}`);
    check('Mcp-Name mismatch is -32020', (await errCode(res)) === -32020);
  }
  {
    // Header values are CASE-SENSITIVE. Header names are not, and are covered implicitly:
    // every lookup above uses lower-case names against mixed-case sends.
    const res = await post(
      { 'MCP-Method': 'TOOLS/LIST' },
      { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} },
    );
    check('Mcp-Method value case difference is rejected', res.status === 400, `got ${res.status}`);
    check('Mcp-Method value case difference is -32020', (await errCode(res)) === -32020);
  }

  // (4) `=?base64?<b64>?=` sentinel — decoded BEFORE comparison, both directions.
  {
    const encoded = '=?base64?' + Buffer.from('find_tool', 'utf8').toString('base64') + '?=';
    const res = await post(
      { 'mcp-method': 'tools/call', 'mcp-name': encoded },
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'find_tool', arguments: { query: 'pension' } } },
    );
    const obj = await readJson(res);
    check('base64-sentinel Mcp-Name decodes and matches', res.status === 200, `got ${res.status}`);
    check('base64-sentinel Mcp-Name call succeeds', !obj?.error, JSON.stringify(obj?.error ?? '').slice(0, 120));
  }
  {
    const encoded = '=?base64?' + Buffer.from('find_chain', 'utf8').toString('base64') + '?=';
    const res = await post(
      { 'mcp-method': 'tools/call', 'mcp-name': encoded },
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'find_tool', arguments: { query: 'x' } } },
    );
    check('base64-sentinel mismatch still rejected', res.status === 400, `got ${res.status}`);
    check('base64-sentinel mismatch is -32020', (await errCode(res)) === -32020);
  }
  {
    // Invalid characters: a sentinel whose payload is not decodable UTF-8 Base64.
    const res = await post(
      { 'mcp-method': '=?base64?!!!not-base64!!!?=' },
      { jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} },
    );
    check('undecodable base64 sentinel is 400', res.status === 400, `got ${res.status}`);
    check('undecodable base64 sentinel is -32020', (await errCode(res)) === -32020);
  }

  // (5) Version negotiation through the HEADER routes to the SAME -32022 path `initialize`
  //     already used. This is AL-MCP-728-B carried item (2): before this row, an unsupported
  //     version on the header returned a normal 200 tools list.
  {
    const res = await post(
      { 'mcp-protocol-version': '1999-01-01', 'mcp-method': 'tools/list' },
      { jsonrpc: '2.0', id: 12, method: 'tools/list', params: {} },
    );
    const obj = await readJson(res);
    check('unsupported version HEADER is 400', res.status === 400, `got ${res.status}`);
    check('unsupported version HEADER is -32022', obj?.error?.code === -32022, `got ${obj?.error?.code}`);
    check('unsupported version HEADER carries data.supported',
      Array.isArray(obj?.error?.data?.supported) && obj.error.data.supported.includes(MODERN));
    check('unsupported version HEADER carries data.requested', obj?.error?.data?.requested === '1999-01-01');
    check('unsupported version HEADER preserves the request id', obj?.id === 12, `got ${obj?.id}`);
  }
  {
    // The initialize path (owned by AL-MCP-728-A) must be unchanged.
    const res = await post(
      {},
      {
        jsonrpc: '2.0', id: 13, method: 'initialize',
        params: { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 'gate', version: '1' } },
      },
    );
    const obj = await readJson(res);
    check('unsupported version via initialize is 400', res.status === 400, `got ${res.status}`);
    check('unsupported version via initialize is -32022', obj?.error?.code === -32022);
  }

  // (6) Per-request `_meta` (carried item (1)) — both keys required on modern-era requests,
  //     -32602 + 400 when one is missing, with a legacy control on the same shape.
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
      { jsonrpc: '2.0', id: 14, method: 'tools/list', params: {} },
    );
    const obj = await readJson(res);
    check('modern request with no _meta is 400', res.status === 400, `got ${res.status}`);
    check('modern request with no _meta is -32602', obj?.error?.code === -32602, `got ${obj?.error?.code}`);
    check('modern _meta rejection lists both missing fields',
      (obj?.error?.data?.missingFields?.length ?? 0) === 2);
  }
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
      {
        jsonrpc: '2.0', id: 15, method: 'tools/list',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN } },
      },
    );
    const obj = await readJson(res);
    check('modern request missing clientCapabilities is -32602', obj?.error?.code === -32602);
    check('missing clientCapabilities is named in data.missingFields',
      obj?.error?.data?.missingFields?.[0] === 'io.modelcontextprotocol/clientCapabilities');
  }
  {
    const res = await post({}, { jsonrpc: '2.0', id: 16, method: 'tools/list', params: {} });
    check('LEGACY control: no _meta is still 200', res.status === 200, `got ${res.status}`);
  }

  // (7) Fully conformant modern request — the positive control for everything above, plus a
  //     REAL tools/call (never tools/list alone, SO 9).
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
      { jsonrpc: '2.0', id: 17, method: 'tools/list', params: { _meta: MODERN_META } },
    );
    const obj = await readJson(res);
    check('conformant modern tools/list is 200', res.status === 200, `got ${res.status}`);
    check('conformant modern tools/list returns six tools', obj?.result?.tools?.length === 6,
      `got ${obj?.result?.tools?.length}`);
    check('conformant modern tools/list stamps resultType', obj?.result?.resultType === 'complete');
  }
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/call', 'mcp-name': 'find_tool' },
      {
        jsonrpc: '2.0', id: 18, method: 'tools/call',
        params: { name: 'find_tool', arguments: { query: 'teacher pension' }, _meta: MODERN_META },
      },
    );
    const obj = await readJson(res);
    check('conformant modern tools/call is 200', res.status === 200, `got ${res.status}`);
    check('conformant modern tools/call returns a result', !!obj?.result && !obj?.error);
    check('conformant modern tools/call is not an isError result', obj?.result?.isError !== true);
  }

  // (8) Error shapes owned by AL-MCP-728-A, asserted here so this gate is a full wire contract
  //     and a regression in either row's lane goes red in the same place.
  {
    const res = await post(
      { 'mcp-method': 'tools/call', 'mcp-name': 'definitely_not_a_real_tool' },
      { jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'definitely_not_a_real_tool', arguments: {} } },
    );
    const obj = await readJson(res);
    check('unknown tool is a JSON-RPC error object, not a tool result', !!obj?.error);
    check('unknown tool is -32602', obj?.error?.code === -32602, `got ${obj?.error?.code}`);
    check('unknown tool never emits the retired -32002', obj?.error?.code !== -32002);
  }
  {
    const res = await post(
      { 'mcp-method': 'no/such/method' },
      { jsonrpc: '2.0', id: 20, method: 'no/such/method', params: {} },
    );
    check('unknown method is 404', res.status === 404, `got ${res.status}`);
    check('unknown method is -32601', (await errCode(res)) === -32601);
  }
  {
    const res = await post(
      { 'mcp-protocol-version': MODERN, 'mcp-method': 'server/discover' },
      { jsonrpc: '2.0', id: 21, method: 'server/discover', params: { _meta: MODERN_META } },
    );
    const obj = await readJson(res);
    check('server/discover is 200', res.status === 200, `got ${res.status}`);
    check('server/discover lists both supported versions',
      obj?.result?.supportedVersions?.includes(MODERN) && obj?.result?.supportedVersions?.includes(LEGACY));
    check('server/discover stamps resultType', obj?.result?.resultType === 'complete');
  }

  // (9) SEP-2567 stateless hygiene — GET and DELETE on /mcp are 405.
  {
    const g = await verb('GET');
    const d = await verb('DELETE');
    check('GET /mcp is 405', g.status === 405, `got ${g.status}`);
    check('DELETE /mcp is 405', d.status === 405, `got ${d.status}`);
  }

  // (10) CORS must advertise all three routing headers, or a browser client cannot send them.
  {
    const res = await worker.fetch(new Request(URL_MCP, { method: 'OPTIONS' }), ENV, CTX);
    const allow = res.headers.get('access-control-allow-headers') ?? '';
    for (const h of ['MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name']) {
      check(`CORS Allow-Headers advertises ${h}`, allow.toLowerCase().includes(h.toLowerCase()), allow);
    }
  }

  return { checks, failures };
}

// ── self-test ────────────────────────────────────────────────────────────────
// Copies the worker into a temp tree, neuters validateMcpHeaders so it always returns null
// (SEP-2243 validation off), and re-runs the suite. If the mutated worker still passes, the
// suite is not actually asserting anything and this script exits 1.

async function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'al-mcp-728b-'));
  try {
    for (const f of ['worker.mjs', '_hash.mjs', 'pilot.mjs', 'run_chain.mjs', 'package.json']) {
      cpSync(join(ROOT, f), join(dir, f));
    }
    cpSync(join(ROOT, 'data'), join(dir, 'data'), { recursive: true });
    cpSync(join(ROOT, 'kernels'), join(dir, 'kernels'), { recursive: true });
    cpSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), { recursive: true });

    const src = readFileSync(join(dir, 'worker.mjs'), 'utf8');
    const needle = 'function validateMcpHeaders(request, body, modernEra) {';
    if (!src.includes(needle)) throw new Error('self-test could not find validateMcpHeaders to mutate');
    const mutated = src.replace(needle, needle + '\n  return null; // SELF-TEST MUTATION');
    writeFileSync(join(dir, 'worker.mjs'), mutated);

    const worker = (await import(pathToFileURL(join(dir, 'worker.mjs')).href)).default;
    // Reset the shared counters so the mutated run is measured on its own.
    checks = 0;
    failures = 0;
    const savedError = console.error;
    console.error = () => {}; // the mutated run is EXPECTED to be noisy
    const r = await runSuite(worker);
    console.error = savedError;
    return r;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const wantSelfTest = process.argv.includes('--self-test');

const worker = (await import(pathToFileURL(join(ROOT, 'worker.mjs')).href)).default;
console.log('SEP-2243 + 2026-07-28 era gate — offline, against ./data fixtures');
const real = await runSuite(worker);

if (real.failures > 0) {
  console.error(`\n✗ gate FAILED — ${real.failures} of ${real.checks} checks red`);
  process.exit(1);
}
console.log(`✓ ${real.checks} checks green (SEP-2243 headers, era gating, _meta, error shapes, CORS, 405s)`);

if (wantSelfTest) {
  console.log('\nself-test: re-running the suite with SEP-2243 validation disabled…');
  const mutated = await selfTest();
  if (mutated.failures === 0) {
    console.error('✗ self-test FAILED — the suite stayed green with header validation disabled.');
    console.error('  The gate is not asserting what it claims to assert.');
    process.exit(1);
  }
  console.log(`✓ self-test OK — ${mutated.failures} of ${mutated.checks} checks went red without header validation`);
}
