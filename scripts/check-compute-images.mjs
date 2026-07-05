/**
 * check-compute-images.mjs — §17 kernel-source identity freshness gate.
 *
 * For every kernel registered in kernels/index.mjs, recompute the sha256 of the
 * LF-normalized kernel source and assert it byte-equals the `sha256-source`
 * compute_images.image_id stamped on that tool's node in the chaingraph run_chain
 * actually imports (data/chaingraph/chaingraph.json). A mismatch means a kernel was
 * edited without re-stamping (or vice-versa) — the §17 build_identity the worker
 * attaches at run time would then publish a stale source digest. Zero-dep; exits 1
 * on any drift so deploy.yml blocks the push. Companion to the eol=lf .gitattributes
 * pin that keeps the digest reproducible across checkouts.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KERNELS } from '../kernels/index.mjs';

const GRAPH = new URL('../data/chaingraph/chaingraph.json', import.meta.url);
const KDIR  = new URL('../kernels/', import.meta.url);

const data = JSON.parse(readFileSync(GRAPH, 'utf8'));
const nodeById = {};
for (const n of (data.nodes || [])) nodeById[n.tool_id] = n;

const problems = [];
let ok = 0;
for (const tid of Object.keys(KERNELS)) {
  const lf = readFileSync(new URL(tid + '.kernel.mjs', KDIR), 'utf8').replace(/\r\n/g, '\n');
  const digest = createHash('sha256').update(lf, 'utf8').digest('hex');
  const node = nodeById[tid];
  if (!node) { problems.push(`${tid}: no node in chaingraph.json`); continue; }
  const imgs = Array.isArray(node.compute_images) ? node.compute_images : [];
  const src = imgs.find((im) => im.system === 'sha256-source');
  if (!src) { problems.push(`${tid}: node missing sha256-source compute_images entry`); continue; }
  const stamped = String(src.image_id).replace(/^sha256:/, '');
  if (stamped !== digest) {
    problems.push(`${tid}: stamp ${stamped.slice(0, 16)}… != source ${digest.slice(0, 16)}… (re-run the §17 stamp)`);
    continue;
  }
  ok++;
}

if (problems.length) {
  console.error('✗ COMPUTE-IMAGES: §17 sha256-source stamps drifted from kernel source:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ COMPUTE-IMAGES: all ${ok} kernel-backed nodes carry a fresh §17 sha256-source stamp.`);
