# GLM Agent CLI Design

Date: 2026-04-12
Status: Approved in discussion

## Summary

Build a standalone TypeScript/Node.js coding CLI named `glm` with an embedded agent runtime in the same style as GSD-2: the runtime provides the low-level session/runtime substrate, while `glm` owns the command surface, configuration layout, resource loading, default prompts, provider defaults, and product identity.

The first release is a local-repository coding assistant with:

- `glm` as the primary entrypoint, defaulting to interactive chat mode
- `glm run "<task>"` for one-shot execution
- GLM official API as the default provider
- OpenAI-compatible provider support
- `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` compatibility for existing wrapper workflows
- `--yolo` support to disable interactive approvals while retaining hard safety rules
- A plain CLI UX now, with explicit seams for a later Ink-based TUI

## Goals

- Ship a usable coding assistant for local repositories under the `glm` command
- Keep the product independent from underlying runtime branding and directory conventions
- Reuse the embedded runtime for session/runtime primitives instead of rebuilding an agent loop from scratch
- Support both long-lived interactive sessions and single-task execution on top of the same runtime
- Make provider configuration flexible enough to support official GLM, OpenAI-compatible gateways, and Anthropic-style environment compatibility
- Leave room for later additions such as Skills, TUI, context compression, and broader runtime selection without rewriting the MVP

## Non-Goals

- Rebuilding GSD-2's milestone/slice/task workflow engine
- Reproducing Claude Code or OpenClaw feature-for-feature
- Introducing multi-agent orchestration in the first version
- Building an enterprise skill marketplace or remote sync layer
- Implementing advanced context compression or harness plugins in the MVP

## Reference Systems

### GSD-2

Adopt:

- Standalone branded CLI built on an embedded runtime SDK
- Two-stage startup pattern (`loader` before runtime imports)
- Product-owned config/resource directories
- Embedded session creation instead of shelling out to an external runtime binary

Do not adopt in MVP:

- Milestone/slice/task workflow system
- Auto mode and workflow state machine
- Broader product surface unrelated to a first local coding assistant

### OpenClaw

Adopt later if needed:

- Higher-level control plane over the runtime
- Harness selection abstractions
- More sophisticated error handling and model/runtime fallback

Do not adopt in MVP:

- Harness plugin layer
- Multi-channel delivery model
- Extra platform-specific runtime complexity

### xqsit94/glm

Adopt:

- `glm` as the command name
- No-subcommand default action
- `~/.glm/` configuration layout
- Lightweight product commands for auth/config/doctor
- Support for wrapper-style environment compatibility and `--yolo`

Do not adopt:

- Claude wrapper execution model
- Direct dependency on `claude` CLI
- Anthropic-first product semantics

## Product Shape

The CLI is a standalone product named `glm`, not a runtime extension and not a Claude wrapper.

The user-facing model is:

- `glm` opens an interactive repository-aware coding session
- `glm run "<task>"` executes a one-shot task using the same runtime
- `glm auth ...`, `glm config ...`, and `glm doctor` manage local product state

The architecture is intentionally "GSD-2 style":

- `glm` owns the UX and product shell
- The embedded runtime owns the low-level coding session/runtime

## Command Surface

### Primary commands

- `glm`
  - Alias of `glm chat`
  - Starts an interactive coding session in the current working directory
- `glm chat [path]`
  - Explicit interactive session entrypoint
- `glm run "<task>" [path]`
  - Executes a one-shot task and exits

### Product commands

- `glm auth login`
- `glm auth status`
- `glm auth logout`
- `glm config set <key> <value>`
- `glm config get <key>`
- `glm doctor`

### Common runtime flags

- `--provider <name>`
- `--model <model>`
- `--cwd <path>`
- `--yolo`

`--yolo` changes approval behavior to `never` for the current run only.

## Architecture Overview

The implementation is split into five layers.

### 1. CLI Entry Layer

Responsible for:

- argument parsing
- command dispatch
- terminal I/O for the plain CLI
- startup diagnostics and exit codes

This layer must not contain runtime or provider logic.

### 2. App/Bootstrap Layer

Responsible for:

- setting product environment before runtime imports
- resolving product directories under `~/.glm/`
- syncing packaged resources into the product-owned agent directory
- wiring logging and process-level defaults

This is where the GSD-2-style `loader.ts` pattern is applied.

### 3. Session/Runtime Layer

Responsible for:

