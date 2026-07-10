// Kernel registry — maps a ChainGraph node tool_id to its pure server-side kernel.
// The Worker imports this and dispatches gpu:false, kernel-backed nodes to compute
// server-side (run_chain). Browser-only nodes report no_kernel_browser_only; gpu
// nodes report gpu_browser_only. Extend as kernels are extracted (D1.2 batch).

import * as t40 from './40-gig-income-optimizer.kernel.mjs';
import * as t125 from './125-gi-bill-benefit-maximizer.kernel.mjs';
import * as t126 from './126-skillbridge-credential-transfer-roi.kernel.mjs';
import * as t127 from './127-veteran-income-bridge.kernel.mjs';
import * as t131 from './131-parental-leave-income-gap.kernel.mjs';
import * as t133 from './133-shift-differential-overtime-optimizer.kernel.mjs';
import * as t135 from './135-option-exercise-window.kernel.mjs';
import * as t136 from './136-severance-ui-timing.kernel.mjs';
import * as t140 from './140-83b-election-decision.kernel.mjs';
import * as t124 from './124-contractor-launch-break-even.kernel.mjs';
import * as t130 from './130-dependent-care-fsa-cdctc-optimizer.kernel.mjs';
import * as t132 from './132-travel-nurse-vs-staff-comp.kernel.mjs';
import * as t134 from './134-cobra-vs-aca-optimizer.kernel.mjs';
import * as t137 from './137-qbi-199a-optimizer.kernel.mjs';
import * as t138 from './138-scorp-reasonable-comp.kernel.mjs';
import * as t139 from './139-home-office-augusta.kernel.mjs';
import * as t143 from './143-federal-buyout-decision.kernel.mjs';
import * as t145 from './145-greencard-wait-cost.kernel.mjs';
import * as t121 from './121-teacher-pension-estimator.kernel.mjs';
import * as t119 from './119-educator-advanced-degree-roi.kernel.mjs';
import * as t122 from './122-trade-wage-progression-projector.kernel.mjs';
import * as t123 from './123-trade-specialization-roi.kernel.mjs';
import * as t120 from './120-nbct-roi-calculator.kernel.mjs';
import * as t118 from './118-teacher-salary-schedule-projector.kernel.mjs';
import * as t141 from './141-equity-exit-waterfall.kernel.mjs';
import * as t142 from './142-qsbs-1202-estimator.kernel.mjs';
import * as t144 from './144-h1b-job-change-risk.kernel.mjs';
import * as t109 from './109-iso-amt-exposure-modeler.kernel.mjs';
import * as t128 from './128-raise-ask-ev-calculator.kernel.mjs';
import * as t129 from './129-promotion-vs-job-hop.kernel.mjs';
import * as t38 from './38-early-career-net-worth-engine.kernel.mjs';
import * as t36 from './36-workforce-pell-eligibility-screener.kernel.mjs';
import * as t102 from './102-grad-loan-cap-gap-planner.kernel.mjs';
import * as tSc1 from './sc1-hash-seeded-generative-art.kernel.mjs';
import * as tSc2 from './sc2-arg-puzzle-gates.kernel.mjs';

export const KERNELS = {
  'sc1-hash-seeded-generative-art': tSc1,
  'sc2-arg-puzzle-gates': tSc2,
  '118-teacher-salary-schedule-projector': t118,
  '119-educator-advanced-degree-roi': t119,
  '120-nbct-roi-calculator': t120,
  '121-teacher-pension-estimator': t121,
  '122-trade-wage-progression-projector': t122,
  '123-trade-specialization-roi': t123,
  '40-gig-income-optimizer': t40,
  '124-contractor-launch-break-even': t124,
  '125-gi-bill-benefit-maximizer': t125,
  '126-skillbridge-credential-transfer-roi': t126,
  '127-veteran-income-bridge': t127,
  '131-parental-leave-income-gap': t131,
  '130-dependent-care-fsa-cdctc-optimizer': t130,
  '132-travel-nurse-vs-staff-comp': t132,
  '133-shift-differential-overtime-optimizer': t133,
  '134-cobra-vs-aca-optimizer': t134,
  '135-option-exercise-window': t135,
  '136-severance-ui-timing': t136,
  '137-qbi-199a-optimizer': t137,
  '138-scorp-reasonable-comp': t138,
  '139-home-office-augusta': t139,
  '140-83b-election-decision': t140,
  '143-federal-buyout-decision': t143,
  '145-greencard-wait-cost': t145,
  '141-equity-exit-waterfall': t141,
  '142-qsbs-1202-estimator': t142,
  '144-h1b-job-change-risk': t144,
  '109-iso-amt-exposure-modeler': t109,
  '128-raise-ask-ev-calculator': t128,
  '129-promotion-vs-job-hop': t129,
  '38-early-career-net-worth-engine': t38,
  '36-workforce-pell-eligibility-screener': t36,
  '102-grad-loan-cap-gap-planner': t102,
};

export function getKernel(tool_id) {
  return KERNELS[tool_id] ?? null;
}
