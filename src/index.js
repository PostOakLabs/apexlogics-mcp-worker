/**
 * ApexLogics MCP Server — Cloudflare Worker
 * Endpoint: https://mcp.apexlogics.org/mcp
 * Protocol: MCP Streamable HTTP (2025-03-26 spec)
 * Tools: list_apexlogics_tools, build_workflow_links
 */

const SERVER_INFO = {
  name: "apexlogics-tools",
  version: "1.0.0",
};

const REGISTRY_URL = "https://apexlogics.org/suite-registry.json";
const REGISTRY_CACHE_KEY = "https://apexlogics-mcp-cache/suite-registry";
const REGISTRY_TTL_SECONDS = 3600; // 1 hour

// ── Workflow chains (29 live as of 2026-06-10) ─────────────────────────────
const WORKFLOWS = {
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
      { tool: "ai-displacement-risk-scorer", note: "Score occupation's AI displacement exposure" },
      { tool: "ai-skills-premium-calculator", note: "Model pay premium for AI skill stack" },
      { tool: "credential-roi-suite", note: "ROI on upskilling credential" },
    ],
  },
  "teacher-career-compensation": {
    description: "Full K-12 teacher career financial model: salary schedule → degree ROI → NBCT ROI → pension",
    steps: [
      { tool: "118-teacher-salary-schedule-projector", note: "Build step-and-lane earnings trajectory; capture FAS for pension step" },
      { tool: "119-educator-advanced-degree-roi", note: "Model NPV of master's or lane change (net of TLF ESEA §1059c)" },
      { tool: "120-nbct-roi-calculator", note: "Quantify NBCT cert ROI against state stipend" },
      { tool: "121-teacher-pension-estimator", note: "Project defined-benefit pension PV and vesting cliff" },
    ],
  },
  "underpaid-stay-and-ask": {
    description: "Am I underpaid? Model raise-ask EV then compare staying for promotion vs. job-hopping",
    steps: [
      { tool: "128-raise-ask-ev-calculator", note: "Calculate EV, lifetime silence cost, and scripted anchor for raise ask" },
      { tool: "129-promotion-vs-job-hop", note: "Compare 5-yr PV of promotion path vs. hop offer; break-even premium" },
    ],
  },
};

// ── CORS headers ────────────────────────────────────────────────────────────
function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, MCP-Protocol-Version, X-MCP-Client",
    "Access-Control-Max-Age": "86400",
    "MCP-Protocol-Version": req.headers.get("MCP-Protocol-Version") || "2025-03-26",
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function mcpError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

// ── Registry fetch with edge caching ────────────────────────────────────────
async function getRegistry(env) {
  const cache = caches.default;
  const cacheReq = new Request(REGISTRY_CACHE_KEY);

  let cached = await cache.match(cacheReq);
  if (cached) {
    return await cached.json();
  }

  const res = await fetch(REGISTRY_URL, {
    headers: { "User-Agent": "apexlogics-mcp-worker/1.0" },
  });
  if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
  const data = await res.json();

  // Cache it
  const cacheRes = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${REGISTRY_TTL_SECONDS}`,
    },
  });
  await cache.put(cacheReq, cacheRes);
  return data;
}

// ── Tool: list_apexlogics_tools ──────────────────────────────────────────────
async function listApexlogicsTools(args, env) {
  const query = (args.query || "").toLowerCase().trim();
  const category = (args.category || "").toLowerCase().trim();
  const limit = Math.min(parseInt(args.limit) || 20, 50);

  let registry;
  try {
    registry = await getRegistry(env);
  } catch (e) {
    return { error: `Could not load tool registry: ${e.message}` };
  }

  const tools = registry.tools || [];

  let results = tools.filter((t) => {
    if (category && t.category !== category) return false;
    if (!query) return true;
    const haystack = [t.title, t.description, t.al_id, t.slug, t.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
  });

  const total = results.length;
  results = results.slice(0, limit);

  return {
    query: query || null,
    category: category || null,
    total_matches: total,
    returned: results.length,
    tools: results.map((t) => ({
      al_id: t.al_id,
      title: t.title,
      description: t.description,
      category: t.category,
      url: `https://apexlogics.org/tools/${t.slug}/`,
      ap2_type: t.ap2_mandate_type || null,
      ap2_export: t.ap2_export || false,
    })),
    _note:
      total > limit
        ? `${total - limit} more results — refine query or increase limit (max 50)`
        : null,
  };
}

// ── Tool: build_workflow_links ───────────────────────────────────────────────
async function buildWorkflowLinks(args) {
  const name = (args.workflow || "").toLowerCase().trim();

  if (!name) {
    return {
      available_workflows: Object.entries(WORKFLOWS).map(([id, w]) => ({
        id,
        description: w.description,
        steps: w.steps.length,
      })),
      usage: 'Pass workflow: "<id>" to get prefill-ready deep-links for that chain.',
    };
  }

  const wf = WORKFLOWS[name];
  if (!wf) {
    return {
      error: `Unknown workflow: "${name}"`,
      available: Object.keys(WORKFLOWS),
    };
  }

  const steps = wf.steps.map((s, i) => ({
    step: i + 1,
    tool: s.tool,
    note: s.note,
    url: `https://apexlogics.org/tools/${s.tool}/`,
  }));

  return {
    workflow: name,
    description: wf.description,
    steps,
    _tip: "Run steps in order. Each tool exports an AP2 mandate you can paste into the next tool's import field.",
  };
}

