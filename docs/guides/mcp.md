<p align="right">
  <strong>English</strong> | <a href="./mcp.zh.md" aria-label="Switch to Chinese version of this document">中文</a>
</p>

# MCP (Model Context Protocol)

glm can load MCP servers from a config file and expose their tools to the agent.

## Config file

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

## MCP adapter modes

Each server can opt into its own `toolMode`:

- `direct`: default mode. Connect eagerly at startup and register each remote tool as a first-class tool.
- `proxy`: register only a single `mcp__<server>__proxy` tool and connect lazily on demand.
- `hybrid`: prefer the local metadata cache; if the cache is valid, register direct tools from cache, otherwise fall back to `proxy`.

Cache-related settings:

- `cacheMaxAgeMs`: per-server cache TTL, default 7 days
- `GLM_MCP_CACHE_PATH`: overrides the global cache file location
- the metadata cache stores tool names, descriptions, and input schemas only, never tool results

In `hybrid` mode, if no valid cache is available at startup, glm falls back to `proxy`. After the first successful live connection refreshes the cache, run `/mcp reload` or restart the session to switch to cached direct tools.

## BigModel Coding Plan MCP examples

Add the following to `~/.glm/mcp.json`:

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

## Tool names

MCP tools are registered with a stable namespaced name:
`mcp__<server>__<tool>`

Example: server `"brave-search"` tool `"web_search"` becomes `mcp__brave-search__web_search` (normalized to lowercase/underscores).

## Interactive usage

- `/mcp` shows which MCP servers were loaded.
- `/mcp reload` reloads extensions (use after editing `mcp.json`).
