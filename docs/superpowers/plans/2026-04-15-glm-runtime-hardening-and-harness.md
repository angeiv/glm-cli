# GLM Runtime Hardening and Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `glm` from a provider shell into an agent-friendly coding runtime with durable repository docs, runtime observability, deterministic lifecycle hooks, command-output shaping, stable context/tool surfaces, and a local verification harness.

**Architecture:** Keep the embedded runtime as the session/runtime substrate and evolve the product-owned layer in `src/` and `resources/`. All new work should strengthen prompt stability, trust boundaries, diagnostics, deterministic automation, command-output efficiency, and verification loops without re-implementing the runtime's core agent loop.

**Tech Stack:** Node.js 22+, TypeScript, embedded runtime SDK, `@modelcontextprotocol/sdk`, Vitest, Markdown docs under `docs/`, product resources under `resources/`

---

## Context

This plan is based on the current `main` branch after MCP remote transport support landed, and on the following external references:

- OpenAI, `Unrolling the Codex agent loop`, published January 23, 2026
- OpenAI, `Harness engineering`, published February 11, 2026

The planning premise is:

- do **not** spend the next iteration on adding more model providers
- do **not** replace the current runtime loop
- do focus on runtime stability, observability, trust, and verification
- do insert RTK-inspired command-output shaping **after** observability, not before it

## Product Re-evaluation

This plan needs a product-level correction based on the actual positioning of `glm`:

- `glm` is **not** meant to be a generic Claude Code replacement with a different default provider
- `glm` is meant to be a **GLM-native coding agent CLI**
- the core value is to expose **GLM-specific capabilities** that general-purpose CLIs often flatten away
- the product should prefer **higher delivery quality** over minimum token usage when those two goals conflict
- extra token spend is acceptable when it buys deeper reasoning, stronger review loops, and better verification outcomes

That changes the optimization target:

- first optimize for **capability expression**
- then optimize for **agent loop quality**
- then optimize for **runtime observability and trust**
- only after that optimize for **token efficiency**

In practice this means:

- BigModel / GLM request features such as thinking mode, tool streaming, function calling, cache controls, structured output, search, reader, and MCP integration are product-defining, not optional polish
- loop control, verification gates, and iterative repair are core product behavior, not just harness extras
- command-output reduction and compaction are still useful, but they are support systems for better reasoning, not the headline goal
- Claude-style hooks are valuable, but only where they improve deterministic orchestration around the GLM-native workflow

## Delivery Order Override

The PR blocks below remain valid as implementation modules, but they should **not** be treated as the best delivery order for the product.

The recommended delivery order from this point is:

1. **GLM capability surface first**
   - unify model profiles and endpoint behavior around actual GLM features
   - expose product-owned config for thinking, tool streaming, structured output, caching, and provider-specific request shaping
2. **Loop and quality control second**
   - add planner / executor / verifier style loop controls on top of the current runtime
   - make iterative repair, review, and verification a first-class runtime path
3. **Search / MCP / external knowledge third**
   - treat BigModel Coding Plan MCPs and builtin web/search as a product capability layer
   - prefer the path that gives GLM the richest, most stable tool surface
4. **Observability and trust fourth**
   - inspect, event logs, trust segmentation, and deterministic hooks
   - these are necessary, but they support the main product thesis rather than define it
5. **Token shaping and context optimization fifth**
   - compact noisy output to preserve room for high-value reasoning
   - do not prematurely optimize for lowest token usage at the expense of capability

## Immediate Planning Consequences

For the next implementation window, the effective priorities should be:

- build a **GLM-native runtime config surface**, not just generic provider flags
- build a **loop controller and verification path**, not just passive diagnostics
- keep the embedded runtime as the substrate, but move product differentiation into `src/` and `resources/extensions/`
- treat generic repo docs, generic hook systems, and generic token reducers as secondary unless they directly improve GLM delivery quality

## Scope

### In Scope

