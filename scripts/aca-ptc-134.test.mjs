#!/usr/bin/env node
// aca-ptc-134.test.mjs — #134 premium tax credit vectors (AL-AUDIT2-ACA).
//
// Pins the #134 kernel (the page runs identical math; kernel-parity proves it
// byte-for-byte) to 2026 law, with the enhanced schedule as a side comparison:
//   - 2026 coverage uses the 2025 HHS poverty guidelines (15,650 + 5,500/person;
//     AK 19,550 + 6,880; HI 17,990 + 6,330), per the 2026 Form 8962 instructions;
//   - 2026 applicable percentages from Rev. Proc. 2025-25 sec. 3.01 (2.10%;
//     3.14-4.19; 4.19-6.60; 6.60-8.44; 8.44-9.96; 9.96), linear within each band,
//     rounded to 0.01%, with no credit above 400% FPL;
//   - ifEnhancedExtended uses the 2021-2025 ARPA/IRA schedule (0/0-2/2-4/4-6/6-8.5,
//     8.5% above 400% FPL, no cliff).
// Zero-dep, no network.  Run: node scripts/aca-ptc-134.test.mjs

import { compute } from '../kernels/134-cobra-vs-aca-optimizer.kernel.mjs';

let fail = 0;
const BASE = { cobraMonthly: 650, benchmarkMonthly: 550, coverageMonths: 12, householdSize: 1, state: 'lower48' };
const out = (inp) => compute({ ...BASE, ...inp }).output_payload.outputs;
const eq = (label, got, want) => {
  if (got === want) console.log(`  ✓ ${label}`);
  else { fail++; console.error(`✗ ${label}\n    got:  ${got}\n    want: ${want}`); }
};

// Audit case: single, AGI 30,000, benchmark 550/mo. 30,000 / 15,650 = 191.7% FPL
// → 4.19 + 2.41 × 0.834 = 6.20% → contribution 1,860, PTC 4,740, net ≈ 155/mo.
// (Was 4.0% step on the 2026 FPL: PTC 5,400, net 100/mo.)
const audit = out({ estimatedAGI: 30000 });
eq('audit case: applicable percentage 6.20%', audit.contributionPct, 0.062);
eq('audit case: PTC 4,740', audit.ptcAnnual, 4740);
eq('audit case: net 155/mo', audit.marketplaceNetMonthly, 155);
eq('audit case: 400% cliff at 62,600 (2025 FPL)', audit.subsidyCliffAGI, 62600);
eq('audit case, if extended: 1.67%, PTC 6,099', `${audit.ifEnhancedExtended.contributionPct} ${audit.ifEnhancedExtended.ptcAnnual}`, '0.0167 6099');

const at400 = out({ estimatedAGI: 62600 });
eq('exactly 400% FPL: still eligible at 9.96%, PTC 365', `${at400.contributionPct} ${at400.ptcAnnual}`, '0.0996 365');

const above = out({ estimatedAGI: 70000 });
eq('above 400%: no credit under 2026 law', `${above.aboveCliff} ${above.contributionPct} ${above.ptcAnnual}`, 'true null 0');
eq('above 400%, if extended: 8.5% cap, PTC 650, net 496', `${above.ifEnhancedExtended.contributionPct} ${above.ifEnhancedExtended.ptcAnnual} ${above.ifEnhancedExtended.marketplaceNetMonthly}`, '0.085 650 496');

const low = out({ estimatedAGI: 18000 });
eq('115% FPL: flat 2.10%, net 32/mo; if extended 0%, net 0', `${low.contributionPct} ${low.marketplaceNetMonthly} ${low.ifEnhancedExtended.contributionPct} ${low.ifEnhancedExtended.marketplaceNetMonthly}`, '0.021 32 0 0');

const medicaid = out({ estimatedAGI: 12000 });
eq('below 100% FPL: no credit either way', `${medicaid.contributionPct} ${medicaid.ifEnhancedExtended.contributionPct} ${medicaid.marketplaceNetMonthly}`, 'null null 550');

// Alaska, 4 people: FPL 19,550 + 3 × 6,880 = 40,190; AGI 100,000 = 248.8% FPL → 8.40%.
// 2026 law: net 700/mo > COBRA 650 → COBRA. If extended: 3.95%, net 329 → Marketplace.
const ak = out({ estimatedAGI: 100000, householdSize: 4, state: 'ak', benchmarkMonthly: 1800 });
eq('AK family of 4: 8.40%, PTC 13,200, COBRA wins', `${ak.contributionPct} ${ak.ptcAnnual} ${ak.recommendedPath}`, '0.084 13200 cobra');
eq('AK family of 4, if extended: 3.95%, net 329, Marketplace wins', `${ak.ifEnhancedExtended.contributionPct} ${ak.ifEnhancedExtended.marketplaceNetMonthly} ${ak.ifEnhancedExtended.recommendedPath}`, '0.0395 329 marketplace');

// Band edges: 133% starts the 3.14% band; 150% starts the 4.19% band.
const fpl = 15650;
eq('133% FPL → 3.14%', out({ estimatedAGI: fpl * 1.33 + 0.01 }).contributionPct, 0.0314);
eq('150% FPL → 4.19%', out({ estimatedAGI: fpl * 1.5 }).contributionPct, 0.0419);

if (fail) { console.error(`\n✗ aca-ptc-134: ${fail} failed`); process.exit(1); }
console.log('✓ aca-ptc-134: all vectors pass');
