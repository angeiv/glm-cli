<p align="right">
  <a href="./README.en.md" aria-label="Switch to English version of this README">English</a> | <strong>中文</strong>
</p>

# glm-cli

GLM 的 Agent CLI。

npm 包名：`@angeiv/glm`  
命令：`glm`

## 环境要求
- Node.js 22 或更高版本（内置的 Pi SDK 与原生 ESM 运行方式要求）

## 安装
```
corepack enable
pnpm install
```
这会安装依赖并准备 CLI 入口，随后可通过 `pnpm run build` 生成 `dist/loader.js`。

## 使用方式
### `glm`
启动默认的交互式会话。CLI 会在 `~/.glm` 下初始化产品目录、同步内置 prompts 和 tools，并以 Pi 的交互模式启动。你也可以追加 `--provider`、`--model`、`--cwd`、`--yolo` 等运行参数。

### `glm chat [path]`
启动交互式聊天，并可选地将 `[path]` 作为本次会话的工作目录。

### `glm run "<task>" [path]`
通过 Pi 的 `runPrintMode` 执行单次任务。如果任务描述包含空格，请用引号包裹。`--provider`、`--model`、`--cwd`、`--yolo` 等全局参数与交互模式保持一致。

### `glm doctor`
在启动会话前执行本地健康检查：

- 校验当前工作目录是否可访问。
- 仅检查当前生效 provider 的凭据（`glm`、`openai-compatible`、`anthropic` 兼容模式）。
- 检查 `~/.glm/agent/prompts/system.md` 是否已经同步；若尚未同步，会报告为“首次运行时将自动同步”，而不是直接报错。

### 凭据配置
可通过环境变量或 `~/.glm/config.json` 配置 provider 凭据：

- GLM（`--provider glm`）：`GLM_API_KEY`（可选：`GLM_BASE_URL`）或配置文件中的 `providers.glm`
- OpenAI Compatible：`OPENAI_API_KEY`（可选：`OPENAI_BASE_URL`、`OPENAI_MODEL`）或配置文件中的 `providers["openai-compatible"]`
- Anthropic Compatible：`ANTHROPIC_AUTH_TOKEN`（可选：`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`），当前仅支持环境变量

官方 GLM base URL 选项（`GLM_BASE_URL` 或 `providers.glm.baseURL`）：
- BigModel API：`https://open.bigmodel.cn/api/paas/v4/`
- BigModel Coding Plan：`https://open.bigmodel.cn/api/coding/paas/v4/`
- z.ai API：`https://api.z.ai/api/paas/v4/`
- z.ai Coding Plan：`https://api.z.ai/api/coding/paas/v4/`

如果你更偏好简写预置，可将 `GLM_ENDPOINT`（或 `providers.glm.endpoint`）设置为 `bigmodel`、`bigmodel-coding`、`zai`、`zai-coding` 之一。若同时设置了 `GLM_BASE_URL`，后者优先级更高。

`~/.glm/config.json` 示例：
```json
{
  "defaultProvider": "glm",
  "defaultModel": "glm-5.1",
  "approvalPolicy": "ask",
  "providers": {
    "glm": { "apiKey": "your_glm_key", "baseURL": "", "endpoint": "bigmodel-coding" },
    "openai-compatible": { "apiKey": "your_openai_key", "baseURL": "" }
  }
}
```

### `glm config get <key>`
读取一个受支持的配置项并输出其值。当前支持：
- `defaultProvider`
- `defaultModel`
- `approvalPolicy`

### `glm config set <key> <value>`
将一个受支持的配置项（`defaultProvider`、`defaultModel` 或 `approvalPolicy`）写入 `~/.glm/config.json`。

### Anthropic 兼容模式
当未显式指定 provider 时，运行时会按以下顺序决定 provider：
1. CLI 参数：`--provider`
2. 环境变量覆盖：`GLM_PROVIDER`
3. Anthropic 兼容环境变量：`ANTHROPIC_AUTH_TOKEN`（自动选择 `anthropic`）
4. OpenAI Compatible 环境变量：`OPENAI_API_KEY`（自动选择 `openai-compatible`）
5. 配置文件回退：`~/.glm/config.json` 中的 `defaultProvider`