- Make the repository itself easier for an agent to understand
- Add runtime inspection and event logging
- Add a product-owned hook layer for deterministic lifecycle automation
- Reduce noisy command output before it enters the long-lived coding context
- Stabilize tool ordering and context-management behavior
- Introduce trust-aware MCP metadata and approval handling
- Add a first-class local verification harness and artifact capture path

### Out of Scope

- New provider families beyond current `glm`, `openai-compatible`, and `anthropic`
- A full TUI rewrite
- Cloud execution, remote session sync, or hosted eval infrastructure
- Replacing the embedded runtime's built-in compaction or session manager implementations

## Proposed Repository Layout Changes

### Create

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/references/agent-loop-notes.md`
- `docs/references/harness-engineering-notes.md`
- `docs/references/config-surface.md`
- `src/diagnostics/runtime-status.ts`
- `src/diagnostics/event-log.ts`
- `src/hooks/types.ts`
- `src/hooks/registry.ts`
- `src/hooks/runner.ts`
- `src/diagnostics/token-savings.ts`
- `src/diagnostics/context-summary.ts`
- `src/commands/inspect.ts`
- `src/commands/verify.ts`
- `src/runtime/command-reducers.ts`
- `src/runtime/reducers/git.ts`
- `src/runtime/reducers/test-runners.ts`
- `src/runtime/reducers/filesystem.ts`
- `src/harness/scenarios.ts`
- `src/harness/runner.ts`
- `src/harness/artifacts.ts`
- `src/harness/assertions.ts`
- `resources/extensions/glm-runtime/index.ts`
- `resources/extensions/glm-hooks/index.ts`
- `resources/extensions/glm-context/index.ts`
- `tests/commands/inspect.test.ts`
- `tests/commands/verify.test.ts`
- `tests/diagnostics/runtime-status.test.ts`
- `tests/hooks/runner.test.ts`
- `tests/diagnostics/token-savings.test.ts`
- `tests/diagnostics/context-summary.test.ts`
- `tests/extensions/runtime-extension.test.ts`
- `tests/extensions/hooks-extension.test.ts`
- `tests/extensions/context-extension.test.ts`
- `tests/runtime/command-reducers.test.ts`
- `tests/harness/scenarios.test.ts`

### Modify

- `src/cli.ts`
- `src/commands/chat.ts`
- `src/commands/run.ts`
- `src/commands/config.ts`
- `src/app/config-store.ts`
- `src/app/dirs.ts`
- `src/session/create-session.ts`
- `src/session/managers.ts`
- `src/tools/bash-tools.ts`
- `src/runtime/chat-runtime.ts`
- `src/runtime/run-runtime.ts`
- `resources/extensions/glm-mcp/index.ts`
- `resources/extensions/glm-generation/index.ts`
- `resources/extensions/glm-policy/index.ts`
- `resources/extensions/glm-stats/index.ts`
- `README.md`
- `README.en.md`

### Directory Notes

- Keep repository knowledge and architecture docs at the repo root or under `docs/references/` so an agent can discover them without guessing.
- Keep runtime/product logic in `src/`, not in `resources/extensions/`, unless the feature must surface as a slash command or widget in the embedded runtime.
- Keep trust and MCP transport enforcement close to the existing extension in `resources/extensions/glm-mcp/index.ts` to avoid splitting MCP behavior across unrelated modules too early.

## Command Surface to Add

### Top-Level CLI Commands

- `glm inspect`
  - Print the current runtime/session configuration as text
- `glm inspect --json`
  - Print machine-readable runtime/session diagnostics
- `glm verify <scenario>`
  - Run a named local verification scenario and write artifacts
- `glm verify --task "<task>"`
  - Run an ad-hoc verification task through the harness without defining a named scenario first

### Interactive Commands

- `/inspect`
  - Show provider, model, approval policy, cwd, context usage, tool count, and MCP status
- `/events`
  - Show the recent product event log in the UI
- `/events clear`
  - Clear the recent event log widget
- `/hooks`
  - Show the active hook config, recent hook executions, and disabled/bypassed handlers
- `/context`
  - Show context budget, tool hash, MCP reload policy, and compaction-related state

### Existing Commands to Extend

- `/stats`
  - include event counters, fallback counts, command-output savings, and compaction summary where available
- `/mcp`
  - include trust level and reload policy summary for each loaded server
- `glm config get`
  - support the new product-owned config keys listed below
- `glm config set`
  - support the new product-owned config keys listed below

## Config Surface to Add

### `~/.glm/config.json`

Add the following product-owned keys:

- `debugRuntime: boolean`
  - default `false`
  - enables persistent runtime event collection and richer diagnostics output
- `eventLogLimit: number`
  - default `200`
  - max number of in-memory product events retained for `/events` and `glm inspect`
- `hooksEnabled: boolean`
  - default `true`
  - enables user-configurable lifecycle hooks from `~/.glm/hooks.json`
- `hookTimeoutMs: number`
  - default `5000`
  - max runtime for each hook handler before glm marks it failed and continues or blocks according to policy
- `commandOutputMode: "raw" | "compact"`
  - default `compact`
  - controls whether bash output is passed through reducers before being shown to the model and UI
- `trackTokenSavings: boolean`
  - default `true`
  - enables approximate before/after token and byte savings counters for reduced command output
- `commandReducers: Record<string, "off" | "basic" | "aggressive">`
  - default `{ "git status": "basic", "git diff": "basic", "git log": "basic", "pytest": "basic", "go test": "basic", "cargo test": "basic", "npm test": "basic", "ls": "basic" }`
  - command-family overrides for reducer behavior
- `autoCompactMode: "manual" | "auto"`
  - default `manual`
  - product-level policy for whether glm should actively trigger compaction behavior
- `autoCompactThresholdPercent: number`
  - default `80`
  - threshold used by glm diagnostics and future auto-compaction triggers
- `mcpReloadPolicy: "manual" | "turn-boundary"`
  - default `manual`
  - controls whether tool-surface changes are only applied on explicit reload or deferred to a safe boundary
- `verificationArtifactDir: string`
  - default `~/.glm/artifacts`
  - output directory for `glm verify`

### `~/.glm/mcp.json`

Extend the per-server config shape with product metadata:

- `trust?: "local" | "remote-readonly" | "remote-sensitive"`
- `reloadPolicy?: "manual" | "turn-boundary"`
- `labels?: string[]`

The transport keys (`type`, `url`, `headers`, `command`, `args`, `env`) remain unchanged.

### `~/.glm/hooks.json`

Add a dedicated lifecycle hook file owned by `glm`:

- event groups:
  - `sessionStart`
  - `beforeTool`
  - `afterTool`
  - `permissionRequest`
  - `beforeProviderRequest`
  - `sessionEnd`
- first-cut backends:
  - `command`
  - `http`
- matcher fields:
  - `tool`
  - `commandPrefix`
  - `provider`
  - `model`
  - `reason`
- decisions:
  - `allow`
  - `deny`
  - `defer`
  - `injectContext`

### Validation Rules

- Keep validation in `src/app/config-store.ts`
- Reject negative `eventLogLimit`
- Reject negative `hookTimeoutMs`
- Reject unknown `commandOutputMode` values
- Reject non-boolean `trackTokenSavings`
- Reject `commandReducers` entries that are not strings mapped to `off|basic|aggressive`
- Clamp `autoCompactThresholdPercent` to `1-95`
- Reject unknown `mcpReloadPolicy` values
- Reject unknown MCP `trust` values during MCP config normalization
- Reject unknown hook event names, backends, and decision types during hook config normalization

## PR Strategy

### PR 1: Repo-as-System-of-Record Docs

**Outcome:** The repository becomes self-describing for both humans and agents.

**Scope:**
- add `AGENTS.md`
- add `ARCHITECTURE.md`
- add reference notes under `docs/references/`
- link the new docs from both READMEs

### PR 2: Runtime Inspect and Event Logging

**Outcome:** `glm` can explain its current runtime state without digging through internals.

**Scope:**
- add `glm inspect`
- add `/inspect` and `/events`
- add in-memory runtime event log and runtime summary builder
- add config parsing for `debugRuntime` and `eventLogLimit`

### PR 3: Deterministic Hook Runtime

**Outcome:** `glm` gains a product-owned automation layer for policy, notifications, and context reinjection without depending on model behavior.

**Scope:**
- add `~/.glm/hooks.json` parsing and validation
- add `/hooks` and recent hook execution diagnostics
- expose lifecycle events for `sessionStart`, `beforeTool`, `afterTool`, `permissionRequest`, `beforeProviderRequest`, and `sessionEnd`
- support `command` and `http` handlers with timeout, logging, and deterministic allow/deny/defer decisions

### PR 4: Command Output Shaping and Token Analytics

**Outcome:** `glm` reduces noisy shell output before it pollutes long-lived coding context and can explain where the savings came from.

**Scope:**
- add bash-output reducers for high-noise command families
- add approximate savings accounting for raw vs compact output
- add config parsing for `commandOutputMode`, `trackTokenSavings`, and `commandReducers`
- extend `/stats` and `glm inspect` with output-shaping diagnostics

### PR 5: Context Stability and Tool-Surface Controls

**Outcome:** Long sessions become more predictable and cache-friendly.

**Scope:**
- add stable MCP tool ordering
- add context summary hashing for tools/config/runtime state
- add `autoCompactMode`, `autoCompactThresholdPercent`, and `mcpReloadPolicy`
- add `/context`

### PR 6: MCP Trust Segmentation and Approval Integration

**Outcome:** Local tools, local MCP, and remote MCP are surfaced with explicit trust distinctions.

**Scope:**
- extend `~/.glm/mcp.json` parsing with `trust`, `reloadPolicy`, and `labels`
- reflect trust levels in `/mcp`, `/inspect`, and diagnostics
- tighten policy prompts for remote-sensitive MCP servers

### PR 7: Local Verification Harness

**Outcome:** `glm` gains a repeatable way to verify tasks and persist artifacts.

**Scope:**
- add `glm verify`
- add scenario manifests and artifact storage
- capture transcripts, summaries, and optional command outputs
- make failures machine-readable for regression use

## Task 1: Repository Knowledge Layer

**Files:**
- Create: `AGENTS.md`
- Create: `ARCHITECTURE.md`
- Create: `docs/references/agent-loop-notes.md`
- Create: `docs/references/harness-engineering-notes.md`
- Create: `docs/references/config-surface.md`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write the documentation skeletons**

Add short, agent-readable docs instead of long essays:

- `AGENTS.md`
  - repo map
  - command map
  - where config lives
  - where extensions load from
- `ARCHITECTURE.md`
  - CLI layer
  - session/runtime layer
  - provider layer
  - extension layer
- reference notes
  - distilled findings from the two OpenAI articles and how they map to `glm`

- [ ] **Step 2: Link the docs from the READMEs**

Add a compact "Project docs" section to both READMEs linking:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/references/config-surface.md`

