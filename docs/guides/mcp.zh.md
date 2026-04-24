<p align="right">
  <a href="./mcp.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# MCP（Model Context Protocol）

glm 可以从配置文件中加载 MCP server，并把它们暴露为可供 agent 调用的工具。

## 配置文件

默认路径：`~/.glm/mcp.json`  
覆盖路径：`GLM_MCP_CONFIG=/absolute/or/~/path/to/mcp.json`  
元数据缓存：`~/.glm/agent/mcp-cache.json`  
覆盖缓存路径：`GLM_MCP_CACHE_PATH=/absolute/or/~/path/to/mcp-cache.json`  
禁用：`GLM_MCP_DISABLED=1`

支持本地 `stdio` MCP 和远程 MCP（`streamable-http` / `sse`）。格式如下（兼容常见 MCP client）：

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

远程 transport 支持以下写法：

- `type: "streamable-http"`：推荐
- `type: "http"` / `type: "streamableHttp"`：会自动归一化为 `streamable-http`
- `type: "sse"`：兼容旧版 SSE MCP server
- 本地 `stdio` server 可以省略 `type`

## MCP adapter 模式

每个 server 都可以单独配置 `toolMode`：

- `direct`：默认模式。启动时直接连接 MCP server，并把远端 tools 注册成独立工具。
- `proxy`：只注册一个 `mcp__<server>__proxy` 代理工具，首次真正调用时再按需建立连接。
- `hybrid`：优先读取本地元数据缓存；命中时直接注册缓存里的独立工具，未命中或缓存过期时回退为 `proxy`。

缓存相关配置：

- `cacheMaxAgeMs`：单个 server 的缓存有效期，默认 7 天
- `GLM_MCP_CACHE_PATH`：覆盖全局缓存文件位置
- 元数据缓存只保存工具名、描述和输入 schema，不保存调用结果

`hybrid` 模式在启动时如果没有有效缓存，会先以 `proxy` 方式提供服务；首次成功连接并刷新缓存后，执行 `/mcp reload` 或重开会话即可切换为基于缓存直接注册工具的模式。

## BigModel Coding Plan MCP 示例

以下示例可写入 `~/.glm/mcp.json`：

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

说明：

- `vision` 为本地 stdio MCP，官方包名为 `@z_ai/mcp-server`
- `search` / `reader` / `zread` 为远程 MCP endpoint，需要 `Authorization: Bearer <API_KEY>`
- 示例里 `vision` / `reader` 用 `hybrid`，适合把常用 tools 缓存在本地并避免每次启动都预连
- 示例里 `search` 用 `proxy`，适合 tool 列表可能变化较快或你只想保留单一入口的场景
- `search` 和 `reader` 与内置 `web_search` / `web_fetch` 有一定能力重叠；如果你已经开通 Coding Plan，优先用 MCP 版本更一致

## 工具命名

MCP 工具会被注册为稳定的命名空间形式：
`mcp__<server>__<tool>`

示例：server `"brave-search"` 下的工具 `"web_search"` 会注册为 `mcp__brave-search__web_search`（内部会归一化为小写和下划线）。

## 交互模式用法

- `/mcp`：显示当前已加载的 MCP servers
- `/mcp reload`：重新加载扩展（修改 `mcp.json` 后可执行）
