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
- [docs/guides/cli.md](./docs/guides/cli.md)
- [docs/guides/mcp.md](./docs/guides/mcp.md)
- [docs/references/config-surface.md](./docs/references/config-surface.md)

## Quick start

```bash
glm
glm chat /path/to/repo
glm run "fix the failing tests"
glm run "fix the failing tests" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff
glm verify smoke
glm inspect --json
```

For detailed usage, see:

- [docs/guides/cli.md](./docs/guides/cli.md): commands, flags, loop, prompt lanes, web tools, etc
- [docs/guides/mcp.md](./docs/guides/mcp.md): MCP config and adapter modes
- [docs/references/config-surface.md](./docs/references/config-surface.md): full config/env surface
- `GLM_TOOL_STREAM=auto|on|off`
- `GLM_RESPONSE_FORMAT=json_object`: adds `response_format: { type: "json_object" }` to requests (can interfere with tool calling; enable only when you need strict JSON output).

Equivalent config file keys:
- `glmCapabilities.thinkingMode`
- `glmCapabilities.clearThinking`
- `glmCapabilities.toolStream`
- `glmCapabilities.responseFormat`