- [ ] **Step 3: Verify the docs are discoverable**

Run: `rg -n "AGENTS.md|ARCHITECTURE.md|config-surface" README.md README.en.md AGENTS.md ARCHITECTURE.md docs/references`

Expected:

- both READMEs reference the new docs
- the new docs exist and contain the expected headings

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md ARCHITECTURE.md docs/references README.md README.en.md
git commit -m "docs: add agent-facing repository guides"
```

## Task 2: Runtime Inspect and Event Logging

**Files:**
- Create: `src/diagnostics/runtime-status.ts`
- Create: `src/diagnostics/event-log.ts`
- Create: `src/commands/inspect.ts`
- Create: `resources/extensions/glm-runtime/index.ts`
- Test: `tests/diagnostics/runtime-status.test.ts`
- Test: `tests/commands/inspect.test.ts`
- Test: `tests/extensions/runtime-extension.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/app/config-store.ts`
- Modify: `src/commands/config.ts`
- Modify: `src/session/create-session.ts`
- Modify: `src/commands/chat.ts`
- Modify: `src/commands/run.ts`

- [ ] **Step 1: Write the failing config and inspect tests**

Write tests that prove:

- `debugRuntime` and `eventLogLimit` are parsed and validated
- `glm inspect --json` prints structured runtime data
- `/inspect` and `/events` commands register through the runtime extension

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/commands/inspect.test.ts tests/extensions/runtime-extension.test.ts tests/app/config-resolution.test.ts`

