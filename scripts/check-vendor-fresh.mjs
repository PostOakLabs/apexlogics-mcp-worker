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
const HASH_BODY_SHA = 'ef6fd5a1f28131dce8ca5ea3adcd1662e93cec682b7cecb3759a9647b6a56f04';
// LF-normalized SSOT (the AINumbers working copy ships CRLF; .gitattributes eol=lf
// stores + checks out LF here, so pin the LF sha for a stable, checkout-invariant gate).
// _gateval runs in the worker/runner, NOT the zkVM guest, so line-ending choice is free.
const GATEVAL_SHA   = '349d5d49d00624bac0591b9057adc1ea6d11830734b4730c0f65518d1ac2cbf2';
const DETMATH_SHA   = 'fd3ebdb0a5192b04bd33703ab03d1daf0b80cf0887bb84958ab9488467c516cd';
// §18.1 self-contained BN254 Groth16 seal verifier + its vendored @noble/curves bundle.
// Runs in the worker/CI (check-compute-proofs), NOT the zkVM guest — pin the LF sha.
const COMPUTEPROOF_SHA = '1cc34cae13d2582185bc45c10e508063a514759eb538bd33c6e7f75e0fed4e56';
const NOBLE_BN254_SHA  = 'd389cfa8eb9081831b29c2c187ab4ebde9609be7afd8fd910359b65d13a65f8c';

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

// _computeproof.mjs + _noble-bn254.bundle.mjs — vendored verbatim from AINumbers SSOT (§18.1
// reference seal verifier + BN254 curve bundle). Re-run per proof by check-compute-proofs.mjs.
check('kernels/_computeproof.mjs', sha(readFileSync(HERE + '../kernels/_computeproof.mjs')), COMPUTEPROOF_SHA);
check('kernels/_noble-bn254.bundle.mjs', sha(readFileSync(HERE + '../kernels/_noble-bn254.bundle.mjs')), NOBLE_BN254_SHA);

console.log(red ? '\n✗ VENDOR-FRESH: a vendored SSOT file drifted — do not deploy.' : '\n✓ vendored SSOT files are fresh.');
process.exit(red ? 1 : 0);
