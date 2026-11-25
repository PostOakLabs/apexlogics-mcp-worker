#!/usr/bin/env node
// qsbs-1202-142.test.mjs — #142 §1202 vectors (AL-AUDIT2-QSBS).
//
// Pins the rate on the non-excluded part of a partial §1202 exclusion in the #142
// kernel (the page runs identical math; kernel-parity proves it byte-for-byte):
//   - "section 1202 gain" (26 U.S.C. 1(h)(7)) is the gain that would be excluded at
//     100% minus the gain actually excluded, and is taxed at up to 28% (1(h)(4)),
//     plus 3.8% NIIT when the caller's LTCG rate includes it — not at 20%/23.8%;
//   - gain above the per-issuer cap is ordinary LTCG at the caller's rate;
//   - a 100% exclusion leaves no section 1202 gain; an ineligible sale is all LTCG.
// Zero-dep, no network.  Run: node scripts/qsbs-1202-142.test.mjs

import { compute } from '../kernels/142-qsbs-1202-estimator.kernel.mjs';

let fail = 0;
const ELIGIBLE = { isCCorp: true, isOriginalIssue: true, isActiveBusiness: true, cashOrService: true, notPublic: true, noRepurchase: true };
const out = (inp) => compute({ grossAssets: 20, stateRate: 0, ...ELIGIBLE, ...inp }).output_payload.outputs;
const eq = (label, got, want) => {
  if (got === want) console.log(`  ✓ ${label}`);
  else { fail++; console.error(`✗ ${label}\n    got:  ${got}\n    want: ${want}`); }
};

// Audit case: OBBBA stock held 4 years (75%), gain 3.9M, LTCG 23.8%.
// 975,000 of section 1202 gain × 31.8% = 310,050 (was 975,000 × 23.8% = 232,050).
const audit = { acquireDate: 'obbba', holdYears: 4, costBasis: 100000, saleProceeds: 4000000, ltcgRate: 0.238 };
eq('audit case: tax with exclusion 310,050', out(audit).federalTaxWith, 310050);
eq('audit case: tax without exclusion 928,200', out(audit).federalTaxWithout, 928200);
eq('audit case: saving 618,150', out(audit).federalSaving, 618150);
eq('20% LTCG: section 1202 gain at 28% → 273,000', out({ ...audit, ltcgRate: 0.20 }).federalTaxWith, 273000);
eq('pre-2010 50% tier: 1.95M × 28% = 546,000', out({ ...audit, acquireDate: 'pre2010', holdYears: 6, ltcgRate: 0.20 }).federalTaxWith, 546000);
// Gain above the cap: basis 100k, gain 19.9M, OBBBA cap 15M, 100% tier → 4.9M at 20%.
eq('100% tier, gain above the 15M cap: 4.9M × 20% = 980,000',
  out({ acquireDate: 'obbba', holdYears: 5, costBasis: 100000, saleProceeds: 20000000, ltcgRate: 0.20 }).federalTaxWith, 980000);
// 50% OBBBA tier above the cap: 7.5M section 1202 gain × 28% + 4.9M × 20%.
eq('50% tier above the cap: 7.5M × 28% + 4.9M × 20% = 3,080,000',
  out({ acquireDate: 'obbba', holdYears: 3, costBasis: 100000, saleProceeds: 20000000, ltcgRate: 0.20 }).federalTaxWith, 3080000);
eq('ineligible (not a C corp): all 3.9M at 23.8%',
  out({ ...audit, isCCorp: false }).federalTaxWith, 928200);

if (fail) { console.error(`\n✗ qsbs-1202-142: ${fail} failed`); process.exit(1); }
console.log('✓ qsbs-1202-142: all vectors pass');