Expected:

- parse failures for the new config keys
- unknown command failures for `inspect`
- missing extension command registrations

- [ ] **Step 3: Implement the event log and runtime snapshot builder**

Build:

- an in-memory event store with bounded retention
- runtime summary generation for:
  - provider
  - model
  - approval policy
  - cwd
  - context usage
  - tool count
  - MCP server count
  - recent runtime events

- [ ] **Step 4: Wire `glm inspect`, `/inspect`, and `/events`**

Implementation notes:

- keep `glm inspect` in `src/commands/inspect.ts`
- keep interactive UI commands in `resources/extensions/glm-runtime/index.ts`
- avoid duplicating snapshot logic between CLI and interactive mode

- [ ] **Step 5: Run focused tests and then the full suite**

Run:

- `pnpm test tests/commands/inspect.test.ts tests/extensions/runtime-extension.test.ts tests/diagnostics/runtime-status.test.ts`
- `pnpm test`
- `pnpm build`

Expected:

- targeted tests pass
- full suite passes
- build stays clean

- [ ] **Step 6: Commit**

```bash
git add src/diagnostics src/commands/inspect.ts resources/extensions/glm-runtime/index.ts src/app/config-store.ts src/commands/config.ts src/cli.ts src/session/create-session.ts src/commands/chat.ts src/commands/run.ts tests/diagnostics tests/commands/inspect.test.ts tests/extensions/runtime-extension.test.ts
git commit -m "feat: add runtime inspection and event logging"
```

