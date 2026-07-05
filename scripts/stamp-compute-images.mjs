/**
 * stamp-compute-images.mjs — write the §17 kernel-source identity onto every
 * kernel-backed node. Companion to check-compute-images.mjs (the freshness gate):
 * the gate tells you a stamp drifted; this regenerates it. Run after adding or
 * editing a kernel, then commit both chaingraph copies.
 *
 * For each kernel in kernels/index.mjs, computes sha256 of the LF-normalized source
 * and sets/refreshes the node's `sha256-source` compute_images entry in BOTH the repo
 * canonical chaingraph.json and the worker data copy run_chain imports. Preserves any
 * non-sha256-source entries (e.g. a future risc0 §18 ImageID). Minimal diff:
 * parse → mutate → JSON.stringify(,,2)+'\n' (round-trip verified stable first).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KERNELS } from '../kernels/index.mjs';

const VALID_FROM = '2026-07-05T00:00:00.000Z';
const KDIR = new URL('../kernels/', import.meta.url);
const COPIES = [
  new URL('../../repo/chaingraph/chaingraph.json', import.meta.url),
  new URL('../data/chaingraph/chaingraph.json', import.meta.url),
];

const tids = Object.keys(KERNELS);
const sha = {};
for (const t of tids) {
  const lf = readFileSync(new URL(t + '.kernel.mjs', KDIR), 'utf8').replace(/\r\n/g, '\n');
  sha[t] = createHash('sha256').update(lf, 'utf8').digest('hex');
}

for (const url of COPIES) {
  const raw = readFileSync(url, 'utf8');
  if ((JSON.stringify(JSON.parse(raw), null, 2) + '\n') !== raw) {
    throw new Error('round-trip not stable — refusing to rewrite ' + url.pathname);
  }
  const data = JSON.parse(raw);
  const nodes = data.nodes || [];
  let added = 0, refreshed = 0;
  for (const t of tids) {
    const n = nodes.find((x) => x.tool_id === t);
    if (!n) throw new Error('no node for ' + t);
    const list = Array.isArray(n.compute_images) ? n.compute_images : [];
    const existing = list.find((im) => im.system === 'sha256-source');
    if (existing) {
      if (existing.image_id !== sha[t]) { existing.image_id = sha[t]; existing.valid_from = VALID_FROM; refreshed++; }
    } else {
      list.push({ system: 'sha256-source', image_id: sha[t], valid_from: VALID_FROM });
      added++;
    }
    n.compute_images = list;
  }
  writeFileSync(url, JSON.stringify(data, null, 2) + '\n');
  console.log(`${url.pathname.split('/').slice(-3).join('/')}: +${added} added, ${refreshed} refreshed`);
}
