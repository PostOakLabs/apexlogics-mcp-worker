/**
 * check-vendor-fresh.mjs (worker) — pin the OCG SSOT files vendored into this worker so
 * they can never silently drift from AINumbers/mcp-apps-poc (read-only SSOT).
 *
 *   kernels/_hash.mjs     : banner-free byte-exact SSOT (guest-legal exact-specifier import).
 *   _hash.mjs (top-level) : banner + SSOT body; the SSOT body (after the 3-line banner) must
 *                           equal the same sha the guest copy carries.
 *   kernels/_gateval.mjs  : OCG §21.4 gate evaluator, vendored verbatim.
 *
 * Exit 0 = fresh; non-0 = RED (do not deploy). Zero-dep node.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// Pinned SSOT digests (OCG §17 kernel identity). Update ONLY when the SSOT itself moves.
const HASH_BODY_SHA = '9d60ba8b9a14900b9cc1f4878de4e92f5d8e622a128413840be9ea94bbae1cfb';
// LF-normalized SSOT (the AINumbers working copy ships CRLF; .gitattributes eol=lf
// stores + checks out LF here, so pin the LF sha for a stable, checkout-invariant gate).
// _gateval runs in the worker/runner, NOT the zkVM guest, so line-ending choice is free.
const GATEVAL_SHA   = 'bc85b96e1b9fbc67036bb4ed5bbb622e9478acbe4cf8381c3521e5f9e43c9b54';
const DETMATH_SHA   = 'fd3ebdb0a5192b04bd33703ab03d1daf0b80cf0887bb84958ab9488467c516cd';

let red = false;
const check = (label, actual, expected) => {
  if (actual === expected) { console.log(`✓ ${label}: ${actual.slice(0, 16)}…`); }
  else { console.error(`✗ ${label}: MOVED\n    expected: ${expected}\n    actual:   ${actual}`); red = true; }
};

// Guest _hash.mjs — whole file must equal the banner-free SSOT body sha.
check('kernels/_hash.mjs (guest, banner-free)', sha(readFileSync(HERE + '../kernels/_hash.mjs')), HASH_BODY_SHA);

// Top-level _hash.mjs — strip the 3-line vendor banner, body must equal the SSOT body sha.
const topLines = readFileSync(HERE + '../_hash.mjs', 'utf8').split('\n');
const topBody = topLines.slice(3).join('\n');
check('_hash.mjs (top-level body)', sha(Buffer.from(topBody, 'utf8')), HASH_BODY_SHA);

// _gateval.mjs — vendored verbatim.
check('kernels/_gateval.mjs', sha(readFileSync(HERE + '../kernels/_gateval.mjs')), GATEVAL_SHA);

// _detmath.mjs — vendored verbatim from AINumbers SSOT (pure-JS fdlibm; OCG §18.5 deterministic
// transcendentals). Byte-identical copy must also be inlined in any browser tool that uses det.pow.
check('kernels/_detmath.mjs', sha(readFileSync(HERE + '../kernels/_detmath.mjs')), DETMATH_SHA);

console.log(red ? '\n✗ VENDOR-FRESH: a vendored SSOT file drifted — do not deploy.' : '\n✓ vendored SSOT files are fresh.');
process.exit(red ? 1 : 0);
