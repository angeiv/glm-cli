# AGENTS

Short repo guide for contributors and agents working inside `glm-cli`.

## Repo map

### CLI and command entrypoints

- `src/loader.ts`: process entrypoint used by the published `glm` binary.
- `src/cli.ts`: argument parsing, help text, command dispatch.
- `src/commands/chat.ts`: interactive session entry.
- `src/commands/run.ts`: one-shot task execution and loop entry.
- `src/commands/config.ts`: `glm config get|set`.
- `src/commands/doctor.ts`: local diagnostics before session startup.

### Runtime, session, and prompt stack

- `src/session/create-session.ts`: session creation, runtime model selection, scoped env setup.
- `src/session/managers.ts`: session manager and service wiring.
- `src/session/session-paths.ts`: `~/.glm` session/auth/model paths.
- `src/runtime/`: interactive runtime and single-task execution helpers.
- `src/prompt/`: base contract plus mode, repo, task, and verification overlays.

### Loop and verification

- `src/loop/`: loop controller, verifier detection, verifier execution, failure summaries.
- `resources/extensions/glm-loop/`: interactive `/loop` commands.

### Provider and tool wiring

- `src/providers/`: provider selection and resolution helpers.
- `src/tools/`: built-in tools and planning helpers created in-process.
- `resources/extensions/glm-providers/`: packaged provider integrations.
- `resources/extensions/glm-zhipu/`: GLM-specific request shaping.
- `resources/extensions/glm-mcp/`: MCP config loading and tool exposure.
- `resources/extensions/glm-policy/`: approval policy and dangerous-command behavior.
- `resources/extensions/glm-web/`: built-in web helpers.

### Tests and docs

- `tests/`: Vitest coverage for CLI, config, loop, extensions, runtime, and session logic.
- `docs/guides/`: operator-facing guides (CLI, MCP, etc).
- `docs/references/`: compact operating notes for contributors and future agents.

## Command map

- `pnpm install --frozen-lockfile`: install dependencies in a clean worktree.
- `pnpm test`: run the full Vitest suite.
- `pnpm test <path>`: run a focused Vitest file.
- `pnpm build`: compile TypeScript and stage packaged resources into `dist/`.
- `pnpm dev -- --help`: run the local CLI entrypoint via `tsx`.

Use `pnpm`, not `npm`, for repo-managed commands.

## Product state on disk

- `~/.glm/config.json`: persisted product config.
- `~/.glm/mcp.json`: MCP server definitions.
- `~/.glm/agent/`: synced packaged prompts and extensions used at runtime.
- `~/.glm/agent/auth.json`: runtime-owned auth state file path.
- `~/.glm/agent/models.json`: runtime-owned model registry cache path.
- `~/.glm/sessions/`: per-worktree session state and artifacts.

Do not commit anything from `~/.glm/`; it is local product state.

## Where extensions load from

- Source of truth in the repo: `resources/prompts/` and `resources/extensions/`.
- Runtime copy destination: `~/.glm/agent/`.
- Sync mechanism: `src/app/resource-sync.ts`, called during session startup.

If you change packaged resources, verify both the repo copy and the synced runtime copy behavior.

## Change rules

- Keep changes small and atomic.
- When adding config, update `src/app/config-store.ts`, `src/app/env.ts`, `src/commands/config.ts`, and docs together.
- When adding runtime behavior, document the operator-facing surface in `README.md`, `README.en.md`, or `docs/references/config-surface.md`.