// ── Tool definitions (for tools/list) ───────────────────────────────────────
const TOOL_DEFINITIONS = [
  {
    name: "list_apexlogics_tools",
    description:
      "Search the ApexLogics catalog of 123 deterministic, privacy-first edtech and careertech tools. Returns tool names, descriptions, URLs, and AP2 mandate types. Use this to find the right tool for a career, education, compensation, licensing, immigration, or workforce question.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keyword search — matches against title, description, category, and AL-ID. Leave blank to list all.",
        },
        category: {
          type: "string",
          description:
            "Filter by category slug. Options: education_path_roi, compensation_offers, career_transition_mobility, licensing_credentials, student_finance_debt, workforce_development, immigration_visa, selected_studies, hr_analytics, obbba_student_loans, equity_tax, freelance_tax.",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 20, max 50).",
          default: 20,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "build_workflow_links",
    description:
      "Return ordered, deep-link URLs for a named multi-tool ApexLogics workflow chain. Each step includes the tool URL and a handoff note describing which outputs feed the next step. Call with no workflow argument to get the full list of available chains.",
    inputSchema: {
      type: "object",
      properties: {
        workflow: {
          type: "string",
          description:
            "Workflow chain ID — e.g. 'mba-decision', 'offer-evaluation', 'equity-tax', 'student-loan-strategy'. Omit to list all available chains.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
];

// ── MCP request dispatcher ───────────────────────────────────────────────────
async function handleMcp(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(mcpError(null, -32700, "Parse error"), 400, corsHeaders(req));
  }

  const { jsonrpc, id, method, params } = body;

  if (jsonrpc !== "2.0") {
    return jsonResponse(mcpError(id, -32600, "Invalid Request"), 400, corsHeaders(req));
  }

  let result;

  switch (method) {
    case "initialize":
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "ApexLogics is a 123-tool edtech and careertech suite. Use list_apexlogics_tools to find the right calculator for any career, education, compensation, licensing, or immigration question. Use build_workflow_links to chain tools together for multi-step analyses.",
      };
      break;

    case "tools/list":
      result = { tools: TOOL_DEFINITIONS };
      break;

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (toolName === "list_apexlogics_tools") {
        const data = await listApexlogicsTools(toolArgs, env);
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          isError: !!data.error,
        };
      } else if (toolName === "build_workflow_links") {
        const data = await buildWorkflowLinks(toolArgs);
        result = {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          isError: !!data.error,
        };
      } else {
        return jsonResponse(
          mcpError(id, -32602, `Unknown tool: ${toolName}`),
          400,
          corsHeaders(req)
        );
      }
      break;
    }

    case "prompts/list":
      result = {
        prompts: [
          {
            name: "career_pivot_workflow",
            description:
              "Walk through a full career pivot analysis using the career-pivot workflow chain.",
          },
          {
            name: "mba_decision_workflow",
            description:
              "End-to-end MBA ROI and program fit analysis using the mba-decision chain.",
          },
          {
            name: "offer_evaluation_workflow",
            description:
              "Multi-offer total comp comparison including equity, benefits, and geo arbitrage.",
          },
          {
            name: "student_loan_strategy",
            description:
              "Full student debt strategy: IDR vs. PSLF vs. OBBBA RAP comparison.",
          },
        ],
      };
      break;

    case "notifications/initialized":
      return new Response(null, { status: 204, headers: corsHeaders(req) });

    default:
      return jsonResponse(
        mcpError(id, -32601, `Method not found: ${method}`),
        404,
        corsHeaders(req)
      );
  }

  return jsonResponse({ jsonrpc: "2.0", id, result }, 200, corsHeaders(req));
}

// ── Main fetch handler ───────────────────────────────────────────────────────
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    // Health check
    if (url.pathname === "/healthz") {
      return jsonResponse({ status: "ok", server: SERVER_INFO }, 200, corsHeaders(req));
    }

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      if (method !== "POST") {
        return jsonResponse({ error: "POST required" }, 405, corsHeaders(req));
      }
      return handleMcp(req, env);
    }

    // Root info
    if (url.pathname === "/") {
      return jsonResponse(
        {
          name: "ApexLogics MCP Server",
          endpoint: "https://mcp.apexlogics.org/mcp",
          tools: TOOL_DEFINITIONS.map((t) => t.name),
          docs: "https://apexlogics.org/mcp.html",
          registry: "https://apexlogics.org/suite-registry.json",
        },
        200,
        corsHeaders(req)
      );
    }

    return jsonResponse({ error: "Not found" }, 404, corsHeaders(req));
  },
};
