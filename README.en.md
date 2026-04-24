<p align="right">
  <strong>English</strong> | <a href="./README.md" aria-label="Switch to Chinese version of this README">中文</a>
</p>

# glm-cli

Agent CLI for GLM.

npm package: `@angeiv/glm`  
command: `glm`

## Requirements
- Node.js 22 or newer (required by the current runtime SDK and native ECMAScript module usage)

## Installing
```
corepack enable
pnpm install
```
This sets up the dependencies and prepares the CLI entrypoint so `pnpm run build` can create `dist/loader.js`.

## Project docs
- [AGENTS.md](./AGENTS.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/references/config-surface.md](./docs/references/config-surface.md)

## Usage
### `glm`
Runs the default interactive chat session. The CLI bootstraps product directories under `~/.glm`, syncs the packaged prompts/tools, and enters the default interactive mode. You can add runtime flags like `--provider`, `--model`, `--cwd`, or `--yolo` to adjust the session.

### `glm chat [path]`
Starts interactive chat and optionally uses `[path]` as the working directory for that session.

### `glm run "<task>" [path]`
Runs a single task by default. Wrap the task description in quotes if it contains spaces. Global flags such as `--provider`, `--model`, `--cwd`, and `--yolo` behave the same as in the interactive mode.

You can explicitly enable the delivery-quality loop:
```bash
glm run "fix the failing tests" --loop
glm run "fix the failing tests" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff
```

The current loop implementation is `code`-first:
- sends a loop contract + task on round 1
- runs a verifier after each round
- sends a repair prompt when verification fails
- exits with either `handoff` or `fail` when verification keeps failing or is unavailable

### Prompt lanes (`--mode`)
`--mode` selects a prompt lane (execution style). It changes the instruction overlay the model receives, but it does not toggle runtime behavior (for example, whether the loop runs).

- `--loop` controls whether the delivery-quality loop runs (multi-round + verifier).
- `--mode` controls how the model should execute within a round (planning vs. direct action, verification emphasis).

Available lanes:
- `direct`: best for small, well-scoped changes (rename, small bugfix, quick diagnosis). Prefer doing over planning.
- `standard`: recommended default for most tasks; uses a short plan for non-trivial work and verifies when practical.
- `intensive`: best for complex or high-risk tasks (large refactors, flaky tests, heavy verification). More explicit planning and stricter verification.

Defaults:
- `glm chat` defaults to `standard`
- `glm run` defaults to `standard`
- `glm run --loop` defaults to `intensive` (the loop assumes a higher-intensity delivery path)

Examples:
```bash
glm --mode direct
glm run "fix xxx" --mode standard
glm run "refactor Y" --loop --mode intensive
# Even with --loop, you can lower the prompt lane (the loop still runs)
glm run "fix tests" --loop --mode standard
```

Docs:
- This README: “Prompt lanes (`--mode`)”
- [docs/references/config-surface.md](./docs/references/config-surface.md) (flag resolution notes)

### `glm verify [path]`
Runs the verifier for the current project. By default, glm auto-detects the test command; you can override it with `--verify "<command>"`. Each run writes a structured artifact to `~/.glm/sessions/.../artifacts/verify-*.json` so later loop, resume, or human handoff steps can reuse the result.

Common examples:
```bash
glm verify
glm verify smoke
glm verify build
glm verify --verify "pnpm test"
glm verify --json
```

### `glm doctor`
Performs local health checks before you start a session:

- Validates the current working directory is accessible.
- Verifies credentials for the effective provider only (glm, openai-compatible, or anthropic compatibility mode).
- Reports whether `~/.glm/agent/prompts/system.md` is already synced; missing resources are reported as "will sync on first run" instead of failing because the main CLI populates them automatically.
- Prints a compact runtime snapshot so you can see the effective provider, model, approval, loop, MCP, and diagnostics state.

### `glm inspect`
Prints the effective runtime snapshot for the current command context. This is useful when you need to explain why provider/model/approval/loop/MCP settings resolved the way they did.
If the current session has verification artifacts, it also shows the latest verification status, summary, and artifact path.

