/**
 * pilot.mjs — Single source of truth for ApexLogics MCP tool definitions.
 * Edit this file to add/remove/change tools, then run: node generate.mjs && npx wrangler deploy
 */

import { z } from "zod";

// ── Tool schemas (Zod raw shapes for McpServer.tool()) ─────────────────────

export const TOOL_SCHEMAS = {
  list_apexlogics_tools: {
    description:
      "Search the ApexLogics catalog of {COUNT} deterministic, privacy-first edtech and careertech tools. Returns tool names, descriptions, URLs, and AP2 mandate types. Use to find the right calculator for any career, education, compensation, licensing, immigration, or workforce question.",
    params: {
      query: z
        .string()
        .optional()
        .describe(
          "Keyword search — matches title, description, category, and AL-ID. Omit to list all."
        ),
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category slug. Options: education_path_roi, compensation_offers, career_transition_mobility, licensing_credentials, student_finance_debt, workforce_development, immigration_visa, selected_studies, hr_analytics, obbba_student_loans, equity_tax, freelance_tax."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Max results to return (default 20, max 50)."),
    },
  },

  build_workflow_links: {
    description:
      "Return ordered, deep-link URLs for a named multi-tool ApexLogics workflow chain. Each step includes the tool URL and a handoff note describing which outputs feed the next step. Omit workflow to list all available chains.",
    params: {
      workflow: z
        .string()
        .optional()
        .describe(
          "Workflow chain ID — e.g. 'mba-decision', 'offer-evaluation', 'equity-tax', 'student-loan-strategy'. Omit to list all available chains."
        ),
    },
  },
};

// ── Workflow chains — edit here to add/remove chains ──────────────────────

export const WORKFLOWS = {
  "career-pivot": {
    description: "End-to-end career pivot analysis",
    steps: [
      { tool: "career-transition-suite", note: "Map transferable skills and gap score" },
      { tool: "credential-roi-suite", note: "Evaluate credential ROI for target role" },
      { tool: "offer-negotiation-suite", note: "Model target comp for pivot role" },
    ],
  },
  "mba-decision": {
    description: "Full MBA ROI and fit analysis",
    steps: [
      { tool: "mba-program-fit-ranker", note: "Rank programs by fit score" },
      { tool: "graduate-school-roi-comparator", note: "Run NPV/IRR vs. opportunity cost" },
      { tool: "student-loan-repayment-optimizer", note: "Model post-MBA debt repayment" },
    ],
  },
  "offer-evaluation": {
    description: "Multi-factor offer comparison including equity, benefits, and location",
    steps: [
      { tool: "total-compensation-suite", note: "Normalize total comp across offers" },
      { tool: "equity-compensation-analyzer", note: "Model equity value and vesting" },
      { tool: "benefits-open-enrollment-optimizer", note: "Value benefits package" },
      { tool: "geo-fiscal-arbitrage-simulator", note: "Adjust for cost-of-living delta" },
    ],
  },
  "visa-to-career": {
    description: "International student pathway: visa + credential + job search",
    steps: [
      { tool: "visa-strategy-navigator", note: "Map visa pathway (F-1 / OPT / H-1B)" },
      { tool: "international-student-cost-modeler", note: "Model total cost of attendance" },
      { tool: "graduate-school-roi-comparator", note: "US vs. home-country degree ROI" },
    ],
  },
  "student-loan-strategy": {
    description: "Full student debt strategy including repayment and PSLF",
    steps: [
      { tool: "student-loan-repayment-optimizer", note: "Compare IDR, PSLF, standard paths" },
      { tool: "obbba-rap-calculator", note: "Model OBBBA RAP payment and forgiveness" },
      { tool: "pslf-progress-tracker", note: "Track PSLF qualifying payment count" },
    ],
  },
  "freelance-launch": {
    description: "Full cost and tax picture for going 1099",
    steps: [
      { tool: "freelance-1099-total-cost-calculator", note: "Model true cost including SE tax and benefits gap" },
      { tool: "gig-income-optimizer", note: "Optimize quarterly estimated tax" },
      { tool: "scorp-election-analyzer", note: "Model S-Corp election breakeven" },
    ],
  },
  "salary-negotiation": {
    description: "Data-backed salary negotiation prep",
    steps: [
      { tool: "offer-negotiation-suite", note: "Build BATNA and target range" },
      { tool: "total-compensation-suite", note: "Normalize competing offer comps" },
      { tool: "signing-bonus-clawback-analyzer", note: "Model clawback risk before accepting" },
    ],
  },
  "workforce-pell": {
    description: "Workforce Pell eligibility and credential ROI for program advisors",
    steps: [
      { tool: "workforce-pell-eligibility-screener", note: "Check credential eligibility" },
      { tool: "workforce-pell-credential-ranker", note: "Rank credentials by wage gain" },
      { tool: "workforce-board-roi-report", note: "Program-level ROI for boards" },
    ],
  },
  "equity-tax": {
    description: "Equity compensation tax planning (RSU, ISO, ESPP)",
    steps: [
      { tool: "equity-compensation-analyzer", note: "Model grant value and vest schedule" },
      { tool: "iso-amt-calculator", note: "Model ISO exercise AMT exposure" },
      { tool: "rsu-withholding-optimizer", note: "Optimize RSU withholding elections" },
      { tool: "espp-disposition-analyzer", note: "Compare qualifying vs. disqualifying disposition" },
    ],
  },
  "ai-career-readiness": {
    description: "AI displacement risk and upskilling ROI",
    steps: [
      { tool: "ai-displacement-risk-scorer", note: "Score occupation AI displacement exposure" },
      { tool: "ai-skills-premium-calculator", note: "Model pay premium for AI skill stack" },
      { tool: "credential-roi-suite", note: "ROI on upskilling credential" },
    ],
  },
};
