#!/usr/bin/env node
// cdctc-2026-130.test.mjs — #130 child and dependent care credit rate vectors (AL-AUDIT2-CDCTC).
//
// IRC §21(a)(2) as amended by OBBBA (Pub. L. 119-21 §70405), taxable years after 2025:
//   50%, reduced (not below 35%) by 1 pp for each $2,000 or fraction of AGI over $15,000;
//   further reduced (not below 20%) by 1 pp for each $2,000 ($4,000 joint) or fraction
//   of AGI over $75,000 ($150,000 joint).
// Expense caps $3,000 / $6,000 (§21(c)). The schedule matches AINumbers art-765's
// statutory ruleset (all 46 of its 2026 vectors agree on the CDCTC-only credit).
// Zero-dep, no network.  Run: node scripts/cdctc-2026-130.test.mjs

import { compute } from '../kernels/130-dependent-care-fsa-cdctc-optimizer.kernel.mjs';

let fail = 0;
const eq = (label, got, want) => {
  if (got === want) console.log(`  ✓ ${label}`);
  else { fail++; console.error(`✗ ${label}\n    got:  ${got}\n    want: ${want}`); }
};
// CDCTC-only credit (no FSA), $18,000 of care so the expense cap binds.
const credit = (filingStatus, agi, numChildren) => compute({
  filingStatus, agi, numChildren, childcareCost: 18000, marginalRate: 22, stateRate: 5, fsaAvailable: 'no',
}).output_payload.outputs.cdctcCredit;

// Audit case: MFJ, AGI 120,000, two children → 35% × 6,000 = 2,100 (was 1,200 at 20%).
eq('MFJ 120,000, 2 children → 2,100', credit('mfj', 120000, 2), 2100);
// Single, AGI 31,000, one child: 50 − ceil(16,000/2,000)=8 → 42% × 3,000 = 1,260 (was 600).
eq('single 31,000, 1 child → 1,260', credit('single', 31000, 1), 1260);
eq('AGI 15,000 → 50%', credit('single', 15000, 1), 1500);
eq('AGI 15,001 → 49% (fraction counts)', credit('single', 15001, 1), 1470);
eq('AGI 43,000 → 36%', credit('single', 43000, 1), 1080);
eq('AGI 43,001 → 35% floor of tier A', credit('single', 43001, 1), 1050);
eq('single 75,000 → 35%', credit('single', 75000, 1), 1050);
eq('single 75,001 → 34%', credit('single', 75001, 1), 1020);
eq('single 103,001 → 20% floor', credit('single', 103001, 2), 1200);
eq('MFJ 150,001 → 34% ($4,000 steps)', credit('mfj', 150001, 2), 2040);
eq('MFJ 206,000 → 21%', credit('mfj', 206000, 2), 1260);
eq('MFJ 206,001 → 20% floor', credit('mfj', 206001, 2), 1200);

// Default page case (MFJ 95,000, 2 children, FSA available): the $7,500 DC-FSA
// absorbs the $6,000 cap, so the optimal mix is FSA 7,500 and no credit.
const d = compute({ filingStatus: 'mfj', agi: 95000, numChildren: 2, childcareCost: 18000,
  marginalRate: 22, stateRate: 5, fsaAvailable: 'yes' }).output_payload.outputs;
eq('default case optimal FSA', d.optimalFSAContribution, 7500);
eq('default case credit', d.cdctcCredit, 0);

if (fail) { console.error(`\n✗ #130 CDCTC vectors: ${fail} failed`); process.exit(1); }
console.log('\n✓ #130 CDCTC vectors: all green');