Common examples:
```bash
glm inspect
glm inspect --json
glm inspect --provider anthropic --model "ZhipuAI/GLM-5"
```

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
  "debugRuntime": false,
  "eventLogLimit": 200,
  "notifications": {
    "enabled": false,
    "onTurnEnd": true,
    "onLoopResult": true
  },
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
  "loop": {
    "enabledByDefault": false,
    "profile": "code",
    "maxRounds": 3,
    "failureMode": "handoff",
    "autoVerify": true
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
- `debugRuntime`
- `eventLogLimit`
- `notificationsEnabled`
- `notificationsOnTurnEnd`
- `notificationsOnLoopResult`
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

### `glm config set <key> <value>`
Writes supported config keys to `~/.glm/config.json`.

Common examples:
- `glm config set glmEndpoint bigmodel-coding`
- `glm config set debugRuntime true`
- `glm config set eventLogLimit 500`
- `glm config set notificationsEnabled true`
- `glm config set notificationsOnTurnEnd true`
- `glm config set notificationsOnLoopResult true`
- `glm config set maxOutputTokens 8192`
- `glm config set thinkingMode enabled`
- `glm config set clearThinking false`
- `glm config set toolStream on`
- `glm config set responseFormat json_object`
- `glm config set loopEnabledByDefault true`
- `glm config set loopMaxRounds 4`
- `glm config set loopVerifyCommand "pnpm test"`

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
- `/inspect`
- `/events`
- `/events clear`

System notifications:
- When `notifications.enabled=true`, glm emits local notifications on supported terminals
- `notifications.onTurnEnd` controls normal turn-complete notifications
- `notifications.onLoopResult` controls explicit or automatic loop terminal-result notifications
- Environment overrides are also supported: `GLM_NOTIFY_ENABLED`, `GLM_NOTIFY_ON_TURN_END`, `GLM_NOTIFY_ON_LOOP_RESULT`
- Optional sound hook: `GLM_NOTIFY_SOUND_CMD='...'`

## MCP (Model Context Protocol)
glm can load MCP servers from a config file and expose their tools to the agent.

### Config file
Default path: `~/.glm/mcp.json`  
Override: `GLM_MCP_CONFIG=/absolute/or/~/path/to/mcp.json`  
Metadata cache: `~/.glm/agent/mcp-cache.json`
Override cache path: `GLM_MCP_CACHE_PATH=/absolute/or/~/path/to/mcp-cache.json`
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
      },
      "toolMode": "hybrid",
      "cacheMaxAgeMs": 604800000
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

### MCP adapter modes
Each server can opt into its own `toolMode`:

- `direct`: default mode. Connect eagerly at startup and register each remote tool as a first-class tool.
- `proxy`: register only a single `mcp__<server>__proxy` tool and connect lazily on demand.
- `hybrid`: prefer the local metadata cache; if the cache is valid, register direct tools from cache, otherwise fall back to `proxy`.

Cache-related settings:
- `cacheMaxAgeMs`: per-server cache TTL, default 7 days
- `GLM_MCP_CACHE_PATH`: overrides the global cache file location
- the metadata cache stores tool names, descriptions, and input schemas only, never tool results

In `hybrid` mode, a cold start without valid cache begins in `proxy` mode. After the first successful live connection refreshes the cache, run `/mcp reload` or restart the session to switch to cached direct tools.

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
      },
      "toolMode": "hybrid"
    },
    "search": {
      "type": "streamable-http",
      "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "toolMode": "proxy"
    },
    "reader": {
      "type": "streamable-http",
      "url": "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "toolMode": "hybrid"
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
- the example uses `hybrid` for `vision` / `reader`, which is a good fit when you want cached direct tools without eager startup connections
- the example uses `proxy` for `search`, which is a better fit when the tool surface changes often or you prefer a single stable entrypoint
- `search` / `reader` partially overlap with the built-in `web_search` / `web_fetch`; if you already use Coding Plan, the MCP path is usually the cleaner integration
- BigModel currently documents plan-based quota limits for `search` / `reader` / `zread`, so check your account limits before relying on them

### Tool names
MCP tools are registered with a stable namespaced name:
`mcp__<server>__<tool>`

Example: server `"brave-search"` tool `"web_search"` becomes `mcp__brave-search__web_search` (normalized to lowercase/underscores).

### Interactive usage
- `/mcp` shows which MCP servers were loaded.
- `/mcp reload` reloads extensions (use after editing `mcp.json`).

## Runtime Settings (Model/Session Basics)
glm uses the following settings files for many runtime behaviors (compaction, retry, steering modes, etc):

- Global: `~/.glm/agent/settings.json`
- Per-project: `<project>/.glm/settings.json`

While streaming in interactive mode:
- `Enter` sends a steering message (`steer`) into the current generation.
- `Alt+Enter` queues a follow-up message (`followUp`) for the next turn.

Token/cost stats:
- `/stats` (or `/usage`) shows a widget with aggregated token usage (input/output/cache) for the session and current branch.
- `/stats clear` hides the widget.

Delivery-quality loop:
- `/loop status`
- `/loop history [n]`
- `/loop show <index>`
- `/loop on`
- `/loop off`
- `/loop verify <cmd>`
- `/loop clear-verify`
- `/loop run <task>`

Notes:
- `/loop on` and `/loop off` arm or disarm the loop at the session level. Once armed, normal chat turns are also verified after `agent_end`, and failed verification sends a repair prompt automatically.
- `/loop run` executes an explicit loop inside the current session. It suppresses the automatic hook for that session while the manual loop is running.
- `/loop status` shows static loop config, the currently active loop round / verifier source, and the most recent loop result / terminal summary.
- `/loop history [n]` shows recent session-local loop results in reverse chronological order. The default limit is 5.
- `/loop show <index>` expands one entry from the reverse-chronological history view, including verifier kind, exit code, and stdout/stderr summaries.
- The interactive footer/status bar shows a compact loop state such as `loop armed` or `loop auto r2/3`.
- verifier priority is: explicit `/loop verify` > config `loop.verifyCommand` > auto-detection.

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
BigModel + z.ai OpenAI-compatible endpoints differ slightly from OpenAI's Chat Completions API. `glm` patches outgoing payloads so the runtime works out of the box:

- Uses `max_tokens` (BigModel docs) instead of `max_completion_tokens`.
- Maps runtime "thinking" toggles to BigModel's `thinking: { type: "enabled" | "disabled" }` request format.
- Supports forcing `thinking` on/off via `thinkingMode`, even when the runtime does not emit a toggle.
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
