<p align="right">
  <strong>English</strong> | <a href="./config-surface.zh.md" aria-label="Switch to Chinese version of this document">中文</a>
</p>

# Config Surface

Agent-facing map of the current `glm` config and runtime state.

## Runtime home

`glm` keeps product state under `~/.glm/`.

- `~/.glm/config.json`: persisted operator config
- `~/.glm/mcp.json`: MCP server definitions
- `~/.glm/agent/prompts/system.md`: synced base contract prompt
- `~/.glm/agent/auth.json`: runtime auth state path
- `~/.glm/agent/models.json`: runtime model cache path
- `~/.glm/agent/settings.json`: global runtime settings (`/compact`, retry, steering, etc)
- `~/.glm/sessions/`: session directories derived from cwd
- `~/.glm/logs/`: reserved log directory helper

## `settings.json` shape

`settings.json` is a runtime-owned settings file (separate from `config.json`). It supports global and per-project overrides:

- Global: `~/.glm/agent/settings.json`
- Per-project: `<project>/.glm/settings.json`

Compaction controls (defaults shown):

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

## `config.json` shape

Supported persisted keys today:

- `defaultProvider`
- `defaultApi`
- `defaultModel`
- `taskLaneDefault`
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
- `glmCapabilities.contextCache`
- `loop.enabledByDefault`
- `loop.profile`
- `loop.maxRounds`
- `loop.maxToolCalls`
- `loop.maxVerifyRuns`
- `loop.failureMode`
- `loop.autoVerify`
- `loop.verifyCommand`
- `modelOverrides`
- `providers.<provider>.apiKey`
- `providers.<provider>.baseURL`
- `providers.<provider>.api`

Anthropic-compatible credentials are env-only today.

`modelOverrides[]` supports these fields:

- `match`
- `canonicalModelId`
- `payloadPatchPolicy`
- `modalities`
- `caps`

`modelOverrides[].modalities` currently accepts `text`, `image`, and `video`.

`modelOverrides[].match` can target `provider`, `api`, base URL globs, model aliases, canonical IDs, platform, and upstream vendor hints.

Example override for an unknown `custom` model:

```json
{
  "modelOverrides": [
    {
      "match": {
        "provider": "custom",
        "api": "openai-compatible",
        "modelId": "my-model"
      },
      "modalities": ["text"],
      "caps": {
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "supportsThinking": false
      }
    }
  ]
}
```

## `glm config` command surface

`glm config get|set` currently exposes:

- `defaultProvider`
- `defaultApi`
- `defaultModel`
- `taskLaneDefault`
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
- `contextCache`
- `loopEnabledByDefault`
- `loopProfile`
- `loopMaxRounds`
- `loopMaxToolCalls`
- `loopMaxVerifyRuns`
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
- `GLM_API`
- `GLM_MODEL`
- `GLM_MAX_OUTPUT_TOKENS`
- `GLM_TEMPERATURE`
- `GLM_TOP_P`
- `GLM_THINKING_MODE`
- `GLM_CLEAR_THINKING`
- `GLM_TOOL_STREAM`
- `GLM_RESPONSE_FORMAT`
- `GLM_CONTEXT_CACHE`
- `GLM_LOOP_ENABLED`
- `GLM_LOOP_PROFILE`
- `GLM_LOOP_MAX_ROUNDS`
- `GLM_LOOP_MAX_TOOL_CALLS`
- `GLM_LOOP_MAX_VERIFY_RUNS`
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

- Provider/API/model selection is resolved from CLI flags, env, and persisted config in `src/providers/index.ts` and `src/app/env.ts`.
- Recommended operator flow is: select `provider`, optionally override `api`, then set `model`.
- `custom` is the generic path for proxy, local, and unknown models. Start with the requested model name, then refine capabilities with `modelOverrides` when the default generic profile is too conservative.
- Loop options are resolved in `src/app/env.ts`.
- Repo context pack assembly lives in `src/runtime/repo-context.ts`. It currently draws from `AGENTS.md` command/change sections and common `package.json` scripts, and the compaction extension reuses the same pack as focused compression input.
- Session memory persistence lives in `src/harness/session-memory.ts` and `resources/extensions/glm-memory/index.ts`. It stores compaction history, operator notes, and the latest loop result snapshot for `/memory`.
- Session paths are derived in `src/session/session-paths.ts`.
- Packaged prompts/extensions are synced by `src/app/resource-sync.ts`.

If behavior appears surprising, inspect those files before updating docs.
