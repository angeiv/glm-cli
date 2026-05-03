<p align="right">
  <a href="./config-surface.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# 配置面（Config Surface）

面向贡献者和 agent 的 `glm` 配置与 runtime 状态速查。

## 运行时目录

`glm` 把产品状态保存在 `~/.glm/`：

- `~/.glm/config.json`：持久化配置
- `~/.glm/mcp.json`：MCP server 定义
- `~/.glm/agent/prompts/system.md`：同步后的 base contract prompt
- `~/.glm/agent/auth.json`：runtime 维护的认证信息文件路径
- `~/.glm/agent/models.json`：runtime 维护的模型注册表缓存路径
- `~/.glm/agent/settings.json`：全局运行时设置文件（`/compact`、retry、steering 等）
- `~/.glm/sessions/`：按 cwd 派生的 session 目录
- `~/.glm/logs/`：预留日志目录

## `settings.json` 结构

`settings.json` 是运行时设置文件（与 `config.json` 分离），支持全局与项目级覆盖：

- 全局：`~/.glm/agent/settings.json`
- 项目级：`<project>/.glm/settings.json`

Compaction（上下文压缩）配置项（展示默认值）：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

## `config.json` 结构

当前支持的持久化字段：

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

Anthropic 兼容模式的凭据目前仅支持通过环境变量配置。

`modelOverrides[]` 当前支持以下字段：

- `match`
- `canonicalModelId`
- `payloadPatchPolicy`
- `modalities`
- `caps`

`modelOverrides[].modalities` 当前支持 `text`、`image`、`video`。

`modelOverrides[].match` 可按 `provider`、`api`、base URL 通配、模型别名、canonical ID、platform 以及 upstream vendor 进行匹配。

未知 `custom` 模型的覆盖示例：

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

## `glm config` 命令面

`glm config get|set` 当前暴露以下 key：

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

当新增配置项时，需要同步更新：

- `src/app/config-store.ts`
- `src/app/env.ts`
- `src/commands/config.ts`
- `README.md`
- `README.en.md`
- 本文件

## 运行时环境变量输入

能力与 loop 相关环境变量：

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

## CLI flags（命令行参数）

CLI 会通过 flags 影响 runtime 行为。排查时建议直接运行 `glm inspect --json` 查看最终生效结果。

- `--mode <direct|standard|intensive>`
  - 选择 `glm chat` / `glm run` 使用的 prompt lane（执行风格）。
  - 会影响模型被如何引导工作（是否先计划、是否强调验证等）。
  - 不会启用或关闭 loop。loop 仍由 `--loop` 与 `loop.*` 配置控制。
  - 对 `glm run` 而言，任务意图会独立解析。review 类任务会使用 review overlay，delivery 类任务会继续使用面向改动交付的 overlay。
  - 手动指定 `--mode intensive` 不会单独开启 verifier harness；只有启用 `--loop` 时 verifier harness 才会生效。
  - 默认值：
    - `glm chat`：`standard`
    - `glm run`：`standard`
    - `glm run --loop`：`intensive`

## 解析说明

- Provider/API/model 会从 CLI flags、环境变量和持久化配置综合解析，逻辑在 `src/providers/index.ts` 与 `src/app/env.ts`。
- 推荐的操作流程是：先选 `provider`，按需覆盖 `api`，再指定 `model`。
- `custom` 适用于代理网关、本地模型和未知模型。可以先用模型名直接试跑，再通过 `modelOverrides` 细化能力参数；默认 generic 能力是保守兜底，不代表最佳参数。
- Loop options 解析在 `src/app/env.ts`。
- Session 路径派生在 `src/session/session-paths.ts`。
- 打包的 prompts/extensions 同步逻辑在 `src/app/resource-sync.ts`。
