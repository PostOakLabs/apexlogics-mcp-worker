#!/usr/bin/env node
// callerhash.test.mjs — telemetry caller hash vectors (AL-AUDIT2-CALLERHASH).
// Zero-dep, no network.  Run: node scripts/callerhash.test.mjs
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { callerHash, UNSALTED } from '../_callerhash.mjs';

let fail = 0;
const ok = (label, cond) => { if (cond) console.log(`  ✓ ${label}`); else { fail++; console.error(`✗ ${label}`); } };
const SALT = 'test-salt-0123456789abcdef';
const D1 = new Date('2026-11-25T23:59:59Z'), D2 = new Date('2026-11-26T00:00:01Z');
const ip = '203.0.113.7';

const h1 = await callerHash(ip, SALT, D1);
ok('format is hmac: + 16 hex', /^hmac:[0-9a-f]{16}$/.test(h1));
ok('matches HMAC-SHA256(salt, "2026-11-25:" + ip)', h1 === 'hmac:' + createHmac('sha256', SALT).update('2026-11-25:' + ip).digest('hex').slice(0, 16));
ok('stable within a UTC day', h1 === await callerHash(ip, SALT, new Date('2026-11-25T00:00:00Z')));
ok('rotates at UTC midnight', h1 !== await callerHash(ip, SALT, D2));
ok('different IPs differ', h1 !== await callerHash('203.0.113.8', SALT, D1));
ok('different secrets differ', h1 !== await callerHash(ip, SALT + 'x', D1));
ok('no secret -> "unsalted", not a hash', await callerHash(ip, undefined, D1) === UNSALTED);
ok('empty secret -> "unsalted"', await callerHash(ip, '', D1) === UNSALTED);
ok('short secret (<16) -> "unsalted"', await callerHash(ip, 'short', D1) === UNSALTED);
const oldPublic = 'sha256:' + createHash('sha256').update('apexlogics-mcp-v1:' + ip).digest('hex').slice(0, 16);
ok('never the old public-salt hash', h1 !== oldPublic && !h1.startsWith('sha256:'));
const src = readFileSync(new URL('../worker.mjs', import.meta.url), 'utf8');
ok('worker.mjs no longer contains the public salt', !src.includes('apexlogics-mcp-v1:'));
ok('worker.mjs hashes callers through _callerhash.mjs with env.CALLER_HASH_SALT', /callerHashOf\(callerRaw, env\.CALLER_HASH_SALT\)/.test(src));

// No IP in logs (AL-AUDIT2-NOIP): invocation logs off (no per-field redaction exists),
// and no console call in the Worker passes the caller's IP.
const wr = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/mg, '');
ok('wrangler: observability.logs.invocation_logs is false', JSON.parse(wr).observability?.logs?.invocation_logs === false);
const consoleLines = src.split('\n').filter(l => /console\.(log|error|warn|info|debug)\(/.test(l));
ok('no console call logs the caller IP', consoleLines.every(l => !/callerRaw|CF-Connecting-IP|X-Forwarded-For/i.test(l)));

if (fail) { console.error(`\n✗ callerhash: ${fail} failed`); process.exit(1); }
console.log('✓ callerhash: all vectors pass');
