/**
 * check-compute-proofs.mjs — §18 compute-proof binding gate.
 *
 * For every node in data/chaingraph/chaingraph.json carrying a compute_proof, re-verify
 * the binding the recipe requires — ImageID + journal.output — WITHOUT re-running the zkVM:
 *   - imageId === the pinned Guest ImageID (a1a0bc89…). A different image = a different
 *     guest program, not a knob.
 *   - journal.chaingraph_version === '0.4.0'.
 *   - journal.output JCS-equals compute(proven_inputs).output_payload, where proven_inputs
 *     come from data/proof-fixtures.json (the inputs the proof was generated for). This binds
 *     the proof to the CURRENT kernel's actual output — an output-preserving source edit
 *     (comment/rename) stays valid (only a §17 re-stamp needed), but an output-CHANGING edit
 *     breaks it (must re-prove). Deliberately does NOT key on the source digest (§17's job).
 *
 * §18.1: additionally re-verifies the cryptographic Groth16-BN254 SEAL in-gate via the vendored
 * self-contained reference verifier (kernels/_computeproof.mjs → verifySeal; @noble/curves BN254
 * pairing check, no GPU/network). The seal was first checked at prove time (run_verify → VERIFY_PASS);
 * this makes CI re-confirm it without the prover box, catching a tampered or substituted seal.
 * Zero-dep, no network, no GPU — CI-standalone.
 */
import { readFileSync } from 'node:fs';
import { verifySeal } from '../kernels/_computeproof.mjs';

const IMAGE_ID = 'sha256:a1a0bc89b5b1febaeda3519f6dbade0fa5ac16beeb143c4e1b01689573567bc6';
const GRAPH = new URL('../data/chaingraph/chaingraph.json', import.meta.url);
const FIXT  = new URL('../data/proof-fixtures.json', import.meta.url);
const KDIR  = new URL('../kernels/', import.meta.url);

function jcs(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
}

const data = JSON.parse(readFileSync(GRAPH, 'utf8'));
const fixtures = JSON.parse(readFileSync(FIXT, 'utf8')).fixtures || {};
const proven = (data.nodes || []).filter((n) => n.compute_proof);

const problems = [];
let ok = 0;
for (const n of proven) {
  const id = n.tool_id;
  const p = n.compute_proof;
  if (p.imageId !== IMAGE_ID) { problems.push(`${id}: imageId ${String(p.imageId).slice(0, 22)}… != pinned a1a0bc89 (wrong guest)`); continue; }
  if (!p.journal || p.journal.chaingraph_version !== '0.4.0') { problems.push(`${id}: journal.chaingraph_version != 0.4.0`); continue; }
  const inputs = fixtures[id];
  if (inputs === undefined) { problems.push(`${id}: no proof-fixtures entry — cannot re-bind journal.output`); continue; }
  let out;
  try {
    const mod = await import(new URL(id + '.kernel.mjs', KDIR).href);
    out = mod.compute(inputs).output_payload;
  } catch (e) { problems.push(`${id}: kernel compute threw: ${e.message}`); continue; }
  if (jcs(out) !== jcs(p.journal.output)) {
    problems.push(`${id}: kernel output no longer matches proof journal.output — kernel changed the result; RE-PROVE`);
    continue;
  }
  if (n.compute_proof_ready && n.compute_proof_ready !== 'ready') {
    problems.push(`${id}: has a compute_proof but compute_proof_ready='${n.compute_proof_ready}'`);
    continue;
  }
  // §18.1: re-verify the cryptographic Groth16-BN254 seal itself (self-contained pairing check,
  // vendored @noble/curves; no GPU, no network). Binds A/B/C to the ReceiptClaim derived from
  // (imageId, canonical journal) — catches a tampered/substituted seal that still parses.
  let sealOk = false;
  try { sealOk = verifySeal(p) === true; } catch (e) { problems.push(`${id}: verifySeal threw: ${e.message}`); continue; }
  if (!sealOk) { problems.push(`${id}: BN254 Groth16 seal FAILED cryptographic verification`); continue; }
  ok++;
}

if (problems.length) {
  console.error('✗ COMPUTE-PROOFS: §18 proof bindings drifted:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ COMPUTE-PROOFS: all ${ok} §18 proofs bind ImageID a1a0bc89 + journal.output == current kernel output + BN254 Groth16 seal cryptographically verifies.`);