在 Anthropic 兼容模式下，模型选择顺序为：`ANTHROPIC_MODEL`、`GLM_MODEL`、配置文件默认值。

### `--yolo`
跳过普通 tool call 的交互式审批流程（会将 `approvalPolicy` 设为 `never`）。危险 shell 命令（例如 `rm`）仍然必须显式确认。该参数只对当前命令生效。

在交互模式下，也可以动态切换策略：
- `/approval ask|auto|never`（别名：`/policy`）

## MCP（Model Context Protocol）
glm 可以从配置文件中加载 MCP server，并把它们暴露为可供 agent 调用的工具。

### 配置文件
默认路径：`~/.glm/mcp.json`  
覆盖路径：`GLM_MCP_CONFIG=/absolute/or/~/path/to/mcp.json`  
禁用：`GLM_MCP_DISABLED=1`

支持的格式如下（兼容常见 MCP client）：
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server-package"],
      "env": {
        "SOME_API_KEY": "..."
      }
    }
  }
}
```

### 工具命名
MCP 工具会被注册为稳定的命名空间形式：
`mcp__<server>__<tool>`

示例：server `"brave-search"` 下的工具 `"web_search"` 会注册为 `mcp__brave-search__web_search`（内部会归一化为小写和下划线）。

### 交互模式用法
- `/mcp`：显示当前已加载的 MCP servers
- `/mcp reload`：重新加载扩展（修改 `mcp.json` 后可执行）

## Pi 设置（模型 / 运行时基础）
glm 内嵌了 Pi，并沿用 Pi 的 settings 文件管理很多运行时行为（如 compact、retry、steering 模式等）：

- 全局：`~/.glm/agent/settings.json`
- 项目级：`<project>/.glm/settings.json`

在交互模式流式输出时：
- `Enter` 会发送 steering message（`steer`）到当前生成过程
- `Alt+Enter` 会将 follow-up message（`followUp`）排队到下一轮

Token / 成本统计：
- `/stats`（或 `/usage`）会在编辑器下方显示当前 session 与当前 branch 的聚合 token 使用情况（input / output / cache）
- `/stats clear` 用于隐藏该 widget

## Web Tools
glm 内置了两个可被模型调用的 web 相关工具：

- `web_search`：网页搜索（需额外配置）
- `web_fetch`：抓取 URL 并提取纯文本内容（会剥离 HTML）

`web_search` 的配置方式（二选一）：
- Brave Search API：设置 `BRAVE_API_KEY`
- SearxNG JSON endpoint：设置 `GLM_WEB_SEARCH_URL`（例如 `https://your-searx-instance/search`）

如果你已经通过 MCP 提供了网页搜索 / 浏览能力，也可以不使用内置的 `web_search`。

## 生成参数覆盖（环境变量）
可通过环境变量为请求默认附加生成参数（会直接写入 provider 请求 payload）：

- `GLM_MAX_OUTPUT_TOKENS=8192`
- `GLM_TEMPERATURE=0.2`
- `GLM_TOP_P=0.9`

## BigModel / z.ai 能力适配
BigModel 与 z.ai 的 OpenAI Compatible 接口和标准 OpenAI Chat Completions API 存在一些差异。`glm` 已在请求发送前进行补丁处理，以便 Pi 可以直接工作：

- 使用 `max_tokens`（BigModel 文档格式），而不是 `max_completion_tokens`
- 将 Pi 的 thinking 开关映射为 BigModel 的 `thinking: { type: "enabled" | "disabled" }`
- 当请求包含 tools 且 `stream: true` 时，启用 `tool_stream: true` 以获得工具参数的流式增量输出

可选环境变量：
- `GLM_CLEAR_THINKING=0|1`：当请求中包含 `thinking` 时，设置 `thinking.clear_thinking`（按 BigModel 文档，`0` 表示 preserved thinking）
- `GLM_RESPONSE_FORMAT=json_object`：为请求添加 `response_format: { type: "json_object" }`（可能与 tool calling 互相影响，仅在确实需要严格 JSON 输出时启用）