## Task 3: Deterministic Hook Runtime

**Files:**
- Create: `src/hooks/types.ts`
- Create: `src/hooks/registry.ts`
- Create: `src/hooks/runner.ts`
- Create: `resources/extensions/glm-hooks/index.ts`
- Test: `tests/hooks/runner.test.ts`
- Test: `tests/extensions/hooks-extension.test.ts`
- Modify: `src/app/config-store.ts`
- Modify: `src/commands/config.ts`
- Modify: `src/session/create-session.ts`
- Modify: `resources/extensions/glm-policy/index.ts`
- Modify: `resources/extensions/glm-generation/index.ts`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write the failing hook config and runner tests**

Write tests that prove:

- `hooksEnabled` and `hookTimeoutMs` are parsed and validated
- `~/.glm/hooks.json` supports event, matcher, backend, and decision validation
- `beforeTool` hooks can deny or defer a bash call deterministically
- `/hooks` registers and reports the configured handlers plus recent outcomes

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/hooks/runner.test.ts tests/extensions/hooks-extension.test.ts tests/app/config-resolution.test.ts`

Expected:

- no hook registry exists yet
- no hook config parser exists yet
- no `/hooks` command exists yet

- [ ] **Step 3: Implement the hook registry and execution model**

Build:

- normalized lifecycle event types over current runtime events
- matcher evaluation for tool name, bash command prefix, provider, model, and session reason
- runner support for `command` and `http` handlers
- deterministic decisions for `allow`, `deny`, `defer`, and `injectContext`

- [ ] **Step 4: Wire hooks into existing product events**

Implementation notes:

- map runtime `tool_call` into product `beforeTool`
- map runtime `before_provider_request` into product `beforeProviderRequest`
- keep dangerous-command approval as a product policy, but run it through the same hook diagnostics path
- leave `preCompact` and `postCompact` as a later extension after context diagnostics land

- [ ] **Step 5: Add `/hooks` and execution diagnostics**

Expose:

- active hook file path
- enabled/disabled state
- recent hook runs with duration and outcome
- blocked and deferred actions

- [ ] **Step 6: Update docs**

Document:

- the first-cut lifecycle events
- `command` vs `http` hook handlers
- timeout and failure semantics
- how hook decisions interact with approval policy

- [ ] **Step 7: Run focused tests and then the full suite**

Run:

- `pnpm test tests/hooks/runner.test.ts tests/extensions/hooks-extension.test.ts tests/extensions/policy-extension.test.ts`
- `pnpm test`
- `pnpm build`

- [ ] **Step 8: Commit**

```bash
git add src/hooks resources/extensions/glm-hooks src/app/config-store.ts src/commands/config.ts src/session/create-session.ts resources/extensions/glm-policy/index.ts resources/extensions/glm-generation/index.ts README.md README.en.md tests/hooks/runner.test.ts tests/extensions/hooks-extension.test.ts
git commit -m "feat: add deterministic lifecycle hooks"
```

## Task 4: Command Output Shaping and Token Analytics

**Files:**
- Create: `src/diagnostics/token-savings.ts`
- Create: `src/runtime/command-reducers.ts`
- Create: `src/runtime/reducers/git.ts`
- Create: `src/runtime/reducers/test-runners.ts`
- Create: `src/runtime/reducers/filesystem.ts`
- Test: `tests/diagnostics/token-savings.test.ts`
- Test: `tests/runtime/command-reducers.test.ts`
- Modify: `src/app/config-store.ts`
- Modify: `src/commands/config.ts`
- Modify: `src/tools/bash-tools.ts`
- Modify: `resources/extensions/glm-stats/index.ts`
- Modify: `resources/extensions/glm-runtime/index.ts`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write the failing reducer and savings tests**

Write tests that prove:

- `commandOutputMode`, `trackTokenSavings`, and `commandReducers` are parsed and validated
- `git status`, `git diff`, `git log`, `pytest`, `go test`, `cargo test`, `npm test`, and `ls` are reducible through a central registry
- savings accounting records raw bytes, compact bytes, and approximate token deltas
- `/stats` and `glm inspect` can surface output-shaping diagnostics

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/runtime/command-reducers.test.ts tests/diagnostics/token-savings.test.ts tests/app/config-resolution.test.ts`

