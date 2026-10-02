#!/usr/bin/env node
// art340-parity-133.test.mjs — #133 FLSA weekly-rule parity vectors (AL-133-OT-THRESHOLD).
//
// The #133 kernel and page now implement the FLSA weekly rule the way AINumbers
// art-340 (chaingraph/kernels/art-340-compute-flsa-regular-rate.kernel.mjs, 29 CFR
// 778 Subpart C) implements it: overtime hours are TOTAL weekly hours above the
// threshold, the shift differential is part of the regular rate, and the premium is
// (multiplier − 1) × regular rate × overtime hours. THE RULE WAS ADOPTED, NOT THE
// CODE: no AINumbers kernel is vendored here. These vectors were copied from
// art-340's fixture suite (chaingraph/kernels/fixtures/
// art-340-compute-flsa-regular-rate.fixtures.json at the art-340 origin/main pin)
// and adapted to #133's input shape where the two models overlap — #133 has no
// nondiscretionary-bonus field, so art-340's $100-bonus arithmetic is out of model
// and is cited, not asserted. Zero-dep, no network.
//
// Run: node scripts/art340-parity-133.test.mjs   (exit 0 = all vectors green)

import { compute } from '../kernels/133-shift-differential-overtime-optimizer.kernel.mjs';

let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ✓ ${label}`); } else { fail++; console.error(`✗ ${label}\n    got:  ${g}\n    want: ${w}`); }
};

// Adopted rule, stated once so every expectation below derives from it:
//   total       = scheduled hours + extra hours
//   otHours     = max(0, total − otThreshold)
//   regularRate = baseRate × (1 + diffPct)        // differential rides into the rate
//   premium     = (otMult − 1) × regularRate × otHours
//   weeklyGross = regularRate × (total − otHours) + regularRate × otMult × otHours
const ruleWeeklyGross = (base, diffPct, total, threshold, mult) => {
  const rate = base * (1 + diffPct);
  const ot = Math.max(0, total - threshold);
  return rate * (total - ot) + rate * mult * ot;
};
const rulePremium = (base, diffPct, total, threshold, mult) => {
  const rate = base * (1 + diffPct);
  const ot = Math.max(0, total - threshold);
  return rate * (mult - 1) * ot;
};

// Build a compute() input where all four schedules are identical (best row = the
// first, Day Shift) and childcare is 'none' on every row so cc = 0. taxRate is 1
// (percent), not 0, because the page's `x/100 || default` treats 0 as absent.
const uniform = (over) => {
  const inp = {
    baseRate: over.base, otThreshold: over.threshold, otMultiplier: over.mult ?? 1.5,
    taxRate: 1, childcareCost: 1, altChildcareCost: 1,
  };
  for (let i = 0; i < 4; i++) {
    inp[`s${i}-hours`] = over.hours; inp[`s${i}-diff`] = over.diff ?? 0;
    inp[`s${i}-ot`] = over.extra ?? 0; inp[`s${i}-weeks`] = 1; inp[`s${i}-alt`] = 'none';
  }
  return inp;
};
const outs = (over) => compute(uniform(over)).output_payload;

console.log('── vector 1 · adopted from art-340 "dol_fact_sheet_56c_example" (rate portion) ──');
// art-340 fixture: $15.00/hr, 45 hours, no bonus → straight-time 675, overtime
// hours 5, premium 5 × 15 × 0.5 = $37.50, total pay due $712.50. Same numbers here.
{
  const o = outs({ base: 15, threshold: 40, hours: 45, extra: 0 });
  const gross = ruleWeeklyGross(15, 0, 45, 40, 1.5);
  eq('weekly gross = 712.50 (art-340 total_pay_due, rate portion)', gross, 712.5);
  eq('premium = 37.50 (art-340 5 × $15 × 0.5)', rulePremium(15, 0, 45, 40, 1.5), 37.5);
  eq('bestGrossAnnual (1 week, export rounds)', o.outputs.bestGrossAnnual, Math.round(gross));
  eq('bestNetAnnual (1% tax, no childcare)', o.outputs.bestNetAnnual, Math.round(gross - gross * 0.01));
}

console.log('── vector 2 · adopted from art-340 "no_overtime_35_hours" ──');
// art-340 fixture: $20.00/hr, 35 hours, no bonus → total_pay_due $700, overtime
// premium $0, overtime hours 0. Under the threshold pays no premium.
{
  const o = outs({ base: 20, threshold: 40, hours: 35, extra: 0 });
  eq('weekly gross = 700 (art-340 total_pay_due)', ruleWeeklyGross(20, 0, 35, 40, 1.5), 700);
  eq('premium = 0 (art-340 overtime_premium_pay)', rulePremium(20, 0, 35, 40, 1.5), 0);
  eq('bestGrossAnnual', o.outputs.bestGrossAnnual, 700);
}

console.log('── vector 3 · adopted from art-340 "dol_fact_sheet_56c_example" (differential in the regular rate) ──');
// art-340's published vector blends a $1.00/hr evening differential on 30 of 45
// hours plus a $100 nondiscretionary bonus into a $17.89 regular rate and a $44.73
// premium. #133 models a uniform differential percentage and has no bonus field,
// so this vector pins the SHARED rule quantities on the DOL example's shape
// (45 h, $15 base, evening differential): at 10% the loaded rate is $16.50,
// overtime hours are 5, premium = 0.5 × 16.50 × 5 = $41.25/wk, gross $783.75.
{
  const o = outs({ base: 15, threshold: 40, hours: 45, extra: 0, diff: 10 });
  const gross = ruleWeeklyGross(15, 10 / 100, 45, 40, 1.5);
  eq('loaded regular rate = 16.50 (differential rides in, 29 CFR §778.207)', 15 * (1 + 10 / 100), 16.5);
  eq('premium = 41.25 (0.5 × 16.50 × 5)', rulePremium(15, 10 / 100, 45, 40, 1.5), 41.25);
  eq('bestGrossAnnual (export rounds 783.75)', o.outputs.bestGrossAnnual, Math.round(gross));
}

console.log('── vector 4 · row acceptance: 36 h schedule + 4 extra hours pays NO premium ──');
// Total 40 at threshold 40 → 0 premium hours → gross equals a flat 40 h week at
// straight time. (The pre-fix kernel paid 4 h at 1.5× here: 40×32 + 40×1.5×4 = 1520.)
{
  const a = outs({ base: 40, threshold: 40, hours: 36, extra: 4 });
  const b = outs({ base: 40, threshold: 40, hours: 40, extra: 0 });
  eq('36 h + 4 extra = 1600 (straight time, no premium)', a.outputs.bestGrossAnnual, 1600);
  eq('equal to a flat 40 h week', a.outputs.bestGrossAnnual, b.outputs.bestGrossAnnual);
  eq('premium = 0', rulePremium(40, 0, 40, 40, 1.5), 0);
}

console.log('── vector 5 · row acceptance: a 48 h schedule pays exactly 8 h of premium ──');
// 48 total → 8 premium hours → premium = 0.5 × 40 × 8 = 160; gross = 40×48 + 160
// = 2080, whether the 48 arrives as one number or 44 scheduled + 4 extra.
// (The pre-fix kernel gave 40×48 = 1920 and never applied the threshold.)
{
  const a = outs({ base: 40, threshold: 40, hours: 48, extra: 0 });
  const b = outs({ base: 40, threshold: 40, hours: 44, extra: 4 });
  eq('48 h = 2080 (1920 straight + 160 premium)', a.outputs.bestGrossAnnual, 2080);
  eq('premium = 160 = 8 h × 0.5 × 40', rulePremium(40, 0, 48, 40, 1.5), 160);
  eq('44 h + 4 extra gives the same total-week result', b.outputs.bestGrossAnnual, a.outputs.bestGrossAnnual);
}

console.log('── vector 6 · the otThreshold field is honoured ──');
// Same 36 h + 4 extra week, threshold 36 → 4 premium hours → premium 0.5 × 40 × 4
// = 80 on top of straight time. A kernel that ignored the field would repeat 1600.
{
  const o = outs({ base: 40, threshold: 36, hours: 36, extra: 4 });
  eq('threshold 36 → gross 1680 (1600 + 80 premium)', o.outputs.bestGrossAnnual, 1680);
  const echo = compute(uniform({ base: 40, threshold: 36, hours: 36, extra: 4 })).output_payload.inputs;
  eq('execution preimage echoes the threshold used', echo.otThreshold, 36);
}

if (fail) { console.error(`\n✗ art340-parity-133: ${fail} assertion(s) FAILED`); process.exit(1); }
console.log('\n✅ art340-parity-133: all adopted FLSA weekly-rule vectors passed (art-340 rule parity + row acceptance).');
