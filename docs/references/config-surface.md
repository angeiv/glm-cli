# Config Surface

Agent-facing map of the current `glm` config and runtime state.

## Runtime home

`glm` keeps product state under `~/.glm/`.

- `~/.glm/config.json`: persisted operator config
- `~/.glm/mcp.json`: MCP server definitions
- `~/.glm/agent/prompts/system.md`: synced base contract prompt
- `~/.glm/agent/auth.json`: runtime auth state path
- `~/.glm/agent/models.json`: runtime model cache path
- `~/.glm/sessions/`: session directories derived from cwd
- `~/.glm/logs/`: reserved log directory helper

## `config.json` shape

Supported persisted keys today:

- `defaultProvider`
- `defaultModel`
- `approvalPolicy`
- `debugRuntime`
- `eventLogLimit`
- `generation.maxOutputTokens`
- `generation.temperature`
- `generation.topP`
- `glmCapabilities.thinkingMode`
- `glmCapabilities.clearThinking`
- `glmCapabilities.toolStream`
- `glmCapabilities.responseFormat`
- `loop.enabledByDefault`
- `loop.profile`
- `loop.maxRounds`
- `loop.failureMode`
- `loop.autoVerify`
- `loop.verifyCommand`
- `providers.glm.apiKey`
- `providers.glm.baseURL`
- `providers.glm.endpoint`
- `providers["openai-compatible"].apiKey`
- `providers["openai-compatible"].baseURL`

Anthropic-compatible credentials are env-only today.

## `glm config` command surface

`glm config get|set` currently exposes:

- `defaultProvider`
- `defaultModel`
- `approvalPolicy`
- `debugRuntime`
- `eventLogLimit`
- `glmEndpoint`
- `maxOutputTokens`
- `temperature`
- `topP`
- `thinkingMode`
- `clearThinking`
- `toolStream`
- `responseFormat`
- `loopEnabledByDefault`
- `loopProfile`
- `loopMaxRounds`
- `loopFailureMode`
- `loopAutoVerify`
- `loopVerifyCommand`

When adding a new config key, update all of:

- `src/app/config-store.ts`
- `src/app/env.ts`
- `src/commands/config.ts`
- `README.md`
- `README.en.md`
- this file

## Runtime env inputs

Capability and loop env inputs currently include:

- `GLM_PROVIDER`
- `GLM_MODEL`
- `GLM_ENDPOINT`
- `GLM_MAX_OUTPUT_TOKENS`
- `GLM_TEMPERATURE`
- `GLM_TOP_P`
- `GLM_THINKING_MODE`
- `GLM_CLEAR_THINKING`
- `GLM_TOOL_STREAM`
- `GLM_RESPONSE_FORMAT`
- `GLM_LOOP_ENABLED`
- `GLM_LOOP_PROFILE`
- `GLM_LOOP_MAX_ROUNDS`
- `GLM_LOOP_FAILURE_MODE`
- `GLM_LOOP_AUTO_VERIFY`
- `GLM_LOOP_VERIFY_COMMAND`

Credential env inputs:

- `GLM_API_KEY`
- `GLM_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

MCP env inputs:

- `GLM_MCP_CONFIG`
- `GLM_MCP_DISABLED`

## CLI flags

The CLI influences runtime behavior via flags. `glm inspect --json` is the easiest way to confirm what resolved.

- `--mode <direct|standard|intensive>`
  - Selects the prompt lane overlay (execution style) used by `glm chat` and `glm run`.
  - This affects how the model is instructed to work (plan-first vs. direct, verification emphasis).
  - It does **not** enable/disable the loop. Use `--loop` and `loop.*` config keys for loop behavior.
  - Defaults:
    - `glm chat`: `standard`
    - `glm run`: `standard`
    - `glm run --loop`: `intensive`

## Resolution notes

- Provider/model selection is resolved from CLI flags, env, and persisted config in `src/providers/index.ts` and `src/app/env.ts`.
- Loop options are resolved in `src/app/env.ts`.
- Session paths are derived in `src/session/session-paths.ts`.
- Packaged prompts/extensions are synced by `src/app/resource-sync.ts`.

If behavior appears surprising, inspect those files before updating docs.
