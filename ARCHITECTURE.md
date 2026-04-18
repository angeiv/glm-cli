# ARCHITECTURE

Compact architecture map for `glm-cli`.

## 1. CLI layer

Primary files:

- `src/loader.ts`
- `src/cli.ts`
- `src/commands/*.ts`

Responsibilities:

- parse CLI arguments
- normalize command-specific flags
- resolve config and env inputs
- hand off into chat, run, doctor, or config flows

The CLI layer should stay thin. Business logic belongs in runtime, session, loop, or provider modules.

## 2. Session and runtime layer

Primary files:

- `src/session/create-session.ts`
- `src/session/managers.ts`
- `src/session/session-paths.ts`
- `src/runtime/chat-runtime.ts`
- `src/runtime/run-runtime.ts`

Responsibilities:

- compute `~/.glm` runtime paths
- sync packaged prompts/extensions before session startup
- resolve provider/model selection and scoped env overrides
- create the runtime used by interactive chat or one-shot task execution

`create-session.ts` is the main seam between CLI config and the embedded agent runtime.

## 3. Prompt stack layer

Primary files:

- `src/prompt/base-contract.ts`
- `src/prompt/mode-overlays.ts`
- `src/prompt/repo-overlay.ts`
- `src/prompt/task-overlay.ts`
- `src/prompt/verification-overlay.ts`
- `src/runtime/prompt.ts`

Responsibilities:

- keep the stable product contract short
- add dynamic overlays only when needed
- inject repo hints derived from the current checkout
- shape task prompts and repair prompts for looped execution

Current direction is layered prompts, not one monolithic system prompt.

## 4. Provider layer

Primary files:

- `src/providers/index.ts`
- `src/providers/types.ts`
- `src/app/env.ts`
- `resources/extensions/glm-providers/`
- `resources/extensions/glm-zhipu/`

Responsibilities:

- resolve effective provider and model
- map env/config values into runtime env vars
- keep provider-specific capability shaping close to the extension/runtime boundary

The repo currently supports `glm`, `openai-compatible`, and `anthropic` compatibility flows.

## 5. Loop and verification layer

Primary files:

- `src/loop/controller.ts`
- `src/loop/state.ts`
- `src/loop/types.ts`
- `src/loop/verify-detect.ts`
- `src/loop/verify-runner.ts`
- `src/loop/failure-summary.ts`
- `src/loop/profiles/`
- `resources/extensions/glm-loop/`

Responsibilities:

- explicit loop state transitions
- verifier detection for code tasks
- verifier execution and result shaping
- repair/handoff behavior after failed verification
- interactive `/loop` controls in chat mode

This is the product-owned quality loop. It should remain explainable and cheap to resume.

## 6. Extension and tool layer

Primary files:

- `resources/extensions/`
- `src/tools/`
- `src/app/resource-sync.ts`

Responsibilities:

- ship packaged runtime extensions with the CLI
- register interactive commands and provider/tool behavior
- expose built-in tools created inside the local process
- sync repo resources into `~/.glm/agent/` before runtime use

Treat `resources/` as packaged runtime assets, not ordinary docs.

## 7. Persistence layout

Product state lives under `~/.glm/`:

- `config.json`: persisted operator config
- `mcp.json`: MCP server declarations
- `agent/`: synced prompts and extensions
- `sessions/`: session state and resumable transcripts/artifacts

Repo state should stay separate from runtime state. When adding persistence, prefer `~/.glm/` over writing into the user repo.

## 8. Current seams for upcoming work

The next architectural pressure points are:

- runtime inspection and event logging
- richer verification artifacts and handoff bundles
- a first-class local verification harness
- tighter repo-context packaging for lower token waste

Those should extend the existing layers rather than bypass them.