Expected:

- no reducer registry exists yet
- no token-savings helper exists yet
- config parsing does not know the new output-shaping keys

- [ ] **Step 3: Implement the reducer registry**

Build a reducer system that:

- matches command families from raw bash input
- applies `off|basic|aggressive` reducer strategies
- keeps unknown commands untouched
- preserves enough detail for debugging while trimming obvious noise

First-cut command families:

- `git status`
- `git diff`
- `git log`
- `pytest`
- `go test`
- `cargo test`
- `npm test`
- `ls`

- [ ] **Step 4: Wire reducers into bash tool output**

Implementation notes:

- do not rewrite the command itself in v1; shape the output path first
- keep raw output available for debugging and artifact capture
- use compact output by default when `commandOutputMode=compact`

- [ ] **Step 5: Extend stats and inspect diagnostics**

Expose:

- total reduced commands
- raw bytes vs compact bytes
- approximate token savings
- top noisy command families

- [ ] **Step 6: Update docs**

Document:

- `commandOutputMode`
- `trackTokenSavings`
- `commandReducers`
- which command families are reduced in the first cut

- [ ] **Step 7: Run focused tests and then the full suite**

Run:

- `pnpm test tests/runtime/command-reducers.test.ts tests/diagnostics/token-savings.test.ts tests/extensions/runtime-extension.test.ts`
- `pnpm test`
- `pnpm build`

- [ ] **Step 8: Commit**

