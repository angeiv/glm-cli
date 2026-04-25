<p align="right">
  <a href="./cli.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# CLI 使用指南

本指南介绍 `glm` 的日常使用方式。完整的配置项与环境变量列表请看：

- [config-surface.zh.md](../references/config-surface.zh.md)
- [mcp.zh.md](./mcp.zh.md)

## 快速开始

```bash
# 在当前目录启动交互式会话
glm

# 执行单次任务并退出
glm run "修复测试失败"

# 启用交付质量 loop
glm run "修复测试失败" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff

# 查看当前命令上下文下的生效配置
glm inspect --json
```

## 命令

### `glm` / `glm chat [path]`

启动交互式会话。若提供 `[path]`，则该路径作为本次会话的工作目录。

### `glm run "<task>" [path]`

执行单次任务。若任务描述包含空格请加引号。可选的 `[path]` 用于覆盖工作目录。

### `glm verify [path]`

运行当前项目的 verifier。默认会自动探测测试/构建命令，也可以通过 `--verify "<command>"` 显式指定。每次执行都会把结构化结果写入 `~/.glm/sessions/.../artifacts/verify-*.json`，便于 loop、resume 或人工排查复用。

常用示例：

```bash
glm verify
glm verify smoke
glm verify build
glm verify --verify "pnpm test"
glm verify --json
```

### `glm inspect`

输出当前命令上下文下的 runtime snapshot（provider/model/approval/loop/MCP 等）。

```bash
glm inspect
glm inspect --json
```

### `glm doctor`

执行本地诊断（cwd 可访问性、当前 provider 的凭据、资源同步状态等）。

### `glm config get|set`

读取/写入 `~/.glm/config.json` 中受支持的配置项。

支持的 key 列表见 [config-surface.zh.md](../references/config-surface.zh.md)。

## 全局参数（flags）

以下 flags 同时适用于 `glm`、`glm chat`、`glm run`：

- `--provider <name>`：`glm`、`openai-compatible`、`openai-responses`、`anthropic`
- `--model <id>`：模型 ID（支持 `ZhipuAI/GLM-5` 等别名）
- `--cwd <path>`：覆盖工作目录
- `--mode <direct|standard|intensive>`：覆盖 prompt lane
- `--yolo`：跳过非危险命令的确认（危险命令仍必须确认）
- `--loop`：启用交付质量 loop
- `--verify <command>`：loop 的 verifier 命令（或 `glm verify` 覆盖）
- `--max-rounds <n>`：loop 最大轮数
- `--fail-mode <handoff|fail>`：loop 终止策略

## Prompt lane（`--mode`）

`--mode` 用来选择 prompt lane（执行风格）。它会影响模型收到的执行指导（prompt overlay），但不会改变 runtime 的开关逻辑（例如是否启用 loop）。

- `direct`：适合非常小且明确的改动（改文案、修复小型缺陷、快速定位问题），更倾向于直接执行、减少规划。
- `standard`：默认推荐；对一般开发任务会先做简短计划，再实现并在可行时验证。
- `intensive`：适合复杂或高风险任务（大范围重构、测试不稳定、需要更多自检），更强调明确计划和严格验证。

默认行为：

- `glm chat` 默认 `standard`
- `glm run` 默认 `standard`
- `glm run --loop` 默认 `intensive`

你也可以通过 `glm config set taskLaneDefault <auto|direct|standard|intensive>` 覆盖上述默认值。

当 `taskLaneDefault=auto` 时，`glm run` 会对简单任务（如文档、lint、format）自动选择 `direct`，其他情况选择 `standard`；`glm run --loop` 仍会强制使用 `intensive`。

## 审批（`--yolo` 与 `/approval`）

`--yolo` 会把当前命令调用的 `approvalPolicy` 设为 `never`（跳过非危险命令的确认）。危险 shell 命令（例如 `rm`）仍然必须显式确认。

在交互模式下也可以动态切换策略：

- `/approval ask|auto|never`（别名：`/policy`）
- `/inspect`
- `/events`
- `/events clear`

## 系统通知

通知由 `~/.glm/config.json` 的 `notifications.*` 与 `GLM_NOTIFY_*` 环境变量共同控制。

## 运行时设置（`settings.json`）

glm 使用 `settings.json` 文件管理很多运行时行为（如 compact、retry、steering 模式等）：

- 全局：`~/.glm/agent/settings.json`
- 项目级：`<project>/.glm/settings.json`

交互模式流式输出时：

- `Enter` 会发送 steering message（`steer`）到当前生成过程
- `Alt+Enter` 会将 follow-up message（`followUp`）排队到下一轮

Token / 成本统计：

- `/stats`（或 `/usage`）显示当前 session 的 token 使用情况（input / output / cache）
- `/stats clear` 隐藏 widget

交付质量 loop：

- `/loop status`
- `/loop history [n]`
- `/loop show <index>`
- `/loop on`
- `/loop off`
- `/loop verify <cmd>`
- `/loop clear-verify`
- `/loop run <task>`

## 内置 Web Tools

glm 内置了两个可被模型调用的 web 相关工具：

- `web_search`：网页搜索（需额外配置）
- `web_fetch`：抓取 URL 并提取纯文本内容（会剥离 HTML）

`web_search` 的配置方式（二选一）：

- Brave Search API：设置 `BRAVE_API_KEY`
- SearxNG JSON endpoint：设置 `GLM_WEB_SEARCH_URL`（例如 `https://your-searx-instance/search`）

如果你已经通过 MCP 提供了网页搜索/浏览能力，也可以不使用内置的 `web_search`。

## 生成参数覆盖（环境变量）

可通过环境变量为请求默认附加生成参数（会写入 provider 请求 payload）：

- `GLM_MAX_OUTPUT_TOKENS=8192`
- `GLM_TEMPERATURE=0.2`
- `GLM_TOP_P=0.9`

对应配置文件键：

- `generation.maxOutputTokens`
- `generation.temperature`
- `generation.topP`

## BigModel / z.ai OpenAI Compatible 能力适配

BigModel 与 z.ai 的 OpenAI Compatible 接口和标准 OpenAI Chat Completions API 存在一些差异。`glm` 会在请求发送前进行补丁处理：

- 使用 `max_tokens`（BigModel 文档格式），而不是 `max_completion_tokens`
- 将 runtime 的 thinking 开关映射为 BigModel 的 `thinking: { type: "enabled" | "disabled" }`
- 支持通过 `thinkingMode` 强制开启/关闭 thinking
- 当请求包含 tools 且 `stream: true` 时，可通过 `toolStream` 显式控制 `tool_stream`
- 支持通过 `responseFormat=json_object` 启用结构化 JSON 输出

可选环境变量：

- `GLM_THINKING_MODE=auto|enabled|disabled`
- `GLM_CLEAR_THINKING=0|1`：当请求中包含 `thinking` 时，设置 `thinking.clear_thinking`（按 BigModel 文档，`0` 表示 preserved thinking）
