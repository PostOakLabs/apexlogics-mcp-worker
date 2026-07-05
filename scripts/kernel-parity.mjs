/**
 * kernel-parity.mjs — DIGEST-PARITY GATE (OCG §17/§18 kernel identity).
 *
 * Proves, by REAL execution, that a server-side kernel reproduces the browser
 * tool's §6 execution_hash BYTE-FOR-BYTE. This is the gate where a false-pass would
 * poison every downstream kernel + §18 proof, so it derives its golden from the tool's
 * REAL calculate()+exportAP2() path (extracted from the shipped index.html and run in a
 * sandbox) — NOT from hand-typed numbers — then runs the kernel independently and asserts
 * execution_hash + policy_parameters + output_payload are canonically identical.
 *
 * Usage:
 *   node scripts/kernel-parity.mjs            # verify (exit 0 = parity, non-0 = RED)
 *   node scripts/kernel-parity.mjs --write    # verify + regenerate the repo golden
 *
 * Cross-repo: reads the sibling repo/ (../repo). Local dev gate — CI self-containment
 * is provided separately by the repo-side hash-freeze gate on the regenerated golden.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { getKernel } from '../kernels/index.mjs';
import { cgCanon } from '../kernels/_hash.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = HERE + '../../repo/';

// ─────────────────────────────────────────────────────────────────────────────
// Per-tool parity fixtures. Raw browser FIELD values (element ids), incl. the two
// execution-only fields (w2Withholding, priorYearAGI) that steer the safe-harbor
// quarterly amount but are not in the hash preimage. `kernelInputs` maps the same
// case onto the kernel's input contract.
// ─────────────────────────────────────────────────────────────────────────────
const CASES = [
  {
    // Direct-artifact shape (tool-40 family). Inputs mirror the DOM ids
    // (shares/strikePrice/fmv/ordinaryIncome/otherAMT/filingStatus); values match the
    // previously-orphaned golden so the regenerated golden preserves the same scenario.
    tool_id: '109-iso-amt-exposure-modeler',
    calcFn: 'calcISOAMT',
    toolHtml: REPO + 'tools/109-iso-amt-exposure-modeler/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/109-iso-amt-exposure-modeler.golden.json',
    fields: {
      shares: 1000, strikePrice: 2, fmv: 12, ordinaryIncome: 150000,
      otherAMT: 0, filingStatus: 'single',
    },
    kernelInputs: {
      shares: 1000, strikePrice: 2, fmv: 12, ordinaryIncome: 150000,
      otherAMT: 0, filingStatus: 'single',
    },
    goldenGeneratedAt: '2026-07-05T00:00:00.000Z',
  },
  {
    tool_id: '118-teacher-salary-schedule-projector',
    toolHtml: REPO + 'tools/118-teacher-salary-schedule-projector/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/118-teacher-salary-schedule-projector.golden.json',
    fields: {
      currentLane: 3, currentStep: 5, currentSalary: 58000, annualStepIncrease: 1200,
      yearsToRetirement: 20, colaPct: 2.0,
      laneChange1Year: 3, laneChange1Target: 4, laneChange1Bump: 4000,
      laneChange2Year: 8, laneChange2Target: 5, laneChange2Bump: 6000,
    },
    kernelInputs: {
      currentLane: 3, currentStep: 5, currentSalary: 58000, annualStepIncrease: 1200,
      yearsToRetirement: 20, colaPct: 2.0,
      laneChange1Year: 3, laneChange1Target: 4, laneChange1Bump: 4000,
      laneChange2Year: 8, laneChange2Target: 5, laneChange2Bump: 6000,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '40-gig-income-optimizer',
    toolHtml: REPO + 'tools/40-gig-income-optimizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/40-gig-income-optimizer.golden.json',
    // element-id -> value (what the user would type)
    fields: {
      w2Salary: 90000, filingStatus: 'single', stateRate: 5, w2Withholding: 12000,
      gigIncome: 30000, gigExpenses: 4000, gigHourlyRate: 60,
      priorYearTax: 15000, priorYearAGI: 90000,
    },
    kernelInputs: {
      w2_salary: 90000, filing_status: 'single', state_rate_pct: 5,
      gross_gig_income: 30000, business_expenses: 4000, billing_rate_hr: 60,
      prior_year_federal_tax: 15000, w2_withholding: 12000, prior_year_agi: 90000,
    },
    // browser artifact envelope is compute_mode:"browser"; pin generated_at for a
    // reproducible golden file (excluded from the hash preimage anyway).
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '133-shift-differential-overtime-optimizer',
    toolHtml: REPO + 'tools/133-shift-differential-overtime-optimizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/133-shift-differential-overtime-optimizer.golden.json',
    // input keys mirror the tool's DOM field ids -> same object drives browser + kernel.
    fields: {
      baseRate: 40, otThreshold: 40, otMultiplier: 1.5, taxRate: 24, childcareCost: 16000, altChildcareCost: 9000,
      's0-hours': 36, 's0-diff': 0,  's0-ot': 0, 's0-weeks': 50, 's0-alt': 'no',
      's1-hours': 36, 's1-diff': 10, 's1-ot': 4, 's1-weeks': 50, 's1-alt': 'no',
      's2-hours': 36, 's2-diff': 15, 's2-ot': 0, 's2-weeks': 48, 's2-alt': 'yes',
      's3-hours': 36, 's3-diff': 20, 's3-ot': 8, 's3-weeks': 50, 's3-alt': 'none',
    },
    kernelInputs: {
      baseRate: 40, otMultiplier: 1.5, taxRate: 24, childcareCost: 16000, altChildcareCost: 9000,
      's0-hours': 36, 's0-diff': 0,  's0-ot': 0, 's0-weeks': 50, 's0-alt': 'no',
      's1-hours': 36, 's1-diff': 10, 's1-ot': 4, 's1-weeks': 50, 's1-alt': 'no',
      's2-hours': 36, 's2-diff': 15, 's2-ot': 0, 's2-weeks': 48, 's2-alt': 'yes',
      's3-hours': 36, 's3-diff': 20, 's3-ot': 8, 's3-weeks': 50, 's3-alt': 'none',
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '135-option-exercise-window',
    toolHtml: REPO + 'tools/135-option-exercise-window/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/135-option-exercise-window.golden.json',
    fields: {
      vestedShares: 10000, strikePrice: 2, fmv: 15, optionType: 'iso', windowDays: 90, cashAvailable: 50000,
      exitLow: 5, exitBase: 15, exitHigh: 40, pBear: 20, pBase: 50, pBull: 30,
    },
    kernelInputs: {
      vestedShares: 10000, strikePrice: 2, fmv: 15, optionType: 'iso', windowDays: 90, cashAvailable: 50000,
      exitLow: 5, exitBase: 15, exitHigh: 40, pBear: 20, pBase: 50, pBull: 30,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '136-severance-ui-timing',
    toolHtml: REPO + 'tools/136-severance-ui-timing/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/136-severance-ui-timing.golden.json',
    fields: {
      severanceForm: 'continuation', severanceTotal: 30000, weeklySalary: 2000,
      stateBucket: 'standard', weeklyBenefit: 500, searchWeeks: 20,
    },
    kernelInputs: {
      severanceForm: 'continuation', severanceTotal: 30000, weeklySalary: 2000,
      stateBucket: 'standard', weeklyBenefit: 500, searchWeeks: 20,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '140-83b-election-decision',
    toolHtml: REPO + 'tools/140-83b-election-decision/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/140-83b-election-decision.golden.json',
    fields: {
      shares: 10000, strikePrice: 0.5, fmvAtGrant: 1, vestingYears: 4, grantType: 'rsa',
      fmvLow: 2, fmvBase: 10, fmvHigh: 50, forfeitureProb: 20, taxBracket: 0.37, ltcgRate: 0.20, exitYears: 5,
    },
    kernelInputs: {
      shares: 10000, strikePrice: 0.5, fmvAtGrant: 1, vestingYears: 4, grantType: 'rsa',
      fmvBase: 10, forfeitureProb: 20, taxBracket: 0.37, ltcgRate: 0.20,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '124-contractor-launch-break-even',
    toolHtml: REPO + 'tools/124-contractor-launch-break-even/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/124-contractor-launch-break-even.golden.json',
    fields: {
      w2Salary: 65000, benefitsValue: 12000, taxRate: 22, startupCosts: 12500, monthlyOverhead: 1500,
      materialsMarkup: 15, materialsRevenue: 2000, ownerPay: 70000, rampMonths: 6,
      billableHours: 32, weeksWorked: 48, rampUtilization: 40,
    },
    kernelInputs: {
      w2Salary: 65000, benefitsValue: 12000, taxRate: 22, startupCosts: 12500, monthlyOverhead: 1500,
      materialsMarkup: 15, materialsRevenue: 2000, ownerPay: 70000, rampMonths: 6,
      billableHours: 32, weeksWorked: 48, rampUtilization: 40,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '130-dependent-care-fsa-cdctc-optimizer',
    toolHtml: REPO + 'tools/130-dependent-care-fsa-cdctc-optimizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/130-dependent-care-fsa-cdctc-optimizer.golden.json',
    fields: {
      filingStatus: 'mfj', agi: 95000, marginalRate: 22, stateRate: 5,
      numChildren: 2, childcareCost: 18000, fsaAvailable: 'yes', fsaContrib: 0,
    },
    kernelInputs: {
      filingStatus: 'mfj', agi: 95000, marginalRate: 22, stateRate: 5,
      numChildren: 2, childcareCost: 18000, fsaAvailable: 'yes',
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '132-travel-nurse-vs-staff-comp',
    toolHtml: REPO + 'tools/132-travel-nurse-vs-staff-comp/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/132-travel-nurse-vs-staff-comp.golden.json',
    fields: {
      staffRate: 38, staffHours: 36, staffBenefits: 12000, staffWeeks: 50, taxRate: 22,
      travelBase: 22, housingStipend: 1200, mieStipend: 350, contractWeeks: 13,
      contractsPerYear: 3, gapWeeks: 3, travelHours: 36, travelCost: 1500, ttpHousingCost: 200,
    },
    kernelInputs: {
      staffRate: 38, staffHours: 36, staffBenefits: 12000, staffWeeks: 50, taxRate: 22,
      travelBase: 22, housingStipend: 1200, mieStipend: 350, contractWeeks: 13,
      contractsPerYear: 3, gapWeeks: 3, travelHours: 36, travelCost: 1500, ttpHousingCost: 200,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '143-federal-buyout-decision',
    toolHtml: REPO + 'tools/143-federal-buyout-decision/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/143-federal-buyout-decision.golden.json',
    fields: {
      currentSalary: 110000, yearsService: 18, currentAge: 52, retirementSystem: 'fers',
      retirementAge: 62, severancePay: 40000, continuedHealthMonths: 6, taxRate: 0.24,
      monthlyHealthCost: 700, pensionReducPct: 10, privateOfferLow: 90000,
      privateOfferBase: 120000, privateOfferHigh: 150000, searchMonths: 4, stayYears: 5,
    },
    kernelInputs: {
      currentSalary: 110000, yearsService: 18, currentAge: 52, retirementSystem: 'fers',
      retirementAge: 62, severancePay: 40000, continuedHealthMonths: 6, taxRate: 0.24,
      monthlyHealthCost: 700, pensionReducPct: 10, privateOfferLow: 90000,
      privateOfferBase: 120000, privateOfferHigh: 150000, searchMonths: 4, stayYears: 5,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '145-greencard-wait-cost',
    toolHtml: REPO + 'tools/145-greencard-wait-cost/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/145-greencard-wait-cost.golden.json',
    fields: {
      category: 'eb2', chargeability: 'india', estimatedWaitYears: 8, i140Approved: 'approved',
      i485Filed: 'no', h1bYearsRemaining: 2, currentSalary: 130000, opportunitySalary: 150000,
      annualRaise: 3, opportunityGrowthPct: 4, mobilityRestriction: 2000,
      h1bExtensionCost: 4500, h1bExtensionFreqYears: 3, otherAnnualImmigCost: 1500,
    },
    kernelInputs: {
      category: 'eb2', chargeability: 'india', estimatedWaitYears: 8, i140Approved: 'approved',
      i485Filed: 'no', h1bYearsRemaining: 2, currentSalary: 130000, opportunitySalary: 150000,
      annualRaise: 3, opportunityGrowthPct: 4, mobilityRestriction: 2000,
      h1bExtensionCost: 4500, h1bExtensionFreqYears: 3, otherAnnualImmigCost: 1500,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '137-qbi-199a-optimizer',
    toolHtml: REPO + 'tools/137-qbi-199a-optimizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/137-qbi-199a-optimizer.golden.json',
    fields: {
      qbi: 150000, taxableIncome: 230000, filingStatus: 'single', sstb: 'no',
      w2Wages: 40000, ubia: 100000, threshold: 201775, phaseoutBand: 75000,
    },
    kernelInputs: {
      qbi: 150000, taxableIncome: 230000, filingStatus: 'single', sstb: 'no',
      w2Wages: 40000, ubia: 100000, threshold: 201775, phaseoutBand: 75000,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '138-scorp-reasonable-comp',
    toolHtml: REPO + 'tools/138-scorp-reasonable-comp/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/138-scorp-reasonable-comp.golden.json',
    fields: {
      industry: 'consulting', role: 'sole_owner',
      netIncome: 150000, proposedSalary: 70000, filingStatus: 'single', customBenchmark: 90000,
    },
    kernelInputs: {
      netIncome: 150000, proposedSalary: 70000, filingStatus: 'single', customBenchmark: 90000,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '139-home-office-augusta',
    toolHtml: REPO + 'tools/139-home-office-augusta/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/139-home-office-augusta.golden.json',
    fields: {
      officeSqFt: 200, homeSqFt: 2000, businessUsePct: '', annualRent: 24000, utilities: 3600,
      otherHomeExp: 1200, grossIncome: 120000, entityTypeHO: 'scorp',
      rentalDays: 10, dailyRentalRate: 1000, corpTaxRate: 21, ownerMarginalRate: 32, entityTypeAug: 'scorp',
    },
    kernelInputs: {
      officeSqFt: 200, homeSqFt: 2000, businessUsePct: '', annualRent: 24000, utilities: 3600,
      otherHomeExp: 1200, grossIncome: 120000, entityTypeHO: 'scorp',
      rentalDays: 10, dailyRentalRate: 1000, corpTaxRate: 21, ownerMarginalRate: 32, entityTypeAug: 'scorp',
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '125-gi-bill-benefit-maximizer',
    toolHtml: REPO + 'tools/125-gi-bill-benefit-maximizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/125-gi-bill-benefit-maximizer.golden.json',
    fields: {
      giBillChapter: '33', eligibilityPct: 1.0, schoolType: 'public', annualTuition: 12000,
      bahRate: 2200, yellowRibbon: 0, programYears: 4, partTimeIncome: 800, altIncome: 3800,
      postDegSalary: 70000, altSalary: 52000, salaryGrowth: 3, modelYears: 10, taxRate: 22,
    },
    kernelInputs: {
      giBillChapter: '33', eligibilityPct: 1.0, schoolType: 'public', annualTuition: 12000,
      bahRate: 2200, yellowRibbon: 0, programYears: 4, partTimeIncome: 800, altIncome: 3800,
      postDegSalary: 70000, altSalary: 52000, salaryGrowth: 3, modelYears: 10, taxRate: 22,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '126-skillbridge-credential-transfer-roi',
    toolHtml: REPO + 'tools/126-skillbridge-credential-transfer-roi/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/126-skillbridge-credential-transfer-roi.golden.json',
    // fake DOM's querySelectorAll('.cred-block') returns [] (no live credential rows) —
    // getCredentials() yields an empty array in BOTH the browser sandbox and the kernel.
    fields: {
      milPay: 4800, civSalary: 75000, gapMonths: 1, salaryGrowth: 3.5, taxRate: 22,
      projYears: 5, sbMonths: 4, sbOffer: 85000, sbConvPct: 70,
    },
    kernelInputs: {
      civSalary: 75000, salaryGrowth: 3.5, taxRate: 22, projYears: 5,
      sbMonths: 4, sbOffer: 85000, sbConvPct: 70, creds: [],
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '127-veteran-income-bridge',
    toolHtml: REPO + 'tools/127-veteran-income-bridge/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/127-veteran-income-bridge.golden.json',
    fields: {
      sepType: 'involuntary', yos: 8, basePay: 4200, age: 30, disabilityRating: 30,
      gapMonths: 3, severanceLump: 0, tspBalance: 45000, tspMonthly: 500, spouseIncome: 1500,
      uiMonthly: 1800, bridgeIncome: 0, savingsAvail: 15000, monthlyExpenses: 5500,
      civSalary: 72000, taxRate: 22, modelMonths: 18,
    },
    kernelInputs: {
      sepType: 'involuntary', yos: 8, basePay: 4200, age: 30, disabilityRating: 30,
      gapMonths: 3, severanceLump: 0, tspMonthly: 500, spouseIncome: 1500,
      uiMonthly: 1800, bridgeIncome: 0, savingsAvail: 15000, monthlyExpenses: 5500,
      civSalary: 72000, taxRate: 22, modelMonths: 18,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '131-parental-leave-income-gap',
    toolHtml: REPO + 'tools/131-parental-leave-income-gap/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/131-parental-leave-income-gap.golden.json',
    fields: {
      baseSalary: 85000, taxRate: 22, monthlyExpenses: 6500, partnerIncome: 4000, savings: 20000,
      employerPaidWeeks: 6, employerPartialWeeks: 4, employerPartialPct: 60, stateProgram: 'ca',
      statePflWeeks: 8, customPflRate: 60, totalLeaveWeeks: 16, babyExpense: 300,
    },
    kernelInputs: {
      baseSalary: 85000, taxRate: 22, monthlyExpenses: 6500, partnerIncome: 4000, savings: 20000,
      employerPaidWeeks: 6, employerPartialWeeks: 4, employerPartialPct: 60, stateProgram: 'ca',
      statePflWeeks: 8, customPflRate: 60, totalLeaveWeeks: 16, babyExpense: 300,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '134-cobra-vs-aca-optimizer',
    toolHtml: REPO + 'tools/134-cobra-vs-aca-optimizer/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/134-cobra-vs-aca-optimizer.golden.json',
    fields: {
      cobraMonthly: 650, benchmarkMonthly: 550, coverageMonths: 12, agi: 45000,
      householdSize: 2, stateAK: 'lower48', hsaToggle: false,
    },
    kernelInputs: {
      cobraMonthly: 650, benchmarkMonthly: 550, coverageMonths: 12, estimatedAGI: 45000,
      householdSize: 2, state: 'lower48',
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    // _detmath integer-exponent tier: browser uses Math.pow(1+rate, int), kernel uses ipow (loop-mult).
    tool_id: '121-teacher-pension-estimator',
    toolHtml: REPO + 'tools/121-teacher-pension-estimator/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/121-teacher-pension-estimator.golden.json',
    fields: {
      multiplier: 2, vestingYears: 5, fasType: 3, currentYears: 10, plannedRetYears: 30,
      currentSalary: 62000, salaryGrowthPct: 3, estYearsInRetirement: 25, pensionCola: 2, discountRate: 4,
    },
    kernelInputs: {
      multiplier: 2, vestingYears: 5, fasType: 3, currentYears: 10, plannedRetYears: 30,
      currentSalary: 62000, salaryGrowthPct: 3, estYearsInRetirement: 25, pensionCola: 2, discountRate: 4,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '119-educator-advanced-degree-roi',
    toolHtml: REPO + 'tools/119-educator-advanced-degree-roi/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/119-educator-advanced-degree-roi.golden.json',
    fields: {
      totalTuition: 18000, monthsToComplete: 24, employerAssistPct: 0, studyHoursPerWeek: 10,
      currentLaneSalary: 58000, laneBump: 4500, yearsToRetirement: 20, discountRate: 4.0,
      colaPct: 2.0, pensionMultiplier: 2.0, tlfEligible: false, tlfAmount: 0,
    },
    kernelInputs: {
      totalTuition: 18000, monthsToComplete: 24, employerAssistPct: 0, studyHoursPerWeek: 10,
      currentLaneSalary: 58000, laneBump: 4500, yearsToRetirement: 20, discountRate: 4.0,
      colaPct: 2.0, pensionMultiplier: 2.0, tlfEligible: false, tlfAmount: 0,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    // _detmath integer-exponent tier: browser uses Math.pow(1+rate, int), kernel uses ipow (loop-mult).
    tool_id: '122-trade-wage-progression-projector',
    toolHtml: REPO + 'tools/122-trade-wage-progression-projector/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/122-trade-wage-progression-projector.golden.json',
    fields: {
      trade: 'electrician', currentStage: 'apprentice', journeymanWage: 31.00, apprenticeYears: 4,
      masterPremium: 25, weeklyHours: 40, otHours: 100, annualRaise: 2.5, yearsProject: 20,
      currentYear: 1, degreeCost: 40000, degreeStartSalary: 55000, degreeRaise: 3,
    },
    kernelInputs: {
      trade: 'electrician', currentStage: 'apprentice', journeymanWage: 31.00, apprenticeYears: 4,
      masterPremium: 25, weeklyHours: 40, otHours: 100, annualRaise: 2.5, yearsProject: 20,
      currentYear: 1, degreeCost: 40000, degreeStartSalary: 55000, degreeRaise: 3,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    // _detmath integer-exponent tier: browser uses Math.pow(1+rate, int) in npvCalc, kernel uses ipow.
    // The browser's calculate() loops fixed ids 1-4 unconditionally (getElementById never returns
    // null in the fake DOM harness), so ids 2-4 (absent from `fields`) come back as all-zero certs
    // named "Cert #2".."Cert #4" (empty .value -> falls back to that name, all numeric .value ""
    // -> parseFloat NaN -> || 0). The kernel's `certs` array mirrors that exact 4-cert shape so
    // both sides sum/rank the same all-zero entries alongside the one real cert.
    tool_id: '123-trade-specialization-roi',
    toolHtml: REPO + 'tools/123-trade-specialization-roi/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/123-trade-specialization-roi.golden.json',
    fields: {
      currentEarnings: 62000, yearsRemaining: 20, discountRate: 4.0,
      'certName-1': 'OSHA 30', 'cost-1': 500, 'premium-1': 2000, 'newWork-1': 1500,
      'renewCost-1': 100, 'renewYears-1': 3,
    },
    kernelInputs: {
      currentEarnings: 62000, yearsRemaining: 20, discountRate: 4.0,
      certs: [
        { name: 'OSHA 30', cost: 500, premium: 2000, newWork: 1500, renewCost: 100, renewYears: 3 },
        { name: 'Cert #2', cost: 0, premium: 0, newWork: 0, renewCost: 0, renewYears: 0 },
        { name: 'Cert #3', cost: 0, premium: 0, newWork: 0, renewCost: 0, renewYears: 0 },
        { name: 'Cert #4', cost: 0, premium: 0, newWork: 0, renewCost: 0, renewYears: 0 },
      ],
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    // FRACTIONAL-EXPONENT _detmath tier: browser (patched to inline _detmath) AND kernel both
    // use det.pow for the fractional discount exponent (certYear = prepMonths/12) -> bit-identical.
    tool_id: '120-nbct-roi-calculator',
    toolHtml: REPO + 'tools/120-nbct-roi-calculator/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/120-nbct-roi-calculator.golden.json',
    fields: {
      assessFee: 1900, retakesCost: 475, prepHoursPerWeek: 6, prepMonths: 10, currentHourlyRate: 35,
      annualStipend: 5000, stipendYears: 10, renewalCost: 1250, renewalYear: 5, discountRate: 4,
    },
    kernelInputs: {
      assessFee: 1900, retakesCost: 475, prepHoursPerWeek: 6, prepMonths: 10, currentHourlyRate: 35,
      annualStipend: 5000, stipendYears: 10, renewalCost: 1250, renewalYear: 5, discountRate: 4,
    },
    goldenGeneratedAt: '2026-07-04T00:00:00.000Z',
  },
  {
    tool_id: '141-equity-exit-waterfall',
    toolHtml: REPO + 'tools/141-equity-exit-waterfall/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/141-equity-exit-waterfall.golden.json',
    fields: {
      exitValuation: 80000000, totalInvested: 15000000, preferredOwnership: 30,
      prefMultiple: 1, participationType: 'non', participationCap: 3,
      yourRole: 'founder', yourOwnership: 8, yourStrikeTotal: 20000, yourCostBasis: 5000,
    },
    kernelInputs: {
      exitValuation: 80000000, totalInvested: 15000000, preferredOwnership: 30,
      prefMultiple: 1, participationType: 'non', participationCap: 3,
      yourRole: 'founder', yourOwnership: 8, yourStrikeTotal: 20000, yourCostBasis: 5000,
    },
    goldenGeneratedAt: '2026-07-05T00:00:00.000Z',
  },
  {
    tool_id: '142-qsbs-1202-estimator',
    toolHtml: REPO + 'tools/142-qsbs-1202-estimator/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/142-qsbs-1202-estimator.golden.json',
    // NOTE: the parity harness's fake DOM hardcodes `.checked` to false for every
    // element (see makeDocument/elFor below) — it does not thread `fields` through
    // checkbox state. So the browser side always sees all six eligibility booleans
    // as false, regardless of what's requested here. kernelInputs mirrors that so
    // both sides compute the same (not-eligible) case.
    fields: {
      acquireDate: 'obbba', grossAssets: 40, holdYears: 4, costBasis: 100000,
      saleProceeds: 4000000, ltcgRate: 0.238, stateRate: 5,
      isCCorp: true, isOriginalIssue: true, isActiveBusiness: true,
      cashOrService: true, notPublic: true, noRepurchase: true,
    },
    kernelInputs: {
      acquireDate: 'obbba', grossAssets: 40, holdYears: 4, costBasis: 100000,
      saleProceeds: 4000000, ltcgRate: 0.238, stateRate: 5,
      isCCorp: false, isOriginalIssue: false, isActiveBusiness: false,
      cashOrService: false, notPublic: false, noRepurchase: false,
    },
    goldenGeneratedAt: '2026-07-05T00:00:00.000Z',
  },
  {
    tool_id: '144-h1b-job-change-risk',
    toolHtml: REPO + 'tools/144-h1b-job-change-risk/index.html',
    goldenPath: REPO + 'chaingraph/kernels/fixtures/144-h1b-job-change-risk.golden.json',
    fields: {
      h1bStatus: 'active', i94Expiry: 10, priorityDate: 'yes_backlogged', yearsOnH1b: 4,
      nationality: 'india', currentSalary: 120000, newSalary: 150000, signingBonus: 10000,
      startStrategy: 'portability', gapWeeks: 0, attorneyFee: 3000, uscisFilingFee: 780,
      premiumProcessing: 2805, paidByEmployer: 'employer', transferTimeline: 8,
    },
    kernelInputs: {
      h1bStatus: 'active', i94Expiry: 10, priorityDate: 'yes_backlogged', yearsOnH1b: 4,
      nationality: 'india', currentSalary: 120000, newSalary: 150000, signingBonus: 10000,
      startStrategy: 'portability', gapWeeks: 0, attorneyFee: 3000, uscisFilingFee: 780,
      premiumProcessing: 2805, paidByEmployer: 'employer', transferTimeline: 8,
    },
    goldenGeneratedAt: '2026-07-05T00:00:00.000Z',
  },
];

// ─── permissive fake DOM so the tool's render() churn runs harmlessly ──────────
function permissiveProxy() {
  const target = function () {};
  const p = new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'length') return 0;
      if (prop === 'value' || prop === 'textContent' || prop === 'innerHTML') return '';
      if (prop === 'checked') return false;
      return p; // any property or method → the same callable permissive proxy
    },
    set() { return true; },
    apply() { return p; },
    has() { return true; },
  });
  return p;
}

function makeDocument(fields) {
  const PERM = permissiveProxy();
  const elFor = (id) => {
    const has = Object.prototype.hasOwnProperty.call(fields, id);
    const val = has ? String(fields[id]) : '';
    const target = function () {};
    return new Proxy(target, {
      get(_t, prop) {
        if (prop === 'value') return val;
        if (prop === 'checked') return false;
        if (prop === Symbol.toPrimitive) return () => val;
        return PERM[prop];
      },
      set() { return true; },
      apply() { return PERM; },
      has() { return true; },
    });
  };
  return {
    getElementById: elFor,
    querySelector: () => PERM,
    querySelectorAll: () => [],
    createElement: () => PERM,
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    body: PERM,
    documentElement: PERM,
    addEventListener: () => {},
    createElementNS: () => PERM,
  };
}

// Extract the <script> block that defines the tool's compute+export path.
// Most tools name their calc entry `calculate()`; some (e.g. 109 `calcISOAMT`) differ —
// a case may set `calcFn` to override the required/invoked name.
function extractComputeScript(html, calcFn = 'calculate') {
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const calcRe = new RegExp('function\\s+' + calcFn + '\\b');
  const block = blocks.find((b) => /function\s+exportAP2\b/.test(b) && calcRe.test(b));
  if (!block) throw new Error(`Could not find the ${calcFn}()+exportAP2() <script> block in the tool HTML.`);
  return block;
}

async function runBrowserArtifact(caseDef) {
  const html = readFileSync(caseDef.toolHtml, 'utf8');
  const calcFn = caseDef.calcFn || 'calculate';
  const script = extractComputeScript(html, calcFn);

  const sandbox = {
    console,
    Math, JSON, Number, parseFloat, parseInt, isNaN, isFinite, Infinity, NaN, String, Array, Object, Boolean, Date,
    ArrayBuffer, Float64Array, Float32Array, Uint32Array, Int32Array, Uint8Array,   // _detmath fdlibm bit ops
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder,
    URLSearchParams,
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
    Blob: function () {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    alert: () => {},
    location: { search: '', href: '', hash: '' },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    navigator: { language: 'en-US', languages: ['en-US'], userAgent: 'node' },
    history: { pushState: () => {}, replaceState: () => {} },
    document: makeDocument(caseDef.fields),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // After the tool's code, capture the artifact JSON instead of triggering a download,
  // by TWO universal hooks (defined INSIDE the vm so their globalThis is the sandbox):
  //   - reassign dlFile   → tools that download via the dlFile() helper (e.g. tool-40).
  //   - reassign Blob      → tools that build `new Blob([JSON.stringify(...)])` inline
  //                          then a.click() (e.g. tool-129). exportAP2 makes exactly one
  //                          Blob, so the last capture is the artifact.
  // Then an async runner walks the REAL path: calculate() populates _lastResult(s),
  // exportAP2() assembles the exact preimage + hash.
  const harness = `
;dlFile = function (_name, content) { globalThis.__captured = content; };
globalThis.Blob = function (parts) { try { globalThis.__captured = Array.isArray(parts) ? parts.map(String).join('') : String(parts); } catch (_e) {} };
globalThis.__run = async function () {
  ${calcFn}();
  await exportAP2();
  return globalThis.__captured;
};
`;
  const context = vm.createContext(sandbox);
  vm.runInContext(script + harness, context, { filename: caseDef.tool_id + '.tool.js' });
  const json = await sandbox.__run();
  if (!json) throw new Error('Browser exportAP2() produced no artifact (validation may have failed).');
  return JSON.parse(json);
}

const canonEq = (a, b) => JSON.stringify(cgCanon(a)) === JSON.stringify(cgCanon(b));

async function verifyCase(caseDef, write) {
  const browser = await runBrowserArtifact(caseDef);
  const kernel = getKernel(caseDef.tool_id);
  if (!kernel) throw new Error(`No kernel registered for ${caseDef.tool_id}`);
  const kArt = await kernel.buildArtifact(caseDef.kernelInputs, { now: caseDef.goldenGeneratedAt });

  const hashEq = browser.execution_hash === kArt.execution_hash;
  const ppEq = canonEq(browser.policy_parameters, kArt.policy_parameters);
  const opEq = canonEq(browser.output_payload, kArt.output_payload);

  console.log(`\n── ${caseDef.tool_id} ──`);
  console.log(`  browser execution_hash : ${browser.execution_hash}`);
  console.log(`  kernel  execution_hash : ${kArt.execution_hash}`);
  console.log(`  execution_hash byte-equal : ${hashEq ? 'PASS' : 'FAIL'}`);
  console.log(`  policy_parameters equal   : ${ppEq ? 'PASS' : 'FAIL'}`);
  console.log(`  output_payload equal      : ${opEq ? 'PASS' : 'FAIL'}`);

  if (!hashEq || !ppEq || !opEq) {
    if (!ppEq) {
      console.log('  browser pp:', JSON.stringify(browser.policy_parameters));
      console.log('  kernel  pp:', JSON.stringify(kArt.policy_parameters));
    }
    if (!opEq) {
      console.log('  browser op:', JSON.stringify(browser.output_payload));
      console.log('  kernel  op:', JSON.stringify(kArt.output_payload));
    }
    return false;
  }

  if (write) {
    // Regenerate the repo golden from the REAL browser artifact (real calc numbers),
    // with generated_at pinned for a reproducible file. hash-freeze recomputes the hash
    // from policy_parameters+output_payload, so the pinned timestamp does not affect it.
    const golden = { ...browser, generated_at: caseDef.goldenGeneratedAt };
    writeFileSync(caseDef.goldenPath, JSON.stringify(golden, null, 2) + '\n');
    console.log(`  ✓ golden regenerated from REAL calc → ${caseDef.goldenPath.replace(REPO, 'repo/')}`);
  }
  return true;
}

const write = process.argv.includes('--write');
let allPass = true;
for (const c of CASES) {
  try {
    const ok = await verifyCase(c, write);
    allPass = allPass && ok;
  } catch (e) {
    console.error(`\n✗ ${c.tool_id}: ${e.stack || e.message}`);
    allPass = false;
  }
}
console.log(`\n${allPass ? '✓ KERNEL-PARITY: all cases byte-exact (browser calc == kernel).' : '✗ KERNEL-PARITY: FAILED — do not commit.'}`);
process.exit(allPass ? 0 : 1);
