// smoke-mcp.mjs — post-deploy wire smoke against the LIVE /mcp endpoint (AL-MCP-728-B).
//
// scripts/gate-mcp-era.mjs asserts the same rules OFFLINE in pre-flight, by calling the Worker's
// fetch handler directly. This script is the other half: it proves the rules survive the things
// only a real request can exercise — the Cloudflare edge, the WAF, the custom-domain route, and
// the deployed bundle rather than the checked-out source.
//
// The WAF is the reason the header assertions are here and not only in the offline gate. A WAF
// rule that strips or blocks Mcp-Method / Mcp-Name turns every modern client into a 400 while the
// worker source stays perfectly conformant. Round-tripping the headers through a live request is
// the only check that can see that.
//
// Every assertion that rejects a modern-era request is PAIRED with a legacy control asserting an
// old client still gets 200 for the same shape. A fix that strands legacy clients must fail here.
//
// AL-SMOKE-PIN: the assertions below run EXACTLY ONCE, never retried. What retries is
// the build pin ahead of them — polling /healthz's `deployed_version` (Cloudflare
// Version Metadata) until it matches the id `wrangler deploy` just produced. That
// separates "the new build isn't live everywhere yet" (pin keeps polling, then a clear
// propagation message) from "the new build is live and broken" (single assertion pass,
// real failure). Before this split, a partially-rolled-out edge could pass on attempt 4
// of 6 with no way to tell whether that was the new build behaving or the old build
// getting lucky on a request shape it happened to satisfy.
//
// Usage:  node scripts/smoke-mcp.mjs [url]
//   url default: https://mcp.apexlogics.org/mcp (or env MCP_SMOKE_URL)
//   env: MCP_SMOKE_VERSION_ID   — build id to pin to (CI sets this from `wrangler deploy`
//          output; omit for a local/manual run against whatever build currently answers)
//        MCP_SMOKE_PIN_RETRIES (6), MCP_SMOKE_PIN_DELAY_MS (4000) — pin poll budget
//        MCP_SMOKE_TIMEOUT_MS (15000) — per-request timeout, pin and assertions alike
// Exit 0 = healthy; exit 1 = broken, or the new build never became authoritative.

const URL_MCP = process.argv[2] || process.env.MCP_SMOKE_URL || 'https://mcp.apexlogics.org/mcp';
const RETRIES = Number(process.env.MCP_SMOKE_RETRIES ?? 6);
const DELAY = Number(process.env.MCP_SMOKE_DELAY_MS ?? 4000);
const TIMEOUT = Number(process.env.MCP_SMOKE_TIMEOUT_MS ?? 15000);

const MODERN = '2026-07-28';
const LEGACY = '2025-06-18';
const SUPPORTED = [MODERN, LEGACY];
const ACCEPT = 'application/json, text/event-stream';
const EXPECTED_TOOLS = 6;

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': MODERN,
  'io.modelcontextprotocol/clientCapabilities': {},
};

