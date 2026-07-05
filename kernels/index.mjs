// Kernel registry — maps a ChainGraph node tool_id to its pure server-side kernel.
// The Worker imports this and dispatches gpu:false, kernel-backed nodes to compute
// server-side (run_chain). Browser-only nodes report no_kernel_browser_only; gpu
// nodes report gpu_browser_only. Extend as kernels are extracted (D1.2 batch).

import * as t40 from './40-gig-income-optimizer.kernel.mjs';
import * as t133 from './133-shift-differential-overtime-optimizer.kernel.mjs';
import * as t135 from './135-option-exercise-window.kernel.mjs';
import * as t136 from './136-severance-ui-timing.kernel.mjs';
import * as t140 from './140-83b-election-decision.kernel.mjs';
import * as t124 from './124-contractor-launch-break-even.kernel.mjs';
import * as t130 from './130-dependent-care-fsa-cdctc-optimizer.kernel.mjs';
import * as t132 from './132-travel-nurse-vs-staff-comp.kernel.mjs';
import * as t143 from './143-federal-buyout-decision.kernel.mjs';
import * as t145 from './145-greencard-wait-cost.kernel.mjs';

export const KERNELS = {
  '40-gig-income-optimizer': t40,
  '124-contractor-launch-break-even': t124,
  '130-dependent-care-fsa-cdctc-optimizer': t130,
  '132-travel-nurse-vs-staff-comp': t132,
  '133-shift-differential-overtime-optimizer': t133,
  '135-option-exercise-window': t135,
  '136-severance-ui-timing': t136,
  '140-83b-election-decision': t140,
  '143-federal-buyout-decision': t143,
  '145-greencard-wait-cost': t145,
};

export function getKernel(tool_id) {
  return KERNELS[tool_id] ?? null;
}