```bash
git add src/diagnostics/token-savings.ts src/runtime/command-reducers.ts src/runtime/reducers src/tools/bash-tools.ts resources/extensions/glm-stats/index.ts resources/extensions/glm-runtime/index.ts src/app/config-store.ts src/commands/config.ts README.md README.en.md tests/diagnostics/token-savings.test.ts tests/runtime/command-reducers.test.ts tests/extensions/runtime-extension.test.ts
git commit -m "feat: add command output shaping and token analytics"
```

## Task 5: Context Stability and Tool-Surface Controls

**Files:**
- Create: `src/diagnostics/context-summary.ts`
- Create: `resources/extensions/glm-context/index.ts`
- Test: `tests/diagnostics/context-summary.test.ts`
- Test: `tests/extensions/context-extension.test.ts`
- Modify: `src/app/config-store.ts`
- Modify: `src/commands/config.ts`
- Modify: `src/session/create-session.ts`
- Modify: `resources/extensions/glm-mcp/index.ts`
- Modify: `resources/extensions/glm-stats/index.ts`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write the failing context-summary tests**

Write tests that prove:

- MCP tools are emitted in stable order for identical config
- changes to provider/model/approval/cwd/tool set change the context hash
- `autoCompactMode`, `autoCompactThresholdPercent`, and `mcpReloadPolicy` are parsed correctly
- `/context` registers and reports the expected fields

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/diagnostics/context-summary.test.ts tests/extensions/context-extension.test.ts tests/extensions/mcp-extension.test.ts tests/app/config-resolution.test.ts`

Expected:

- no context summary helper exists yet
- no `/context` command exists yet
- config parsing does not know the new keys

- [ ] **Step 3: Implement stable tool summarization and context diagnostics**

Implementation notes:

- keep tool ordering deterministic in `resources/extensions/glm-mcp/index.ts`
- do not mutate existing prompt state just to report context changes
- surface hashes and counts for diagnostics, not raw prompt internals

- [ ] **Step 4: Add `/context` and expand `/stats`**

Expose:

- context usage percentage
- current tool hash
- configured compact mode
- compact threshold
- MCP reload policy
- most recent compaction event if available

- [ ] **Step 5: Update docs for the new config keys**

Document:

- `autoCompactMode`
- `autoCompactThresholdPercent`
- `mcpReloadPolicy`

- [ ] **Step 6: Run focused tests and then the full suite**

Run:

- `pnpm test tests/diagnostics/context-summary.test.ts tests/extensions/context-extension.test.ts tests/extensions/mcp-extension.test.ts`
- `pnpm test`
- `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add src/diagnostics/context-summary.ts resources/extensions/glm-context/index.ts resources/extensions/glm-mcp/index.ts resources/extensions/glm-stats/index.ts src/app/config-store.ts src/commands/config.ts src/session/create-session.ts README.md README.en.md tests/diagnostics/context-summary.test.ts tests/extensions/context-extension.test.ts tests/extensions/mcp-extension.test.ts
git commit -m "feat: stabilize context diagnostics and tool surfaces"
```

## Task 6: MCP Trust Segmentation and Approval Integration

**Files:**
- Test: `tests/extensions/mcp-extension.test.ts`
- Test: `tests/runtime/approval-policy.test.ts`
- Modify: `resources/extensions/glm-mcp/index.ts`
- Modify: `resources/extensions/glm-policy/index.ts`
- Modify: `resources/extensions/glm-runtime/index.ts`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write the failing MCP trust tests**

Write tests that prove:

- `trust`, `reloadPolicy`, and `labels` are parsed from `~/.glm/mcp.json`
- invalid trust values are rejected
- remote-sensitive MCP servers are clearly surfaced in diagnostics
- dangerous command protections remain enforced even when a remote MCP server is loaded

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/extensions/mcp-extension.test.ts tests/runtime/approval-policy.test.ts`

Expected:

- MCP config normalization ignores the new metadata
- trust-level-specific behavior is absent

- [ ] **Step 3: Implement trust metadata and runtime surfacing**

