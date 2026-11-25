#!/usr/bin/env node
// qbi-199a-137.test.mjs — #137 §199A vectors (AL-AUDIT2-QBI).
//
// Pins the corrected §199A rules in the #137 kernel (the page runs identical math;
// kernel-parity proves it byte-for-byte):
//   - above the phase-in range, a non-SSTB's deduction is min(20% QBI, greater of
//     50% W-2 wages or 25% W-2 + 2.5% UBIA) — a $0 limit means $0, not 20% of QBI
//     (§199A(b)(2)(B));
//   - in the phase-in range the excess over that limit is phased in (§199A(b)(3)(B));
//     for an SSTB, QBI, W-2 wages and UBIA are first scaled by the applicable
//     percentage (§199A(d)(3));
//   - the result never exceeds 20% of taxable income (§199A(a)(1)(B));
//   - the OBBBA $400 minimum (§199A(i)) still applies with >= $1,000 of QBI.
// 2026 thresholds: Rev. Proc. 2025-32 §4.26 — $201,750 single/HoH ($201,775 MFS),
// $403,500 MFJ; phase-in ranges $75,000 / $150,000 (OBBBA).
// Zero-dep, no network.  Run: node scripts/qbi-199a-137.test.mjs

import { compute } from '../kernels/137-qbi-199a-optimizer.kernel.mjs';

let fail = 0;
const ded = (inp) => compute({
  filingStatus: 'single', sstb: 'no', ubia: 0, threshold: 201750, phaseoutBand: 75000, ...inp,
}).output_payload.outputs.qbiDeduction;
const eq = (label, got, want) => {
  if (got === want) console.log(`  ✓ ${label}`);
  else { fail++; console.error(`✗ ${label}\n    got:  ${got}\n    want: ${want}`); }
};

// Audit case: single, TI 400,000, QBI 300,000, no W-2 wages, no property.
// Limit is $0, so the §199A(a) amount is $0; the §199A(i) $400 minimum applies.
// (Before the fix this returned 60,000.)
eq('above range, $0 W-2/UBIA limit → $400 minimum', ded({ qbi: 300000, taxableIncome: 400000, w2Wages: 0 }), 400);

// Above range with wages: min(60,000, 50% × 80,000) = 40,000.
eq('above range, wage limit binds', ded({ qbi: 300000, taxableIncome: 400000, w2Wages: 80000 }), 40000);

// 20%-of-taxable-income cap above the threshold: QBI 500k, TI 300k, ample wages →
// min(100,000, 200,000 limit) = 100,000, capped at 20% × 300,000 = 60,000.
eq('20% of taxable income cap binds above threshold', ded({ qbi: 500000, taxableIncome: 300000, w2Wages: 400000 }), 60000);

// Below threshold: full 20% of QBI, capped at 20% of TI.
eq('below threshold, 20% QBI', ded({ qbi: 100000, taxableIncome: 150000 }), 20000);
eq('below threshold, 20% TI cap', ded({ qbi: 100000, taxableIncome: 80000 }), 16000);

// Phase-in, non-SSTB (default chain scenario): TI 230,000 → 28,250 / 75,000 = 37.667%
// through. 30,000 − 0.37667 × (30,000 − 20,000) = 26,233.
eq('phase-in, non-SSTB with wages', ded({ qbi: 150000, taxableIncome: 230000, w2Wages: 40000, ubia: 100000 }), 26233);
// Phase-in, non-SSTB, $0 limit: 30,000 − 0.37667 × 30,000 = 18,700.
eq('phase-in, non-SSTB, $0 limit', ded({ qbi: 150000, taxableIncome: 230000, w2Wages: 0 }), 18700);

// Phase-in, SSTB, $0 limit: applicable % 62.333 → 18,700 scaled, limit 0 →
// 18,700 − 0.37667 × 18,700 = 11,656.  (Before the fix: 18,700, wage limit ignored.)
eq('phase-in, SSTB, $0 limit', ded({ qbi: 150000, taxableIncome: 230000, w2Wages: 0, sstb: 'yes' }), 11656);
// Phase-in, SSTB, ample wages: scaled limit exceeds scaled 20% → 18,700.
eq('phase-in, SSTB, wages ample', ded({ qbi: 150000, taxableIncome: 230000, w2Wages: 100000, sstb: 'yes' }), 18700);

// SSTB above range: $0.
eq('SSTB above range → 0', compute({ filingStatus: 'single', sstb: 'yes', qbi: 300000, taxableIncome: 400000,
  w2Wages: 200000, ubia: 0, threshold: 201750, phaseoutBand: 75000 }).output_payload.outputs.sstbDisallowed, true);

// MFJ: threshold 403,500, range 150,000; TI 600,000 > 553,500, QBI 200,000, W-2 50,000
// → min(40,000, 25,000) = 25,000.
eq('MFJ above range, wage limit', ded({ filingStatus: 'mfj', threshold: 403500, phaseoutBand: 150000,
  qbi: 200000, taxableIncome: 600000, w2Wages: 50000 }), 25000);

if (fail) { console.error(`\n✗ #137 §199A vectors: ${fail} failed`); process.exit(1); }
console.log('\n✓ #137 §199A vectors: all green');