function post(headers, body) {
  return fetch(URL_MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: ACCEPT, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

async function readJson(res, label) {
  const text = await res.text();
  if (text.startsWith('event:')) {
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    if (line) return JSON.parse(line.slice(6));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: non-JSON body: ${text.slice(0, 200)}`);
  }
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

// SEP-2243 routing headers for a well-formed MODERN request.
function modernHeaders(method, params) {
  const h = { 'mcp-protocol-version': MODERN, 'mcp-method': method };
  const name =
    method === 'tools/call' || method === 'prompts/get' ? params?.name
      : method === 'resources/read' ? params?.uri
        : undefined;
  if (name !== undefined) h['mcp-name'] = String(name);
  return h;
}

async function modernCall(id, method, params) {
  const res = await post(modernHeaders(method, params), {
    jsonrpc: '2.0', id, method, params: { ...params, _meta: MODERN_META },
  });
  const obj = await readJson(res, method);
  return { status: res.status, obj };
}

// ── (1) Legacy path — the outage guard ───────────────────────────────────────
// A bare, header-less, _meta-less request is what every client in the field sends today.
// If this ever stops returning 200 + tools, the endpoint is down for all of them.
async function legacyPath() {
  const res = await post({}, { jsonrpc: '2.0', id: 101, method: 'tools/list', params: {} });
  must(res.status === 200, `legacy bare tools/list returned HTTP ${res.status}, expected 200 — legacy clients stranded`);
  const obj = await readJson(res, 'legacy tools/list');
  const n = obj?.result?.tools?.length ?? 0;
  must(n > 0, 'legacy bare tools/list returned no tools');

  const call = await post({}, {
    jsonrpc: '2.0', id: 102, method: 'tools/call',
    params: { name: 'find_tool', arguments: { query: 'teacher pension' } },
  });
  must(call.status === 200, `legacy tools/call returned HTTP ${call.status}, expected 200`);
  const callObj = await readJson(call, 'legacy tools/call');
  must(!callObj?.error, `legacy tools/call error ${callObj?.error?.code}: ${callObj?.error?.message}`);
  must(callObj?.result?.isError !== true, 'legacy tools/call returned an isError result');
  return { tools: n };
}

// ── (2) Legacy initialize handshake ──────────────────────────────────────────
async function legacyInitialize() {
  const res = await post({}, {
    jsonrpc: '2.0', id: 103, method: 'initialize',
    params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'ci-smoke', version: '1' } },
  });
  must(res.status === 200, `legacy initialize returned HTTP ${res.status}, expected 200`);
  const obj = await readJson(res, 'initialize');
  must(!obj?.error, `initialize JSON-RPC error ${obj?.error?.code}: ${obj?.error?.message}`);
  const info = obj?.result?.serverInfo;
  must(info && info.name, 'unexpected initialize result — no serverInfo');
  return info;
}

// ── (3) Modern path, no initialize ───────────────────────────────────────────
// SEP-2575 removed the handshake: a 2026-07-28 client opens straight into tools/list.
// This is also the LIVE proof that the WAF forwards all three routing headers, since the
// request would 400 with -32020 if any of them were stripped in flight.
async function modernPath() {
  const list = await modernCall(201, 'tools/list', {});
  must(list.status === 200, `modern tools/list returned HTTP ${list.status}, expected 200 — a WAF stripping a routing header looks exactly like this`);
  must(!list.obj?.error, `modern tools/list error ${list.obj?.error?.code}: ${list.obj?.error?.message}`);
  const tools = list.obj?.result?.tools ?? [];
  must(tools.length === EXPECTED_TOOLS, `modern tools/list returned ${tools.length} tools, expected ${EXPECTED_TOOLS}`);
  must(list.obj?.result?.resultType === 'complete', `modern tools/list resultType is "${list.obj?.result?.resultType}", expected "complete"`);

  // A REAL tools/call, never tools/list alone (SO 9).
  const call = await modernCall(202, 'tools/call', { name: 'find_tool', arguments: { query: 'teacher pension' } });
  must(call.status === 200, `modern tools/call returned HTTP ${call.status}, expected 200`);
  must(!call.obj?.error, `modern tools/call error ${call.obj?.error?.code}: ${call.obj?.error?.message}`);
  must(call.obj?.result?.isError !== true, 'modern tools/call returned an isError result');
  must(call.obj?.result?.resultType === 'complete', 'modern tools/call did not stamp resultType');

  const disc = await modernCall(203, 'server/discover', {});
  must(disc.status === 200, `server/discover returned HTTP ${disc.status}, expected 200`);
  const sv = disc.obj?.result?.supportedVersions ?? [];
  must(sv.includes(MODERN) && sv.includes(LEGACY), `server/discover supportedVersions is ${JSON.stringify(sv)}`);
  return { tools: tools.length, supported: sv.length };
}

// ── (4) SEP-2243 rejections — the three failure modes, one code ──────────────
async function sep2243Rejections() {
  const assert400 = async (res, code, label) => {
    const text = await res.clone().text();
    must(res.status === 400, `${label} returned HTTP ${res.status}, expected 400: ${text.slice(0, 200)}`);
    const obj = await readJson(res, label);
    must(obj?.error?.code === code, `${label} returned code ${obj?.error?.code}, expected ${code}`);
    return obj;
  };

  // (a) MISSING — each of the three, omitted in turn on a modern-era request.
  await assert400(
    await post({ 'mcp-protocol-version': MODERN },
      { jsonrpc: '2.0', id: 301, method: 'tools/list', params: { _meta: MODERN_META } }),
    -32020, 'modern request missing Mcp-Method');

  await assert400(
    await post({ 'mcp-method': 'tools/list' },
      { jsonrpc: '2.0', id: 302, method: 'tools/list', params: { _meta: MODERN_META } }),
    -32020, 'modern request missing MCP-Protocol-Version');

  await assert400(
    await post({ 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/call' },
      { jsonrpc: '2.0', id: 303, method: 'tools/call',
        params: { name: 'find_tool', arguments: { query: 'x' }, _meta: MODERN_META } }),
    -32020, 'modern tools/call missing Mcp-Name');

  // (b) MISMATCHED — a header that is sent must be true, in either era.
  await assert400(
    await post({ 'mcp-method': 'prompts/get' },
      { jsonrpc: '2.0', id: 304, method: 'tools/list', params: {} }),
    -32020, 'Mcp-Method header/body mismatch');

  // Header VALUES are case-sensitive (names are not — every send here is mixed-case).
  await assert400(
    await post({ 'MCP-Method': 'TOOLS/LIST' },
      { jsonrpc: '2.0', id: 305, method: 'tools/list', params: {} }),
    -32020, 'Mcp-Method value case mismatch');

  // (c) INVALID CHARACTERS — an undecodable base64 sentinel.
  await assert400(
    await post({ 'mcp-method': '=?base64?!!!not-base64!!!?=' },
      { jsonrpc: '2.0', id: 306, method: 'tools/list', params: {} }),
    -32020, 'undecodable base64 sentinel');

  // (d) The sentinel decodes and compares correctly when it is well-formed.
  const encoded = '=?base64?' + Buffer.from('find_tool', 'utf8').toString('base64') + '?=';
  const ok = await post({ 'mcp-method': 'tools/call', 'mcp-name': encoded },
    { jsonrpc: '2.0', id: 307, method: 'tools/call', params: { name: 'find_tool', arguments: { query: 'pension' } } });
  must(ok.status === 200, `base64-sentinel Mcp-Name returned HTTP ${ok.status}, expected 200 (decode-before-compare regression)`);
  const okObj = await readJson(ok, 'base64-sentinel tools/call');
  must(!okObj?.error, `base64-sentinel tools/call error ${okObj?.error?.code}: ${okObj?.error?.message}`);

  const bad = '=?base64?' + Buffer.from('find_chain', 'utf8').toString('base64') + '?=';
  await assert400(
    await post({ 'mcp-method': 'tools/call', 'mcp-name': bad },
      { jsonrpc: '2.0', id: 308, method: 'tools/call', params: { name: 'find_tool', arguments: { query: 'x' } } }),
    -32020, 'base64-sentinel Mcp-Name mismatch');

  return { code: -32020 };
}

// ── (5) Version negotiation, header path (carried item (2)) ──────────────────
// Before this row an unsupported version on the HEADER returned a normal 200 tools list while
// the same version through initialize correctly 400'd. Both regimes are asserted.
async function versionRejection() {
  const bad = '1999-01-01';
  const assertRejected = async (res, id, label) => {
    const text = await res.clone().text();
    must(res.status === 400, `${label} returned HTTP ${res.status}, expected 400: ${text.slice(0, 200)}`);
    const obj = await readJson(res, label);
    must(obj?.error?.code === -32022, `${label} returned code ${obj?.error?.code}, expected -32022`);
    must(obj?.id === id, `${label} lost the request id (got ${obj?.id}, expected ${id})`);
    must(Array.isArray(obj?.error?.data?.supported) && obj.error.data.supported.includes(MODERN),
      `${label} missing error.data.supported`);
    must(obj?.error?.data?.requested === bad, `${label} missing or wrong error.data.requested`);
  };

  await assertRejected(
    await post({ 'mcp-protocol-version': bad, 'mcp-method': 'tools/list' },
      { jsonrpc: '2.0', id: 401, method: 'tools/list', params: {} }),
    401, 'unsupported version via HEADER');

  // AL-MCP-NEGOTIATE: `initialize` is a PROPOSAL, not an assertion. A version the
  // server does not implement must come back 200 carrying a version the client can
  // act on -- never a 400. This suite previously only ever proposed versions the
  // server liked, so the regression that 400'd every 2024-11-05 and 2025-03-26
  // client shipped green. These assertions are the reason it cannot happen twice.
  let negotiatedId = 402;
  const assertNegotiated = async (proposed, expected) => {
    const id = negotiatedId++;
    const res = await post({}, { jsonrpc: '2.0', id, method: 'initialize',
      params: { protocolVersion: proposed, capabilities: {}, clientInfo: { name: 'ci-smoke', version: '1' } } });
    const text = await res.clone().text();
    must(res.status === 200,
      `initialize at ${proposed} returned HTTP ${res.status}, expected 200: ${text.slice(0, 200)}`);
    const obj = await readJson(res, `initialize ${proposed}`);
    must(!obj?.error,
      `initialize at ${proposed} errored ${obj?.error?.code}: ${obj?.error?.message}`);
    const got = obj?.result?.protocolVersion;
    must(got === expected,
      `initialize at ${proposed} answered protocolVersion ${got}, expected ${expected}`);
    must(SUPPORTED.includes(got),
      `initialize at ${proposed} echoed unsupported version ${got}`);
    must(obj?.result?.serverInfo?.name, `initialize at ${proposed} returned no serverInfo`);
    return got;
  };

  await assertNegotiated('2024-11-05', LEGACY);
  await assertNegotiated('2025-03-26', LEGACY);
  await assertNegotiated(LEGACY, LEGACY);
  await assertNegotiated(MODERN, MODERN);

  // A real call has to work after the oldest handshake, not just the handshake itself.
  const call = await post({}, { jsonrpc: '2.0', id: 420, method: 'tools/call',
    params: { name: 'find_tool', arguments: { query: 'loan' } } });
  must(call.status === 200, `tools/call after a 2024-11-05 handshake returned HTTP ${call.status}`);
  const callObj = await readJson(call, 'tools/call after legacy handshake');
  must(!callObj?.error,
    `tools/call after a 2024-11-05 handshake errored ${callObj?.error?.code}: ${callObj?.error?.message}`);
  must(Array.isArray(callObj?.result?.content) && callObj.result.content.length > 0,
    'tools/call after a 2024-11-05 handshake returned no content');

  return { code: -32022, negotiated: ['2024-11-05', '2025-03-26'] };
}

// ── (6) Per-request _meta (carried item (1)) ─────────────────────────────────
async function metaEnforcement() {
  const res = await post({ 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
    { jsonrpc: '2.0', id: 501, method: 'tools/list', params: {} });
  must(res.status === 400, `modern request with no _meta returned HTTP ${res.status}, expected 400`);
  const obj = await readJson(res, 'modern no _meta');
  must(obj?.error?.code === -32602, `modern request with no _meta returned code ${obj?.error?.code}, expected -32602`);
  must((obj?.error?.data?.missingFields?.length ?? 0) === 2, 'modern _meta rejection did not list both missing fields');

  const partial = await post({ 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
    { jsonrpc: '2.0', id: 502, method: 'tools/list',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN } } });
  const partialObj = await readJson(partial, 'modern partial _meta');
  must(partialObj?.error?.code === -32602, 'modern request missing clientCapabilities was not rejected with -32602');
  return { code: -32602 };
}

// ── (7) Error shapes + stateless hygiene ─────────────────────────────────────
async function errorShapes() {
  const unknownTool = await post({ 'mcp-method': 'tools/call', 'mcp-name': 'definitely_not_a_real_tool' },
    { jsonrpc: '2.0', id: 601, method: 'tools/call', params: { name: 'definitely_not_a_real_tool', arguments: {} } });
  const utObj = await readJson(unknownTool, 'unknown tool');
  must(!!utObj?.error, 'unknown tool returned no JSON-RPC error — required to be a protocol error, not a tool result');
  must(utObj.error.code === -32602, `unknown tool returned code ${utObj.error.code}, expected -32602`);
  must(utObj.error.code !== -32002, 'unknown tool returned the retired -32002 code');

  const unknownMethod = await post({ 'mcp-method': 'no/such/method' },
    { jsonrpc: '2.0', id: 602, method: 'no/such/method', params: {} });
  must(unknownMethod.status === 404, `unknown method returned HTTP ${unknownMethod.status}, expected 404`);
  const umObj = await readJson(unknownMethod, 'unknown method');
  must(umObj?.error?.code === -32601, `unknown method returned code ${umObj?.error?.code}, expected -32601`);

  for (const verb of ['GET', 'DELETE']) {
    const res = await fetch(URL_MCP, { method: verb, signal: AbortSignal.timeout(TIMEOUT) });
    must(res.status === 405, `${verb} /mcp returned HTTP ${res.status}, expected 405`);
  }

  // CORS must advertise all three routing headers, or a browser client cannot send them.
  const pre = await fetch(URL_MCP, { method: 'OPTIONS', signal: AbortSignal.timeout(TIMEOUT) });
  const allow = (pre.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  for (const h of ['mcp-protocol-version', 'mcp-method', 'mcp-name']) {
    must(allow.includes(h), `CORS Allow-Headers does not advertise ${h}: ${allow}`);
  }
  return { unknownTool: utObj.error.code };
}

// ── (0) Build pin — confirm THIS deploy is answering before asserting anything ──
// `deployed_version` comes from the Cloudflare Version Metadata binding (wrangler.jsonc
// `version_metadata`), surfaced on /healthz — the same id `wrangler deploy` prints as
// "Current Version ID". Without this, a response that lacks the new behavior is
// indistinguishable from a build that never shipped: a partially-rolled-out edge can
// answer with the OLD build on attempt 1, the NEW build on attempt 2, purely by which
// colo served the request. Polling here removes that ambiguity — the assertions below
// run exactly once, only after the edge is confirmed to be running MCP_SMOKE_VERSION_ID.
const HEALTHZ_URL = URL_MCP.replace(/\/mcp$/, '/healthz');
const PIN_VERSION = process.env.MCP_SMOKE_VERSION_ID || null;
const PIN_RETRIES = Number(process.env.MCP_SMOKE_PIN_RETRIES ?? RETRIES);
const PIN_DELAY = Number(process.env.MCP_SMOKE_PIN_DELAY_MS ?? DELAY);

async function pollForVersion() {
  if (!PIN_VERSION) {
    console.log('⚠ MCP_SMOKE_VERSION_ID not set — skipping the build pin, asserting against whatever build');
    console.log('  answers (fine for a local/manual run; CI always sets this from `wrangler deploy` output).');
    return null;
  }
  let lastSeen = '(no response)';
  for (let i = 1; i <= PIN_RETRIES; i++) {
    try {
      const res = await fetch(HEALTHZ_URL, { signal: AbortSignal.timeout(TIMEOUT) });
      const obj = await res.json();
      lastSeen = obj?.deployed_version ?? '(null — binding missing or old build)';
      if (lastSeen === PIN_VERSION) {
        console.log(`✓ build pin confirmed — ${PIN_VERSION} is answering at the edge (attempt ${i}/${PIN_RETRIES})`);
        return PIN_VERSION;
      }
      console.error(`  pin attempt ${i}/${PIN_RETRIES}: edge answered ${lastSeen}, want ${PIN_VERSION}`);
    } catch (e) {
      console.error(`  pin attempt ${i}/${PIN_RETRIES}: ${e.message}`);
    }
    if (i < PIN_RETRIES) await new Promise((r) => setTimeout(r, PIN_DELAY));
  }
  console.error(`\n✗ new version never became authoritative — wanted ${PIN_VERSION}, last saw ${lastSeen} after ${PIN_RETRIES} attempts (${PIN_DELAY}ms apart).`);
  console.error('  This means the edge is still propagating the old build (wait and re-run), or the deploy');
  console.error('  itself never shipped this version_id (check the Cloudflare dashboard). This is NOT an');
  console.error('  assertion failure — no behavior was tested, because no build was confirmed live.');
  process.exit(1);
}

(async () => {
  const pinned = await pollForVersion();
  try {
    const legacy = await legacyPath();
    console.log(`✓ legacy path OK — header-less, _meta-less tools/list + real tools/call both 200 (${legacy.tools} tools)`);

    const info = await legacyInitialize();
    console.log(`✓ legacy initialize OK — ${info.name} v${info.version} (${URL_MCP})`);

    const modern = await modernPath();
    console.log(`✓ modern path OK — no-initialize tools/list + real tools/call, ${modern.tools} tools, server/discover ${modern.supported} versions; all three SEP-2243 headers round-tripped through the edge (WAF forwards them)`);

    const sep = await sep2243Rejections();
    console.log(`✓ SEP-2243 rejections OK — missing / mismatched / invalid-char all 400 + ${sep.code}; base64 sentinel decodes before comparing`);

    const ver = await versionRejection();
    console.log(`✓ version handling OK — header path 400 + ${ver.code} + data.supported/data.requested + id preserved; initialize NEGOTIATES ${ver.negotiated.join(', ')} down to ${LEGACY} with 200 + a working tools/call`);

    const meta = await metaEnforcement();
    console.log(`✓ modern _meta enforcement OK — missing required fields are 400 + ${meta.code}`);

    const shapes = await errorShapes();
    console.log(`✓ error shapes OK — unknown tool ${shapes.unknownTool}, unknown method 404/-32601, GET+DELETE 405, CORS advertises all three headers`);

    console.log(`\n✓ /mcp wire smoke PASSED against ${pinned ? `confirmed build ${pinned}` : 'unpinned build (no MCP_SMOKE_VERSION_ID)'} — assertions ran exactly once, no retries.`);
    process.exitCode = 0;
  } catch (e) {
    console.error(`\n✗ /mcp wire smoke FAILED against confirmed build ${pinned ?? '(unpinned)'}: ${e.message}`);
    console.error('  This ran against a build the pin step confirmed is live, so this is a real behavior');
    console.error('  regression, not propagation lag. Likely causes: the deployed bundle is broken, or a');
    console.error('  Cloudflare WAF rule on mcp.apexlogics.org is stripping/blocking one of the three');
    console.error('  SEP-2243 routing headers. Roll back in Cloudflare → apexlogics-mcp → Deployments.');
    process.exit(1);
  }
})();
