<p align="right">
  <strong>English</strong> | <a href="./README.md" aria-label="Switch to Chinese version of this README">中文</a>
</p>

# glm-cli

Agent CLI for GLM.

npm package: `@angeiv/glm`  
command: `glm`

## Requirements
- Node.js 22 or newer (required by the embedded Pi SDK and native ECMAScript module usage)

## Installing
```
corepack enable
pnpm install
```
This sets up the dependencies and prepares the CLI entrypoint so `pnpm run build` can create `dist/loader.js`.

## Usage
### `glm`
Runs the default interactive chat session. The CLI bootstraps product directories under `~/.glm`, syncs the packaged prompts/tools, and starts Pi in interactive mode. You can add runtime flags like `--provider`, `--model`, `--cwd`, or `--yolo` to adjust the session.

### `glm chat [path]`
Starts interactive chat and optionally uses `[path]` as the working directory for that session.

### `glm run "<task>" [path]`
Executes a single task through Pi's `runPrintMode`. Wrap the task description in quotes if it contains spaces. Global flags such as `--provider`, `--model`, `--cwd`, and `--yolo` behave the same as in the interactive mode.

### `glm doctor`
Performs local health checks before you start a session:

- Validates the current working directory is accessible.
- Verifies credentials for the effective provider only (glm, openai-compatible, or anthropic compatibility mode).
- Reports whether `~/.glm/agent/prompts/system.md` is already synced; missing resources are reported as "will sync on first run" instead of failing because the main CLI populates them automatically.

### Credentials
Configure provider credentials via environment variables or `~/.glm/config.json`:

- GLM (`--provider glm`): `GLM_API_KEY` (optional: `GLM_BASE_URL`) or config `providers.glm`
- OpenAI compatible: `OPENAI_API_KEY` (optional: `OPENAI_BASE_URL`, `OPENAI_MODEL`) or config `providers["openai-compatible"]`
- Anthropic compatibility: `ANTHROPIC_AUTH_TOKEN` (optional: `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`) (env only)

Official GLM base URL options (`GLM_BASE_URL` or `providers.glm.baseURL`):
- BigModel API: `https://open.bigmodel.cn/api/paas/v4/`
- BigModel Coding Plan: `https://open.bigmodel.cn/api/coding/paas/v4/`
- z.ai API: `https://api.z.ai/api/paas/v4/`
- z.ai Coding Plan: `https://api.z.ai/api/coding/paas/v4/`

If you prefer a shorthand preset, set `GLM_ENDPOINT` (or `providers.glm.endpoint`) to one of: `bigmodel`, `bigmodel-coding`, `zai`, `zai-coding`. `GLM_BASE_URL` still takes precedence when set.

Example `~/.glm/config.json`:
```json
{
  "defaultProvider": "glm",
  "defaultModel": "glm-5.1",
  "approvalPolicy": "ask",
  "generation": {
    "maxOutputTokens": 8192,
    "temperature": 0.2,
    "topP": 0.9
  },
  "glmCapabilities": {
    "thinkingMode": "enabled",
    "clearThinking": false,
    "toolStream": "on",
    "responseFormat": "json_object"
  },
  "providers": {
    "glm": { "apiKey": "your_glm_key", "baseURL": "", "endpoint": "bigmodel-coding" },
    "openai-compatible": { "apiKey": "your_openai_key", "baseURL": "" }
  }
}
```

### `glm config get <key>`
Reads one supported config key and prints its value. Supported keys:
- `defaultProvider`
- `defaultModel`
- `approvalPolicy`
- `glmEndpoint`
- `maxOutputTokens`
- `temperature`
- `topP`
- `thinkingMode`
- `clearThinking`
- `toolStream`
- `responseFormat`

### `glm config set <key> <value>`
Writes supported config keys to `~/.glm/config.json`.

Common examples:
- `glm config set glmEndpoint bigmodel-coding`
- `glm config set maxOutputTokens 8192`
- `glm config set thinkingMode enabled`
- `glm config set clearThinking false`
- `glm config set toolStream on`
- `glm config set responseFormat json_object`

Optional fields can be cleared with `unset`:
- `glm config set glmEndpoint unset`
- `glm config set maxOutputTokens unset`
- `glm config set clearThinking unset`
- `glm config set responseFormat unset`

### Anthropic compatibility
When provider is not explicitly set, runtime provider resolution order is:
1. CLI flag: `--provider`
2. Env override: `GLM_PROVIDER`
3. Anthropic compatibility env: `ANTHROPIC_AUTH_TOKEN` (auto-selects provider `anthropic`)
4. OpenAI compatibility env: `OPENAI_API_KEY` (auto-selects provider `openai-compatible`)
5. Config fallback: `~/.glm/config.json` `defaultProvider`

In anthropic compatibility mode, model selection prefers `ANTHROPIC_MODEL`, then `GLM_MODEL`, then config fallback.

### `--yolo`
Skip the interactive approval flow (`approvalPolicy` toggles to `never`) for normal tool calls. Dangerous shell commands (for example `rm`) still require explicit confirmation. The flag applies to the current command invocation only.

