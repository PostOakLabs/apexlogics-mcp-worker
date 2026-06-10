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
      "Return ordered, deep-link URLs for a named multi-tool ApexLogics workflow chain — one per live workflow at apexlogics.org/workflows/. Each step includes the tool URL and a handoff note describing which outputs feed the next step. Omit workflow to list all available chains.",
    params: {
      workflow: z
        .string()
        .optional()
        .describe(
          "Workflow chain ID (matches the workflow page slug) — e.g. 'new-offer-suite', 'mba-aspirant-playbook', 'equity-compensation-decisions', 'student-loan-payoff-decisions'. Omit to list all available chains."
        ),
    },
  },
};

// ── Workflow chains ────────────────────────────────────────────────────────
// Keyed by the live workflow-page slug at apexlogics.org/workflows/<id>.html.
// Each step `tool` is the canonical (prefixed) tool slug — i.e. the working
// folder under /tools/<slug>/ — so build_workflow_links emits live URLs.

export const WORKFLOWS = {
  "new-offer-suite": {
    description: "Evaluate a single job offer end-to-end: negotiate, normalize total comp, adjust for location, and value benefits.",
    steps: [
      { tool: "05-offer-negotiation-suite", note: "Set anchor/target/floor and build the counter-offer" },
      { tool: "25-total-compensation-suite", note: "Normalize base + bonus + equity + benefits into one figure" },
      { tool: "26-geo-fiscal-arbitrage-simulator", note: "Adjust for cost-of-living and state tax" },
      { tool: "04-benefits-open-enrollment-optimizer", note: "Value the benefits package" },
    ],
  },
  "career-pivot-playbook": {
    description: "Plan a career pivot: resilience, transferable-skill gap, job-search ROI, and target-comp modeling.",
    steps: [
      { tool: "06-career-resilience-engine", note: "Score automation exposure and resilience" },
      { tool: "07-career-transition-suite", note: "Map transferable skills and gap to target role" },
      { tool: "09-job-search-roi-tracker", note: "Model job-search channel ROI" },
      { tool: "05-offer-negotiation-suite", note: "Build target comp and BATNA for the pivot role" },
    ],
  },
  "grad-school-decision-engine": {
    description: "Decide on grad school: credential ROI, program fit, test prep, NPV vs. opportunity cost, and debt repayment.",
    steps: [
      { tool: "01-credential-roi-suite", note: "Baseline credential ROI for the target role" },
      { tool: "17-mba-program-fit-ranker", note: "Rank programs by fit" },
      { tool: "18-test-prep-investment-analyzer", note: "Model score-gap and prep ROI" },
      { tool: "03-graduate-school-roi-comparator", note: "Run NPV/IRR vs. opportunity cost" },
      { tool: "22-student-loan-repayment-optimizer", note: "Model post-degree debt repayment" },
    ],
  },
  "college-financial-planning-suite": {
    description: "Plan undergrad financing: aid eligibility, parent ROI, scholarships, 529 savings, and loan repayment.",
    steps: [
      { tool: "02-fafsa-sai-simulator", note: "Estimate SAI and aid eligibility" },
      { tool: "20-parent-college-roi-planner", note: "Model parent-side ROI and contribution" },
      { tool: "14-scholarship-roi-tracker", note: "Track scholarship pipeline and lift" },
      { tool: "24-education-savings-projector", note: "Project 529 / education savings" },
      { tool: "22-student-loan-repayment-optimizer", note: "Model residual loan repayment" },
    ],
  },
  "freelance-leap-calculator": {
    description: "Model going 1099: true cost, benefits gap, human-capital value, and rate negotiation.",
    steps: [
      { tool: "23-freelance-1099-total-cost-calculator", note: "Model true cost including SE tax" },
      { tool: "04-benefits-open-enrollment-optimizer", note: "Quantify the lost-benefits gap" },
      { tool: "11-human-capital-engine", note: "Value your human capital / rate floor" },
      { tool: "05-offer-negotiation-suite", note: "Negotiate client rates" },
    ],
  },
  "career-exit-restart-planner": {
    description: "Plan an exit and restart: severance, career-break cost, human capital, and job-search ROI.",
    steps: [
      { tool: "08-severance-decision-engine", note: "Model after-tax severance scenarios" },
      { tool: "10-career-break-reentry-engine", note: "Cost the career break and reentry penalty" },
      { tool: "11-human-capital-engine", note: "Re-value human capital before restart" },
      { tool: "09-job-search-roi-tracker", note: "Plan the job search by channel ROI" },
    ],
  },
  "international-career-navigator": {
    description: "International student-to-career path: cost of attendance, visa strategy, credential ROI, and geo arbitrage.",
    steps: [
      { tool: "19-international-student-cost-modeler", note: "Model total cost of attendance" },
      { tool: "27-visa-strategy-navigator", note: "Map the visa pathway (F-1 / OPT / H-1B)" },
      { tool: "01-credential-roi-suite", note: "Compare credential ROI" },
      { tool: "26-geo-fiscal-arbitrage-simulator", note: "Adjust for location cost and tax" },
    ],
  },
  "credentialing-fast-track": {
    description: "Fast-track a professional credential: license reciprocity, exam cost, CPD tracking, and human-capital value.",
    steps: [
      { tool: "28-professional-license-reciprocity", note: "Find the fastest reciprocity pathway" },
      { tool: "13-exam-cost-planner", note: "Total exam cost-to-pass and timeline" },
      { tool: "12-cpd-credit-tracker", note: "Track CE/CPD to renewal" },
      { tool: "11-human-capital-engine", note: "Value the credential's human-capital lift" },
    ],
  },
  "ai-career-transition-playbook": {
    description: "Navigate AI disruption: skills premium, credential ROI, resilience, and human-capital value.",
    steps: [
      { tool: "29-ai-skills-premium-calculator", note: "Model the AI-skills pay premium" },
      { tool: "01-credential-roi-suite", note: "ROI on the upskilling credential" },
      { tool: "06-career-resilience-engine", note: "Score resilience and automation exposure" },
      { tool: "11-human-capital-engine", note: "Re-value human capital post-upskilling" },
    ],
  },
  "federal-job-decision-suite": {
    description: "Weigh a federal vs. private offer: comp comparison, total comp, geo arbitrage, and benefits.",
    steps: [
      { tool: "30-federal-vs-private-comp-comparator", note: "Compare federal vs. private lifetime value" },
      { tool: "25-total-compensation-suite", note: "Normalize total comp across offers" },
      { tool: "26-geo-fiscal-arbitrage-simulator", note: "Adjust for location cost and tax" },
      { tool: "04-benefits-open-enrollment-optimizer", note: "Value the benefits package" },
    ],
  },
  "education-path-decision-engine": {
    description: "Choose an education path: trade vs. degree, professional-degree ROI, grad-school ROI, and loan repayment.",
    steps: [
      { tool: "31-trade-vs-degree-roi-engine", note: "Compare trade vs. degree ROI" },
      { tool: "34-professional-degree-roi-ranker", note: "Rank professional-degree paths" },
      { tool: "03-graduate-school-roi-comparator", note: "Run grad-school NPV/IRR" },
      { tool: "22-student-loan-repayment-optimizer", note: "Model loan repayment" },
    ],
  },
  "remote-work-relocation-suite": {
    description: "Plan a remote move: multi-state tax, non-compete risk, geo arbitrage, and offer negotiation.",
    steps: [
      { tool: "32-remote-work-tax-mapper", note: "Map multi-state tax exposure" },
      { tool: "33-noncompete-risk-screener", note: "Screen non-compete enforceability risk" },
      { tool: "26-geo-fiscal-arbitrage-simulator", note: "Adjust salary for cost-of-living delta" },
      { tool: "05-offer-negotiation-suite", note: "Negotiate the remote-pay arrangement" },
    ],
  },
  "mba-aspirant-playbook": {
    description: "Full MBA aspirant path: GMAT/GRE choice, test prep, application portfolio, ROI, and loan repayment.",
    steps: [
      { tool: "51-gmat-vs-gre-strategic-choice-engine", note: "Choose GMAT vs. GRE" },
      { tool: "18-test-prep-investment-analyzer", note: "Model prep ROI and score gap" },
      { tool: "47-mba-application-portfolio-optimizer", note: "Optimize the application portfolio" },
      { tool: "03-graduate-school-roi-comparator", note: "Run MBA NPV/IRR" },
      { tool: "22-student-loan-repayment-optimizer", note: "Model post-MBA debt repayment" },
    ],
  },
  "employer-education-benefit-maximizer": {
    description: "Maximize an employer education benefit: tuition reimbursement value, credential ROI, cert renewal, and licensing.",
    steps: [
      { tool: "48-tuition-reimbursement-true-value-calculator", note: "Compute the true value of tuition reimbursement" },
      { tool: "01-credential-roi-suite", note: "ROI on the funded credential" },
      { tool: "41-cert-renewal-forecaster", note: "Forecast renewal cash-flow" },
      { tool: "28-professional-license-reciprocity", note: "Plan license reciprocity" },
    ],
  },
  "law-professional-school-journey": {
    description: "Law / professional-school journey: degree ROI, career-track ROI, retake decision, ISA vs. loan, and repayment.",
    steps: [
      { tool: "34-professional-degree-roi-ranker", note: "Rank professional-degree paths" },
      { tool: "50-law-school-roi-by-career-track", note: "Model law-school ROI by career track" },
      { tool: "46-test-retake-decision-engine", note: "Decide whether to retake the admissions test" },
      { tool: "42-isa-vs-loan-comparator", note: "Compare ISA vs. loan financing" },
      { tool: "22-student-loan-repayment-optimizer", note: "Model loan repayment" },
    ],
  },
  "mid-career-credential-stack-planner": {
    description: "Stack mid-career credentials: skills premium, exec vs. full-time MBA, tuition reimbursement, credential ROI, and resilience.",
    steps: [
      { tool: "29-ai-skills-premium-calculator", note: "Model the skills premium" },
      { tool: "52-exec-mba-vs-fulltime-mba-engine", note: "Compare exec vs. full-time MBA" },
      { tool: "48-tuition-reimbursement-true-value-calculator", note: "Value employer tuition support" },
      { tool: "01-credential-roi-suite", note: "ROI on the credential stack" },
      { tool: "06-career-resilience-engine", note: "Score resilience of the stacked path" },
    ],
  },
  "international-mba-complete-journey": {
    description: "International MBA journey: English test choice, GMAT/GRE, test prep, application portfolio, and STEM-OPT runway.",
    steps: [
      { tool: "54-toefl-ielts-duolingo-choice-engine", note: "Choose the English proficiency test" },
      { tool: "51-gmat-vs-gre-strategic-choice-engine", note: "Choose GMAT vs. GRE" },
      { tool: "18-test-prep-investment-analyzer", note: "Model prep ROI" },
      { tool: "47-mba-application-portfolio-optimizer", note: "Optimize the application portfolio" },
      { tool: "53-stem-opt-financial-runway-planner", note: "Plan STEM-OPT financial runway" },
    ],
  },
  "lsat-to-jd-career-planner": {
    description: "LSAT-to-JD plan: tier match, retake decision, scholarship strategy, law-school ROI, and loan repayment.",
    steps: [
      { tool: "55-lsat-tier-match-planner", note: "Match LSAT score to admissions tier" },
      { tool: "46-test-retake-decision-engine", note: "Decide whether to retake the LSAT" },
      { tool: "56-mba-scholarship-strategy-engine", note: "Plan scholarship strategy" },
      { tool: "50-law-school-roi-by-career-track", note: "Model law-school ROI by track" },
      { tool: "22-student-loan-repayment-optimizer", note: "Model loan repayment" },
    ],
  },
  "mba-ding-comeback-planner": {
    description: "MBA reapplicant comeback: reapplicant EV, retake, GMAT/GRE choice, application portfolio, and scholarship strategy.",
    steps: [
      { tool: "63-mba-reapplicant-ev-engine", note: "Model reapplicant expected value" },
      { tool: "46-test-retake-decision-engine", note: "Decide on a test retake" },
      { tool: "51-gmat-vs-gre-strategic-choice-engine", note: "Reassess GMAT vs. GRE" },
      { tool: "47-mba-application-portfolio-optimizer", note: "Rebuild the application portfolio" },
      { tool: "56-mba-scholarship-strategy-engine", note: "Plan scholarship strategy" },
    ],
  },
  "employer-benefits-decision": {
    description: "Open-enrollment benefits decision: HDHP vs. PPO break-even, plan optimization, and total comp.",
    steps: [
      { tool: "105-hdhp-vs-ppo-break-even", note: "Find the HDHP vs. PPO break-even" },
      { tool: "04-benefits-open-enrollment-optimizer", note: "Optimize the full benefits election" },
      { tool: "25-total-compensation-suite", note: "Fold benefits into total comp" },
    ],
  },
  "corporate-upskilling-roi": {
    description: "Corporate upskilling ROI: credential ROI, workforce-board ROI, and employer training payback.",
    steps: [
      { tool: "01-credential-roi-suite", note: "ROI on the upskilling credential" },
      { tool: "15-workforce-board-roi-report", note: "Program-level ROI for boards" },
      { tool: "106-employer-training-payback", note: "Compute employer training payback" },
    ],
  },
  "ai-displacement-career-transition": {
    description: "AI displacement transition: displacement risk, resilience, credential ROI, and trade vs. degree.",
    steps: [
      { tool: "104-ai-displacement-risk-screener", note: "Score occupation AI displacement risk" },
      { tool: "06-career-resilience-engine", note: "Score resilience and exposure" },
      { tool: "01-credential-roi-suite", note: "ROI on a reskilling credential" },
      { tool: "31-trade-vs-degree-roi-engine", note: "Compare trade vs. degree reskilling ROI" },
    ],
  },
  "employer-talent-retention": {
    description: "Talent retention analysis: turnover cost, retention-investment ROI, total comp, and job-search ROI.",
    steps: [
      { tool: "107-turnover-cost-calculator", note: "Quantify turnover cost" },
      { tool: "108-retention-investment-roi", note: "Model retention-investment ROI" },
      { tool: "25-total-compensation-suite", note: "Benchmark total comp" },
      { tool: "09-job-search-roi-tracker", note: "Model the employee's outside-option ROI" },
    ],
  },
  "equity-compensation-decisions": {
    description: "Equity-comp decisions: RSU withholding gap, ISO/AMT exposure, and ESPP break-even.",
    steps: [
      { tool: "115-rsu-withholding-gap", note: "Model the RSU withholding shortfall" },
      { tool: "109-iso-amt-exposure-modeler", note: "Model ISO exercise AMT exposure" },
      { tool: "110-espp-break-even-optimal-sell", note: "Find ESPP break-even and optimal sell" },
    ],
  },
  "freelance-tax-lifecycle": {
    description: "Freelance tax lifecycle: quarterly estimates, S-corp election, and solo 401(k) vs. SEP-IRA.",
    steps: [
      { tool: "116-freelance-quarterly-estimated-tax", note: "Compute quarterly estimated tax" },
      { tool: "111-scorp-election-break-even", note: "Model S-corp election break-even" },
      { tool: "112-solo-401k-vs-sep-ira", note: "Compare solo 401(k) vs. SEP-IRA" },
    ],
  },
  "student-loan-payoff-decisions": {
    description: "Student-loan payoff strategy: PSLF counter, refinancing break-even, and RAP vs. standard (OBBBA).",
    steps: [
      { tool: "113-pslf-qualifying-payment-counter", note: "Track PSLF qualifying payments" },
      { tool: "114-student-loan-refinancing-break-even", note: "Model refinancing break-even" },
      { tool: "101-rap-vs-standard-decision-engine", note: "Compare OBBBA RAP vs. standard repayment" },
    ],
  },
  "sandwich-generation-career-break": {
    description: "Caregiver career break: income impact and reentry planning for the sandwich generation.",
    steps: [
      { tool: "117-caregiver-income-impact", note: "Model the caregiving income impact" },
      { tool: "10-career-break-reentry-engine", note: "Plan the reentry and penalty recovery" },
    ],
  },
  "teacher-career-compensation": {
    description: "Teacher lifetime compensation: salary schedule, advanced-degree ROI, NBCT ROI, and pension.",
    steps: [
      { tool: "118-teacher-salary-schedule-projector", note: "Project step-and-lane lifetime earnings" },
      { tool: "119-educator-advanced-degree-roi", note: "ROI on an advanced degree / lane change" },
      { tool: "120-nbct-roi-calculator", note: "ROI on National Board certification" },
      { tool: "121-teacher-pension-estimator", note: "Estimate the pension benefit" },
    ],
  },
  "underpaid-stay-and-ask": {
    description: "Underpaid? Decide between asking for a raise and leaving: raise-ask EV vs. promotion-vs-job-hop.",
    steps: [
      { tool: "128-raise-ask-ev-calculator", note: "Model the expected value of a raise ask" },
      { tool: "129-promotion-vs-job-hop", note: "Compare staying for promotion vs. job-hopping" },
    ],
  },
};
