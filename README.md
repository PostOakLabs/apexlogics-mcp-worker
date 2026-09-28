# ApexLogics MCP Worker

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live endpoint](https://img.shields.io/badge/MCP-mcp.apexlogics.org-2ea44f)](https://mcp.apexlogics.org)
[![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange)](https://workers.cloudflare.com/)

MCP server exposing [ApexLogics.org](https://apexlogics.org)'s deterministic career, education, and compensation calculators as agent-callable tools. Deployed as a Cloudflare Worker - no separate hosting, no Node/Python server.

Sister worker: [ainumbers-mcp](https://mcp.ainumbers.co) (markets & institutions). Anchoring/timestamping for both is centralized at `anchor.ainumbers.co`.

---

## Live Endpoint

```
https://mcp.apexlogics.org/mcp
```

## Agent Quickstart

Add to any MCP-compatible client config:

```json
{
  "mcpServers": {
    "apexlogics": {
      "url": "https://mcp.apexlogics.org/mcp"
    }
  }
}
```

`find_tool` runs a BM25 search over the live tool index - start there rather than hardcoding tool names, since counts and slugs drift as the suite grows.

## Prompts (AL-PROMPTS-MCP)

`prompts/list` serves the 31-prompt example catalog and `prompts/get` returns one by id (e.g. `same-math-three-ways`). The catalog is vendored verbatim from the site's [`mcp/showcase-prompts.json`](https://apexlogics.org/mcp/showcase-prompts.json) - `generate.mjs` re-fetches it on every deploy (cache-busted, UTF-8 decoded), the committed `data/prompts.json` is only a deploy fallback, and `scripts/check-prompts-parity.mjs` fails CI if the committed copy drifts from the live site catalog. There is no hand-synced second copy.

Prompt bodies are self-contained numbered steps citing concrete example values, so `prompts/get` returns the body as the prompt text and appends any supplied argument values as an "Input values" block instead of interpolating them.

**Protocol eras:** prompts are served through the same SDK dispatch as tools. Both supported protocol versions (2026-07-28 and the legacy 2025-06-18 window) include MCP prompts, so one code path serves every client - legacy clients are not forked off, and modern-era requests carry the SEP-2243 headers exactly as `tools/*` does (a mismatch is `-32020` before dispatch).

## What's Exposed

Each ApexLogics calculator is wrapped as an MCP tool: deterministic inputs in, a structured result plus an AP2 policy-mandate export out. Tool/kernel counts are **not** hardcoded here - the live index at `find_tool` and the site's [`suite-registry.json`](https://apexlogics.org/suite-registry.json) are the source of truth.

## Verification Scope (read before citing proofs)

Two distinct verification tiers exist across the suite - do not conflate them:

- **§4 hash-verifiable (all browser tools + unproven kernels):** deterministic client-side execution, SHA-256 execution hashes over inputs/outputs. Reproducible, not zero-knowledge proven.
- **§18 zk compute-proven (17 of 36 worker kernels):** real Groth16-BN254 proofs generated via a RISC Zero zkVM (`RISC0_DEV_MODE=0`, Guest ImageID `a1a0bc89`), verified before being attached to the audit trail. The authoritative proven list lives in [`data/proof-fixtures.json`](data/proof-fixtures.json); currently: `38-early-career-net-worth-engine`, `40-gig-income-optimizer`, `109-iso-amt-exposure-modeler`, `119-educator-advanced-degree-roi`, `120-nbct-roi-calculator`, `121-teacher-pension-estimator`, `122-trade-wage-progression-projector`, `123-trade-specialization-roi`, `124-contractor-launch-break-even`, `126-skillbridge-credential-transfer-roi`, `130-dependent-care-fsa-cdctc-optimizer`, `132-travel-nurse-vs-staff-comp`, `135-option-exercise-window`, `136-severance-ui-timing`, `137-qbi-199a-optimizer`, `140-83b-election-decision`, `143-federal-buyout-decision`.

The remaining 19 worker kernels are not zk-proven and make no §18 claim. No blanket "ApexLogics is zk-proven" claim is accurate - any §18 claim must scope to the named list above. Receipts can be verified independently with [PostOakLabs/ocg-verify-action](https://github.com/PostOakLabs/ocg-verify-action).

## Structure

```
apexlogics-mcp-worker/
├── worker.mjs         # MCP server entrypoint (Cloudflare Worker)
├── run_chain.mjs       # Chain execution over kernel graph
├── generate.mjs         # Regenerates tools.json / workflows.json / prompts.json from live site JSON
├── kernels/            # Deterministic calculator kernels (.kernel.mjs) + shared _detmath/_gateval/_computeproof
├── data/                 # tools.json (tool SSOT), workflows.json, prompts.json,
│                           proof-fixtures.json (17 proofs), chain fixtures/goldens
├── scripts/              # CI gates (kernel-parity, gate-static, gate-semantics, branch coverage)
└── wrangler.jsonc        # Cloudflare Worker config (custom domain: mcp.apexlogics.org)
```

## Deploy

CI-owned - pushes to `master` run gates (`kernel-parity.mjs`, syntax/semantics/branch-coverage checks) + `generate.mjs` (rebuilds the tool index against the live site registry) + a `wrangler deploy` dry-run, then auto-deploy. No manual `wrangler deploy`.

### Definition of done (any change touching version or protocol_version)

- `package.json` `version` is the single source of truth - `worker.mjs`'s `SERVER_META.version` imports it directly, never a hardcoded literal.
- `server.json` `version` is updated by hand to match `package.json` on every bump (registry-facing static metadata, not bundled into the worker).
- `protocol_version` (`server-card.json`'s `endpoints[].protocol_version`) is bumped only alongside an actual MCP protocol change - never silently drifts from what the transport advertises.
- Post-deploy: verify with a real `tools/call`, never `tools/list` alone.

## License

MIT - see [LICENSE](LICENSE).
