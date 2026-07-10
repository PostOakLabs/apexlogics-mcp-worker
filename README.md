# ApexLogics MCP Worker

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live endpoint](https://img.shields.io/badge/MCP-mcp.apexlogics.org-2ea44f)](https://mcp.apexlogics.org)
[![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange)](https://workers.cloudflare.com/)

MCP server exposing [ApexLogics.org](https://apexlogics.org)'s deterministic career, education, and compensation calculators as agent-callable tools. Deployed as a Cloudflare Worker - no separate hosting, no Node/Python server.

Sister worker: [ainumbers-mcp](https://mcp.ainumbers.co) (markets & institutions). Anchoring/timestamping for both is centralized at `anchor.ainumbers.co`.

---

## Live Endpoint

```
https://mcp.apexlogics.org
```

## Agent Quickstart

Add to any MCP-compatible client config:

```json
{
  "mcpServers": {
    "apexlogics": {
      "url": "https://mcp.apexlogics.org"
    }
  }
}
```

`find_tool` runs a BM25 search over the live tool index - start there rather than hardcoding tool names, since counts and slugs drift as the suite grows.

## What's Exposed

Each ApexLogics calculator is wrapped as an MCP tool: deterministic inputs in, a structured result plus an AP2 policy-mandate export out. Tool/kernel counts are **not** hardcoded here - the live index at `find_tool` and the site's [`suite-registry.json`](https://apexlogics.org/suite-registry.json) are the source of truth.

## Verification Scope (read before citing proofs)

Two distinct verification tiers exist across the suite - do not conflate them:

- **§4 hash-verifiable (all browser tools + unproven kernels):** deterministic client-side execution, SHA-256 execution hashes over inputs/outputs. Reproducible, not zero-knowledge proven.
- **§18 zk compute-proven (8 of 31 worker kernels only):** real Groth16-BN254 proofs generated via a RISC Zero zkVM (`RISC0_DEV_MODE=0`, Guest ImageID `a1a0bc89`), verified before being attached to the audit trail. Currently proven, by name: `40-gig-income-optimizer`, `109-iso-amt-exposure-modeler`, `38-early-career-net-worth-engine`, `137-qbi-199a-optimizer`, `143-federal-buyout-decision`, `126-skillbridge-credential-transfer-roi`, `119-educator-advanced-degree-roi`, `120-nbct-roi-calculator`.

The remaining 23 worker kernels carry an honest `compute_proof_ready: "deferred"` status. No blanket "ApexLogics is zk-proven" claim is accurate - any §18 claim must scope to the named list above.

## Structure

```
apexlogics-mcp-worker/
├── worker.mjs         # MCP server entrypoint (Cloudflare Worker)
├── run_chain.mjs       # Chain execution over kernel graph
├── generate.mjs         # Regenerates tools.json / find_tool index from live suite-registry.json
├── kernels/            # Deterministic calculator kernels (.kernel.mjs) + shared _detmath/_gateval/_computeproof
├── data/                 # Chain fixtures, goldens, chaingraph.json
├── scripts/              # CI gates (kernel-parity, gate-static, gate-semantics, branch coverage)
└── wrangler.jsonc        # Cloudflare Worker config (custom domain: mcp.apexlogics.org)
```

## Deploy

CI-owned - pushes to `master` run gates (`kernel-parity.mjs`, syntax/semantics/branch-coverage checks) + `generate.mjs` (rebuilds the tool index against the live site registry) + a `wrangler deploy` dry-run, then auto-deploy. No manual `wrangler deploy`.

## License

MIT - see [LICENSE](LICENSE).
