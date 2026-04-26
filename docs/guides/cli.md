<p align="right">
  <strong>English</strong> | <a href="./cli.zh.md" aria-label="Switch to Chinese version of this document">中文</a>
</p>

# CLI Guide

This guide explains how to operate `glm` day-to-day. For the full config/env surface, see:

- [config-surface.md](../references/config-surface.md)
- [mcp.md](./mcp.md)

## Quick start

```bash
# Start interactive chat in the current directory
glm

# Run a single task and exit
glm run "fix the failing tests"

# Run with the delivery-quality loop enabled
glm run "fix the failing tests" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff

# Inspect the effective runtime state
glm inspect --json
```

## Commands

### `glm` / `glm chat [path]`

Starts an interactive session. If `[path]` is provided, it is used as the session working directory.

### `glm run "<task>" [path]`

Runs a single task. Use quotes when the task contains spaces. Optional `[path]` overrides the working directory.

### `glm verify [path]`

Runs verification for the current project. By default, glm auto-detects the verifier (tests/build); you can override it with `--verify "<command>"`. Each run writes a structured artifact under `~/.glm/sessions/.../artifacts/verify-*.json`.

Common examples:

```bash
glm verify
glm verify smoke
glm verify build
glm verify --verify "pnpm test"
glm verify --json
```

### `glm inspect`

Prints the effective runtime snapshot for the current command context (provider/model/approval/loop/MCP/etc).

```bash
glm inspect
glm inspect --json
```

### `glm doctor`

Performs local diagnostics (cwd accessibility, credentials for the effective provider, resource sync state, etc).

### `glm config get|set`

Reads/writes supported keys in `~/.glm/config.json`.

See [config-surface.md](../references/config-surface.md) for the full list of supported keys.

## Global flags

These flags apply to `glm`, `glm chat`, and `glm run`:

- `--provider <name>`: `glm`, `openai-compatible`, `openai-responses`, `anthropic`
- `--model <id>`: model ID (supports GLM aliases like `ZhipuAI/GLM-5`)
- `--cwd <path>`: working directory override
- `--mode <direct|standard|intensive>`: prompt lane override
- `--yolo`: skip non-dangerous approvals (dangerous commands still require confirmation)
- `--loop`: enable the delivery-quality loop
- `--verify <command>`: loop verifier command (or `glm verify` override)
- `--max-rounds <n>`: loop round limit
- `--max-tool-calls <n>`: loop tool call budget
- `--max-verify-runs <n>`: loop verification budget
- `--fail-mode <handoff|fail>`: loop terminal behavior

## Prompt lanes (`--mode`)

`--mode` selects a prompt lane (execution style). It changes the instruction overlay the model receives, but it does not toggle runtime behavior (for example, whether the loop runs).

- `direct`: best for small, well-scoped changes (rename, small bugfix, quick diagnosis).
- `standard`: recommended default for most tasks.
- `intensive`: best for complex or high-risk tasks (large refactors, flaky tests, heavy verification).

Defaults:

- `glm chat`: `standard`
- `glm run`: `standard`
- `glm run --loop`: `intensive`

You can override these defaults via `glm config set taskLaneDefault <auto|direct|standard|intensive>`.

When `taskLaneDefault=auto`, `glm run` will pick `direct` for trivial tasks (docs/lint/format) and `standard` otherwise. `glm run --loop` still forces `intensive`.

## Approvals (`--yolo` and `/approval`)

`--yolo` toggles `approvalPolicy=never` for the current invocation (skip non-dangerous confirmations). Dangerous commands (for example `rm`) still require explicit approval.

In interactive mode, you can also switch policy on the fly:

- `/approval ask|auto|never` (alias: `/policy`)
- `/inspect`
- `/events`
- `/events clear`

## Notifications

Notifications are controlled by `notifications.*` in `~/.glm/config.json` and the `GLM_NOTIFY_*` env overrides.

## Runtime settings (`settings.json`)

glm uses `settings.json` files for many runtime behaviors (compaction, retry, steering modes, etc):

- Global: `~/.glm/agent/settings.json`
- Per-project: `<project>/.glm/settings.json`

### Compaction (context compression)

When a session gets large, glm compacts the retained context to stay within the selected model's context window. In interactive mode you can also force a compaction:

```text
/compact
/compact keep only the high-level plan and verification results
```

Compaction settings (in either `settings.json`):

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

Trigger condition:

- Compaction runs once the estimated context usage exceeds `contextWindow - reserveTokens`.
- After compaction, glm keeps approximately `keepRecentTokens` worth of recent context.

`glm inspect --json` prints both the resolved model context window and the effective compaction settings.

While streaming in interactive mode:

- `Enter` sends a steering message (`steer`) into the current generation.
- `Alt+Enter` queues a follow-up message (`followUp`) for the next turn.

Token/cost stats:

- `/stats` (or `/usage`) shows a widget with aggregated token usage (input/output/cache).
- `/stats clear` hides the widget.

Delivery-quality loop:

- `/loop status`
- `/loop history [n]`
- `/loop show <index>`
- `/loop on`
- `/loop off`
- `/loop verify <cmd>`
- `/loop clear-verify`
- `/loop run <task>`

Session memory:

- `/memory`
- `/memory note <text>`
- `/memory clear-notes`
- `/memory path`

## Built-in web tools

glm bundles two web-related tools that models can call:

- `web_search`: web search (requires configuration)
- `web_fetch`: fetch a URL and extract plain text (HTML is stripped)

`web_search` configuration (select one):

- Brave Search API: set `BRAVE_API_KEY`
- SearxNG JSON endpoint: set `GLM_WEB_SEARCH_URL` (example: `https://your-searx-instance/search`)

If you already use MCP for web/search/browsing, you can skip `web_search` and rely on MCP tools instead.

## Generation overrides (env)

You can set default generation parameters via env vars (applied to provider request payloads):

- `GLM_MAX_OUTPUT_TOKENS=8192`
- `GLM_TEMPERATURE=0.2`
- `GLM_TOP_P=0.9`

Equivalent config file keys:

- `generation.maxOutputTokens`
- `generation.temperature`
- `generation.topP`

## BigModel/z.ai OpenAI-compatible payload patches

BigModel + z.ai OpenAI-compatible endpoints differ slightly from OpenAI's Chat Completions API. `glm` patches outgoing payloads so the runtime behaves consistently:

- Uses `max_tokens` (BigModel docs) instead of `max_completion_tokens`.
- Maps runtime thinking toggles to BigModel's `thinking: { type: "enabled" | "disabled" }` request format.
- Supports forcing thinking on/off via `thinkingMode`.
- Can explicitly control `tool_stream` via `toolStream` when tools are present and `stream: true`.
- Supports structured JSON output via `responseFormat=json_object`.

Optional env knobs:

- `GLM_THINKING_MODE=auto|enabled|disabled`
- `GLM_CLEAR_THINKING=0|1`: sets `thinking.clear_thinking` when the request includes `thinking`. (`0` is preserved thinking, per BigModel docs.)