- creating embedded runtime sessions
- injecting product-owned prompt and tools
- maintaining the agent loop for chat and run
- applying approval policy and safety checks

`chat` and `run` are separate entrypoints over the same runtime primitives.

### 4. Provider Layer

Responsible for:

- interpreting provider settings
- constructing requests for official GLM or OpenAI-compatible backends
- normalizing provider errors into product error types

### 5. Tool Layer

Responsible for:

- tool registration
- parameter validation
- approval hooks
- executing filesystem/search/shell/plan operations

## Proposed Repository Layout

```text
glm-agent-cli/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ src/
│  ├─ loader.ts
│  ├─ cli.ts
│  ├─ commands/
│  │  ├─ chat.ts
│  │  ├─ run.ts
│  │  ├─ auth.ts
│  │  ├─ doctor.ts
│  │  └─ config.ts
│  ├─ app/
│  │  ├─ dirs.ts
│  │  ├─ env.ts
│  │  ├─ logger.ts
│  │  └─ resource-sync.ts
│  ├─ session/
│  │  ├─ create-session.ts
│  │  ├─ managers.ts
│  │  └─ session-paths.ts
│  ├─ runtime/
│  │  ├─ chat-runtime.ts
│  │  ├─ run-runtime.ts
│  │  ├─ prompt.ts
│  │  └─ approvals.ts
│  ├─ providers/
│  │  ├─ index.ts
│  │  ├─ glm-official.ts
│  │  ├─ openai-compatible.ts
│  │  └─ types.ts
│  ├─ tools/
│  │  ├─ index.ts
│  │  ├─ file-tools.ts
│  │  ├─ search-tools.ts
│  │  ├─ bash-tools.ts
│  │  ├─ plan-tools.ts
│  │  └─ adapters/
│  │     └─ runtime-tool-adapter.ts
│  └─ tui/
│     └─ types.ts
├─ resources/
│  ├─ prompts/
│  │  └─ system.md
│  ├─ skills/
│  ├─ extensions/
│  └─ themes/
└─ tests/
```

## Product Directories

The product owns its filesystem layout under `~/.glm/`.

### Required paths

- `~/.glm/config.json`
- `~/.glm/agent/`
- `~/.glm/sessions/`
- `~/.glm/logs/`

Runtime resources are not discovered from ambient global locations by default. The product bundles and syncs its own resources into `~/.glm/agent/`.

## Startup Model

Use a two-stage startup:

1. `src/loader.ts`
   - computes product directories
   - sets required environment variables and package/resource paths
   - avoids importing runtime modules too early
2. `src/cli.ts`
   - performs static imports
   - constructs commands and launches the runtime

This protects product-specific environment setup from runtime initialization order issues.

## Runtime Flow

The runtime flow for both `glm` and `glm run` is:

1. Parse CLI flags and target working directory
2. Resolve config and environment-based provider settings
3. Sync packaged resources into `~/.glm/agent/`
4. Construct auth/model/settings/session managers
5. Create an embedded runtime session
6. Inject product-owned system prompt, tools, approval policy, and provider config
7. Start either:
   - interactive session loop for `glm` / `glm chat`
   - one-shot loop for `glm run`
8. Persist transcripts and logs on exit

## Provider Design

### Real providers

- `glm-official`
  - default provider
  - uses GLM official API semantics
- `openai-compatible`
  - supports OpenAI-style API gateways and compatible backends

### Anthropic-style compatibility

The product also supports:

- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

This is treated as an environment compatibility layer, not as a first-class Anthropic-branded product mode.

The purpose is to support existing wrapper and launch-script habits without making the CLI internally Anthropic-first.

### Provider resolution order

For any runtime setting, use:

1. explicit CLI flag
2. environment variable
3. `~/.glm/config.json`
4. built-in default

### Supported environment variables

Product-native:

- `GLM_PROVIDER`
- `GLM_API_KEY`
- `GLM_BASE_URL`
- `GLM_MODEL`

OpenAI-compatible:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Anthropic-style compatibility:

- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

## Configuration Shape

Initial config shape:

```json
{
  "defaultProvider": "glm-official",
  "defaultModel": "glm-5",
  "approvalPolicy": "ask",
  "providers": {
    "glmOfficial": {
      "apiKey": "",
      "baseURL": ""
    },
    "openAICompatible": {
      "apiKey": "",
      "baseURL": ""
    }
  }
}
```

The config remains product-owned even when compatibility environment variables are present.

