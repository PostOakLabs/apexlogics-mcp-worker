/**
 * pilot.mjs — Single source of truth for ApexLogics MCP tool definitions.
 * Edit this file to add/remove/change tools, then run: node generate.mjs && npx wrangler deploy
 */

import { z } from "zod";

// ── Tool schemas (Zod raw shapes for McpServer.tool()) ─────────────────────

export const TOOL_SCHEMAS = {
  list_apexlogics_tools: {
    description:
      "Search the ApexLogics catalog of {COUNT} deterministic, privacy-first edtech and careertech tools. Returns tool names, descriptions, URLs, and Policy Mandate types. Use to find the right calculator for any career, education, compensation, licensing, immigration, or workforce question.",
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

  verify_execution_hash: {
    description:
      "Independently verify a ChainGraph artifact (ChainGraph Standard v0.1 §6). Recomputes SHA-256 over the canonical (sorted-key, whitespace-stripped) JSON of {policy_parameters, output_payload} and compares it to the claimed execution_hash. Pass a full artifact, or policy_parameters + output_payload + claimed_hash. Works on artifacts from any ChainGraph vendor (ApexLogics, AINumbers, OCS).",
    params: {
      artifact: z
        .record(z.any())
        .optional()
        .describe("A full ChainGraph artifact (with policy_parameters, output_payload, execution_hash)."),
      policy_parameters: z
        .record(z.any())
        .optional()
        .describe("Artifact policy_parameters (if not passing a full artifact)."),
      output_payload: z
        .record(z.any())
        .optional()
        .describe("Artifact output_payload (if not passing a full artifact)."),
      claimed_hash: z
        .string()
        .optional()
        .describe("execution_hash to check against (if not passing a full artifact)."),
    },
  },

  find_tool: {
    description:
      "Ranked BM25 search over the ApexLogics catalog of deterministic, privacy-first edtech and careertech calculators. Returns the best-matching tools with URLs and Policy Mandate types, most relevant first. Use for ONE specific calculator answering a single question — e.g. 'ISO AMT exposure', 'teacher pension estimate', 'H-1B job-change risk', 'freelance quarterly tax'. For a multi-step journey across several tools use find_chain instead; to execute a chain server-side use run_chain; for the full unranked catalog use list_apexlogics_tools.",
    params: {
      query: z
        .string()
        .describe(
          "Natural-language or keyword query describing the single calculation you need (e.g. 'severance after tax', 'QSBS 1202 exclusion', 'RSU withholding gap')."
        ),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe("Max ranked results to return (default 5, max 10)."),
    },
  },

  find_chain: {
    description:
      "Ranked BM25 search over the ApexLogics ChainGraph chains — multi-tool decision journeys that fold several calculators into one composite. Returns matching chains with their ordered steps, most relevant first. Use when the user has a MULTI-STEP goal spanning tools — e.g. 'plan a career pivot', 'equity exit and 83(b)', 'veteran GI Bill transition', 'new job offer end to end'. For a single calculator use find_tool; to run a matched chain server-side use run_chain (pass its name); for human-readable deep-link workflow pages use build_workflow_links.",
    params: {
      query: z
        .string()
        .describe(
          "Natural-language or keyword query describing the multi-step goal (e.g. 'teacher lifetime compensation', 'self-employment tax optimization', 'immigration career planning')."
        ),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe("Max ranked results to return (default 5, max 10)."),
    },
  },

  run_chain: {
    description:
      "Execute a named ApexLogics ChainGraph chain SERVER-SIDE (OpenChainGraph §21). Runs each kernel-backed step deterministically, threads each step's execution_hash into the next step's parent_hashes, and folds the outputs into ONE composite artifact with a reproducible composite_execution_hash. Steps without a server kernel report no_kernel_browser_only (use the browser tool at its URL); GPU steps report gpu_browser_only. Zero network, zero PII. Omit chain to list available chains. Verify any result with verify_execution_hash.",
    params: {
      chain: z
        .string()
        .optional()
        .describe(
          "Chain name from the catalog (chaingraph.chains[].name), e.g. 'education-path-decision-engine'. Omit to list all runnable chains."
        ),
      inputs: z
        .record(z.any())
        .optional()
        .describe(
          "Optional map of step tool_id -> policy_parameters (the tool's raw input fields). Omitted steps fall back to a version-pinned fixture, else {}."
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
  "2026-borrower-decision-journey": {
    description: "2026 student loan borrower decision journey: PSLF eligibility, OBBBA RAP repayment, Grad PLUS cap impact, and payoff strategy.",
    steps: [
      { tool: "113-pslf-qualifying-payment-counter", note: "Check PSLF eligibility window — start here, it changes every downstream decision" },
      { tool: "101-rap-vs-standard-decision-engine", note: "Model income-driven repayment under OBBBA's RAP" },
      { tool: "102-grad-loan-cap-gap-planner", note: "Assess Grad PLUS borrowing cap impact for current/prospective grad students" },
      { tool: "22-student-loan-repayment-optimizer", note: "Compare all repayment plans side-by-side: Standard, Graduated, IDR, RAP, PSLF path" },
      { tool: "22-student-loan-repayment-optimizer", note: "For non-PSLF borrowers: build a payoff acceleration strategy" },
    ],
  },
  "course-design-studio": {
    description: "Design a course or curriculum: Bloom's objectives, pedagogical approach, assessment strategy, ESL/TEFL differentiation, and pacing.",
    steps: [
      { tool: "68-assessment-item-writer", note: "Define learning objectives with Bloom's Taxonomy — drives assessment and pacing downstream" },
      { tool: "67-backward-design-lesson-builder", note: "Choose the pedagogical approach (lecture, flipped, project-based, inquiry-based)" },
      { tool: "68-assessment-item-writer", note: "Design the assessment strategy — formative/summative mix, rubrics, aligned to objectives" },
      { tool: "75-tkt-framework-lesson-stager", note: "Plan ESL/TEFL differentiation and CEFR-aligned delivery, if serving language learners" },
      { tool: "71-first-time-instructor-toolkit", note: "Sequence units and pacing across the semester/course arc" },
    ],
  },
  "equity-exit-planning": {
    description: "Plan an equity exit: 83(b) election timing and tax modeling, then the exit waterfall.",
    steps: [
      { tool: "140-83b-election-decision", note: "Decide on the 83(b) election before the window closes" },
      { tool: "141-equity-exit-waterfall", note: "Model what you'll actually receive at exit" },
    ],
  },
  "immigration-career-planner": {
    description: "Plan an immigration-linked career path: H-1B job-change risk and green-card backlog wait cost.",
    steps: [
      { tool: "144-h1b-job-change-risk", note: "Plan a job change without losing work authorization" },
      { tool: "145-greencard-wait-cost", note: "Model wait time and career decisions around the green-card backlog" },
    ],
  },
  "job-separation-financial-playbook": {
    description: "Job separation financial playbook: cheapest health coverage path, severance/UI sequencing, and option exercise window.",
    steps: [
      { tool: "134-cobra-vs-aca-optimizer", note: "Find the cheapest health coverage path (COBRA vs. ACA)" },
      { tool: "136-severance-ui-timing", note: "Sequence severance to maximize unemployment benefits" },
      { tool: "135-option-exercise-window", note: "Model option exercise before the post-termination window closes" },
    ],
  },
  "nurse-shift-travel-comp": {
    description: "Nurse shift and travel compensation: staff-vs-travel comparison, travel nurse total comp, shift differential/OT optimization, and total comp.",
    steps: [
      { tool: "90-counter-offer-decision-engine", note: "Compare travel vs. staff net pay, including tax-free stipends and travel costs" },
      { tool: "132-travel-nurse-vs-staff-comp", note: "Model detailed travel nurse total compensation — base rate, housing/M&IE stipends, gap weeks" },
      { tool: "133-shift-differential-overtime-optimizer", note: "Optimize shift schedule for maximum net pay, correctly stacking FLSA OT with differentials" },
      { tool: "25-total-compensation-suite", note: "Model total compensation across offers — benefits, 403(b) match, PTO, education benefits" },
    ],
  },
  "qsbs-federal-career-transition": {
    description: "QSBS exclusion modeling and federal-employee buyout decision for a career transition.",
    steps: [
      { tool: "142-qsbs-1202-estimator", note: "Model the §1202 gain exclusion under OBBBA tiered rates" },
      { tool: "143-federal-buyout-decision", note: "Model VSIP buyout acceptance vs. staying to full retirement" },
    ],
  },
  "self-employment-tax-optimizer": {
    description: "Self-employment tax optimization: QBI pass-through deduction, S-corp reasonable-comp split, and home office/Augusta Rule.",
    steps: [
      { tool: "137-qbi-199a-optimizer", note: "Calculate the QBI §199A pass-through deduction" },
      { tool: "138-scorp-reasonable-comp", note: "Find the optimal S-corp salary/distribution split" },
      { tool: "139-home-office-augusta", note: "Claim home office and Augusta Rule deductions" },
    ],
  },
  "skilled-trades-career-builder": {
    description: "Skilled trades career path: apprentice-to-master wage projection, certification ROI ranking, and contractor launch break-even.",
    steps: [
      { tool: "122-trade-wage-progression-projector", note: "Project the apprentice → journeyman → master wage arc vs. a 4-year degree" },
      { tool: "123-trade-specialization-roi", note: "Rank certifications (EPA 608, Master Electrician, AWS Welder, NICET) by NPV and payback" },
      { tool: "124-contractor-launch-break-even", note: "Model the billable-rate floor and break-even month for going independent" },
    ],
  },
  "veteran-transition-gi-bill": {
    description: "Veteran military-to-civilian transition: GI Bill benefit maximization, SkillBridge/credential transfer ROI, and income bridge.",
    steps: [
      { tool: "125-gi-bill-benefit-maximizer", note: "Maximize GI Bill benefit (Ch. 33 vs. Ch. 30) — tuition, BAH, Yellow Ribbon, books" },
      { tool: "126-skillbridge-credential-transfer-roi", note: "Rank SkillBridge internships and MAP/ACE credential transfers by ROI" },
      { tool: "127-veteran-income-bridge", note: "Map the income bridge during the transition gap — severance, VA disability, TSP, UI" },
    ],
  },
  "working-parent-childcare": {
    description: "Working parent childcare and leave planning: income gap during leave, dependent care tax optimization, and post-leave total comp.",
    steps: [
      { tool: "05-offer-negotiation-suite", note: "Model the income gap during parental leave — employer paid leave, state PFL/SDI, FMLA" },
      { tool: "130-dependent-care-fsa-cdctc-optimizer", note: "Optimize Dependent Care FSA vs. CDCTC for the childcare tax strategy" },
      { tool: "131-parental-leave-income-gap", note: "Plan the week-by-week parental leave income bridge and savings needed" },
      { tool: "25-total-compensation-suite", note: "Model total compensation on return, including new childcare costs" },
    ],
  },
  "program-evaluation-journey": {
    description: "Evaluate a workforce program end-to-end: design the study, verify the identification assumptions, net out deadweight and substitution, build the DOL cost-per-outcome ladder, and report board-facing ROI against WIOA targets.",
    steps: [
      { tool: "81-survey-study-designer", note: "Sharpen the research question and fix the sampling strategy and sample size the evaluation runs on" },
      { tool: "173-parallel-trends-placebo-checker", note: "Enter 3 or more pre-treatment periods for treatment and control to test the pre-trend assumption before trusting the estimate" },
      { tool: "172-lurking-variable-reversal-detector", note: "Paste the stratified 2x2 outcome table to check the pooled result survives stratification" },
      { tool: "171-counterfactual-haircut-adjuster", note: "Net deadweight, substitution, and creaming out of the gross placement count" },
      { tool: "170-workforce-cost-per-outcome", note: "Enter cost, enrollment, placement, and retention data for the full DOL TEGL 6-13 cost ladder" },
      { tool: "15-workforce-board-roi-report", note: "Benchmark program outcomes against WIOA PY 2023 national targets for the board-facing ROI report" },
    ],
  },
};