Implementation notes:

- keep trust metadata in `~/.glm/mcp.json`, not in `config.json`
- start with surfacing and approval integration; do not attempt server capability inference in v1
- treat missing `trust` as conservative for remote transports

- [ ] **Step 4: Update `/mcp` and `/inspect` output**

Add:

- per-server trust label
- reload policy
- remote/local indicator
- disabled/errored summary where available

- [ ] **Step 5: Document MCP trust levels**

Add concrete examples for:

- local stdio server
- remote read-only search server
- remote sensitive server

- [ ] **Step 6: Run focused tests and then the full suite**

Run:

- `pnpm test tests/extensions/mcp-extension.test.ts tests/runtime/approval-policy.test.ts tests/extensions/runtime-extension.test.ts`
- `pnpm test`
- `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add resources/extensions/glm-mcp/index.ts resources/extensions/glm-policy/index.ts resources/extensions/glm-runtime/index.ts README.md README.en.md tests/extensions/mcp-extension.test.ts tests/runtime/approval-policy.test.ts tests/extensions/runtime-extension.test.ts
git commit -m "feat: add trust-aware MCP policy handling"
```

## Task 7: Local Verification Harness

**Files:**
- Create: `src/harness/scenarios.ts`
- Create: `src/harness/runner.ts`
- Create: `src/harness/artifacts.ts`
- Create: `src/harness/assertions.ts`
- Create: `src/commands/verify.ts`
- Test: `tests/harness/scenarios.test.ts`
- Test: `tests/commands/verify.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/app/config-store.ts`
- Modify: `src/commands/config.ts`
- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Write the failing harness tests**

Write tests that prove:

- `glm verify <scenario>` resolves a named scenario
- `glm verify --task "<task>"` runs an ad-hoc scenario
- verification artifacts write to `verificationArtifactDir`
- failed assertions return a non-zero exit code

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/commands/verify.test.ts tests/harness/scenarios.test.ts tests/cli/root-command.test.ts`

Expected:

- CLI does not know the `verify` command
- no scenario registry exists
- no artifact writer exists

- [ ] **Step 3: Implement the minimal harness**

The first cut should support:

- named scenario lookup
- ad-hoc task execution
- transcript capture
- summary JSON artifact
- simple assertions:
  - exit code
  - required text
  - forbidden text

Do **not** add remote eval orchestration or browser automation in this PR.

- [ ] **Step 4: Wire config and docs**

Add:

- `verificationArtifactDir` config support
- README examples for:
  - `glm verify smoke`
  - `glm verify --task "fix failing test and confirm build passes"`

- [ ] **Step 5: Run focused tests and then the full suite**

Run:

- `pnpm test tests/commands/verify.test.ts tests/harness/scenarios.test.ts tests/cli/root-command.test.ts`
- `pnpm test`
- `pnpm build`

- [ ] **Step 6: Commit**

```bash
git add src/harness src/commands/verify.ts src/cli.ts src/app/config-store.ts src/commands/config.ts README.md README.en.md tests/harness/scenarios.test.ts tests/commands/verify.test.ts tests/cli/root-command.test.ts
git commit -m "feat: add local verification harness"
```

## Acceptance Criteria

The plan is complete when all of the following are true:

- the repo contains agent-facing docs that explain structure and config
- `glm inspect` and `/inspect` explain the current runtime clearly
- lifecycle hooks are configurable, observable, and deterministic
- context and tool-surface changes are visible and deterministic
- command output is reducible and savings are visible in diagnostics
- MCP servers carry explicit trust metadata and surface it in diagnostics
- `glm verify` can run local scenarios and persist artifacts
- README and README.en both describe the new commands and config keys

## Backlog After This Plan

These items are intentionally deferred until the seven PRs above land:

- MCP preset bootstrapping such as `glm mcp init bigmodel-coding`
- browser-backed verification scenarios
- cross-session event persistence
- hosted eval runners
- additional provider families
