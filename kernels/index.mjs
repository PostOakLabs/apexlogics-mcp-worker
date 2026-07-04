// Kernel registry — maps a ChainGraph node tool_id to its pure server-side kernel.
// The Worker imports this and dispatches gpu:false, kernel-backed nodes to compute
// server-side (run_chain). Browser-only nodes report no_kernel_browser_only; gpu
// nodes report gpu_browser_only. Extend as kernels are extracted (D1.2 batch).

import * as t40 from './40-gig-income-optimizer.kernel.mjs';
import * as t133 from './133-shift-differential-overtime-optimizer.kernel.mjs';

export const KERNELS = {
  '40-gig-income-optimizer': t40,
  '133-shift-differential-overtime-optimizer': t133,
};

export function getKernel(tool_id) {
  return KERNELS[tool_id] ?? null;
}