In interactive mode, you can also switch the policy on the fly:
- `/approval ask|auto|never` (alias: `/policy`)

## MCP (Model Context Protocol)
glm can load MCP servers from a config file and expose their tools to the agent.

### Config file
Default path: `~/.glm/mcp.json`  
Override: `GLM_MCP_CONFIG=/absolute/or/~/path/to/mcp.json`  
Disable: `GLM_MCP_DISABLED=1`

glm supports local `stdio` MCP servers and remote MCP servers (`streamable-http` / `sse`). Supported format:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server-package"],
      "env": {
        "SOME_API_KEY": "..."
      }
    },
    "remote-server": {
      "type": "streamable-http",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Remote transport values:
- `type: "streamable-http"`: recommended
- `type: "http"` / `type: "streamableHttp"`: normalized to `streamable-http`
- `type: "sse"`: compatibility path for older MCP servers
- local `stdio` servers can omit `type`

### BigModel Coding Plan MCP Examples
You can drop the following into `~/.glm/mcp.json`:

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "@z_ai/mcp-server"],
      "env": {
        "Z_AI_API_KEY": "YOUR_API_KEY",
        "Z_AI_MODE": "ZHIPU"
      }
    },
    "search": {
      "type": "streamable-http",
      "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    },
    "reader": {
      "type": "streamable-http",
      "url": "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    },
    "zread": {
      "type": "streamable-http",
      "url": "https://open.bigmodel.cn/api/mcp/zread/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Notes:
- `vision` is a local stdio MCP server provided as `@z_ai/mcp-server`
- `search`, `reader`, and `zread` are remote MCP endpoints and require `Authorization: Bearer <API_KEY>`
- `search` / `reader` partially overlap with the built-in `web_search` / `web_fetch`; if you already use Coding Plan, the MCP path is usually the cleaner integration
- BigModel currently documents plan-based quota limits for `search` / `reader` / `zread`, so check your account limits before relying on them

### Tool names
MCP tools are registered with a stable namespaced name:
`mcp__<server>__<tool>`

Example: server `"brave-search"` tool `"web_search"` becomes `mcp__brave-search__web_search` (normalized to lowercase/underscores).

### Interactive usage
- `/mcp` shows which MCP servers were loaded.
- `/mcp reload` reloads extensions (use after editing `mcp.json`).

## Pi Settings (Model/Runtime Basics)
glm embeds Pi and uses Pi's settings files for many runtime behaviors (compaction, retry, steering modes, etc):

- Global: `~/.glm/agent/settings.json`
- Per-project: `<project>/.glm/settings.json`

While streaming in interactive mode:
- `Enter` sends a steering message (`steer`) into the current generation.
- `Alt+Enter` queues a follow-up message (`followUp`) for the next turn.

Token/cost stats:
- `/stats` (or `/usage`) shows a widget with aggregated token usage (input/output/cache) for the session and current branch.
- `/stats clear` hides the widget.

## Web Tools
glm bundles two web-related tools that models can call:

- `web_search`: web search (requires configuration)
- `web_fetch`: fetch a URL and extract plain text (HTML is stripped)

`web_search` configuration (pick one):
- Brave Search API: set `BRAVE_API_KEY`
- SearxNG JSON endpoint: set `GLM_WEB_SEARCH_URL` (example: `https://your-searx-instance/search`)

If you already use MCP for web/search/browsing, you can skip `web_search` and rely on MCP tools instead.

## Generation Overrides (Env)
You can set default generation parameters via env vars (applied to provider request payloads):

- `GLM_MAX_OUTPUT_TOKENS=8192`
- `GLM_TEMPERATURE=0.2`
- `GLM_TOP_P=0.9`

Equivalent config file keys:
- `generation.maxOutputTokens`
- `generation.temperature`
- `generation.topP`

## BigModel/z.ai Capabilities
BigModel + z.ai OpenAI-compatible endpoints differ slightly from OpenAI's Chat Completions API. `glm` patches outgoing payloads so Pi works out of the box:

- Uses `max_tokens` (BigModel docs) instead of `max_completion_tokens`.
- Maps Pi "thinking" toggles to BigModel's `thinking: { type: "enabled" | "disabled" }` request format.
- Supports forcing `thinking` on/off via `thinkingMode`, even when Pi does not emit a toggle.
- Can explicitly control `tool_stream` via `toolStream` when tools are present and `stream: true`.
- Supports structured JSON output via `responseFormat=json_object`.

Optional env knobs:
- `GLM_THINKING_MODE=auto|enabled|disabled`
- `GLM_CLEAR_THINKING=0|1`: sets `thinking.clear_thinking` when the request includes `thinking`. (`0` is preserved thinking, per BigModel docs.)
- `GLM_TOOL_STREAM=auto|on|off`
- `GLM_RESPONSE_FORMAT=json_object`: adds `response_format: { type: "json_object" }` to requests (can interfere with tool calling; enable only when you need strict JSON output).

Equivalent config file keys:
- `glmCapabilities.thinkingMode`
- `glmCapabilities.clearThinking`
- `glmCapabilities.toolStream`
- `glmCapabilities.responseFormat`
