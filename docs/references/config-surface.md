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

## 中文说明

本章节提供 `glm` 配置面的中文速查，便于快速定位配置项。英文章节仍是本文件的主要维护版本。

### 运行时目录

`glm` 会把产品状态写入 `~/.glm/`：

- `~/.glm/config.json`：持久化配置
- `~/.glm/mcp.json`：MCP server 定义
- `~/.glm/agent/prompts/system.md`：同步后的 base contract prompt
- `~/.glm/agent/auth.json`：runtime 维护的认证信息文件路径
- `~/.glm/agent/models.json`：runtime 维护的模型注册表缓存路径
- `~/.glm/sessions/`：按 cwd 派生的 session 目录
- `~/.glm/logs/`：预留日志目录

### `config.json` 结构

当前支持的持久化字段：

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

Anthropic 兼容模式的凭据目前仅支持通过环境变量配置。

### `glm config` 命令面

`glm config get|set` 当前暴露以下 key：

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

当新增配置项时，需要同步更新：

- `src/app/config-store.ts`
- `src/app/env.ts`
- `src/commands/config.ts`
- `README.md`
- `README.en.md`
- 本文件

### 环境变量输入

能力与 loop 相关环境变量：

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

凭据相关环境变量：

- `GLM_API_KEY`
- `GLM_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

MCP 相关环境变量：

- `GLM_MCP_CONFIG`
- `GLM_MCP_DISABLED`

### CLI flags

CLI 会通过 flags 影响 runtime 行为。排查时建议直接运行 `glm inspect --json` 查看最终生效结果。

- `--mode <direct|standard|intensive>`
  - 选择 `glm chat` / `glm run` 使用的 prompt lane（执行风格）。
  - 会影响模型被如何引导工作（是否先计划、是否强调验证等）。
  - 不会启用或关闭 loop。loop 仍由 `--loop` 与 `loop.*` 配置控制。
  - 默认值：
    - `glm chat`：`standard`
    - `glm run`：`standard`
    - `glm run --loop`：`intensive`

### 解析说明

- Provider/model 会从 CLI flags、环境变量和持久化配置综合解析，逻辑在 `src/providers/index.ts` 与 `src/app/env.ts`。
- Loop options 解析在 `src/app/env.ts`。
- Session 路径派生在 `src/session/session-paths.ts`。
- 打包的 prompts/extensions 同步逻辑在 `src/app/resource-sync.ts`。