## Approval and Safety Model

### Approval policies

- `ask`
  - default
  - write operations and shell execution require interactive approval
- `auto`
  - safe/common operations proceed automatically
  - obviously risky actions still require approval
- `never`
  - activated by `--yolo`
  - approvals are skipped for the current run

### Hard safety rules

`--yolo` does not disable hard safety constraints.

The runtime still blocks:

- clearly destructive shell commands
- writes outside allowed workspace boundaries by default
- obvious secret exfiltration patterns when detectable

This distinction must be visible in error messaging:

- approval refusal is not the same as safety-policy denial

## Tool Surface

The MVP tool surface is grouped by capability.

### File tools

- `read_file`
- `read_many_files`
- `list_dir`
- `stat_path`

### Search tools

- `glob_search`
- `grep_search`
- `list_git_status`

### Edit tools

- `write_file`
- `edit_file`
- `apply_patch`

`apply_patch` is the preferred structured edit path for precise changes.

### Command tools

- `bash`
- `run_test_command`
- `run_format_command`

These may share a shell executor internally while exposing distinct outer semantics.

### Plan tools

- `update_plan`
- `mark_task_done`
- `show_plan`

This is a lightweight planning surface, not a full workflow engine.

### Collaboration/runtime control tools

- `request_approval`
- `ask_followup`
- `finish`

These may be represented as internal runtime actions rather than public external tools, but the runtime needs explicit equivalents.

## System Prompt Boundaries

The MVP system prompt should be medium-sized and product-focused.

It must define:

- assistant role as a local coding agent
- preferred workflow: inspect before editing, verify when possible
- preference for structured tools over shell-only behavior
- approval and safety semantics, including `--yolo`
- concise reporting style

It must not yet attempt to encode:

- enterprise skill catalogs
- multi-agent coordination patterns
- large methodology handbooks
- advanced memory/compression behavior

The prompt should be lean enough that future skills and targeted additions can layer on top without redoing the whole runtime.

## Error Model

Normalize runtime errors into stable categories:

```ts
type AgentError = {
  kind: "config" | "provider" | "tool" | "approval" | "safety";
  message: string;
  cause?: unknown;
  retryable?: boolean;
};
```

### Error classes

- `config`
  - missing API key
  - invalid provider settings
  - invalid model selection
- `provider`
  - auth failures
  - rate limits
  - context overflow
  - transport and timeout issues
- `tool`
  - missing files
  - patch failures
  - shell command failures
- `approval`
  - user denied execution
- `safety`
  - blocked by hard runtime rules

This model keeps the CLI output stable now and supports a future TUI without redesigning error handling.

## Testing Strategy

The first implementation should cover four test areas.

### 1. Config resolution

- flag/env/config/default precedence
- `ANTHROPIC_*` compatibility mapping
- `--yolo` override behavior

### 2. Command dispatch

- `glm` defaults to chat mode
- `glm run` enters one-shot mode
- auth/config/doctor subcommands route correctly

### 3. Runtime behavior

- approval flow around tool execution
- tool result propagation back into the loop
- finish behavior ends the loop as expected

### 4. Provider adapters

- request construction for official GLM
- request construction for OpenAI-compatible backends
- provider error normalization

The MVP can mock provider HTTP behavior. Live smoke testing can be delegated to `doctor` and manual verification.

## MVP Cut Line

### Must ship in MVP

- `glm` primary entrypoint
- `glm chat`
- `glm run`
- `glm auth`
- `glm doctor`
- `~/.glm/` product-owned config/session/resource layout
- embedded runtime session creation
- GLM official provider
- OpenAI-compatible provider
- `ANTHROPIC_*` compatibility support
- `--yolo`
- file/search/edit/bash/plan tool groups
- plain CLI output

### Explicitly deferred

- Ink TUI
- multi-agent orchestration
- enterprise skills system
- advanced context compression
- harness plugin abstraction
- remote sync/account platform

## Future Evolution

The intended evolution path is:

1. ship a stable branded product shell on top of the embedded runtime
2. add Skills and stronger project-context loading
3. add a richer TUI without changing runtime boundaries
4. add more selective runtime abstractions only if model/runtime diversity justifies it

This keeps the MVP aligned with the "start thick, then subtract" thesis discussed earlier: use product/runtime structure to compensate for current model limits, but preserve seams so future model improvements can simplify the outer shell rather than forcing a rewrite.
