<p align="right">
  <strong>English</strong> | <a href="./README.md" aria-label="Switch to Chinese version of this README">中文</a>
</p>

# glm

Local-first agent CLI for GLM (general-purpose for local projects and workflows).

npm package: `@angeiv/glm`  
command: `glm`

## Highlights
- GLM-native provider by default (BigModel / z.ai), plus OpenAI-compatible and Anthropic-compatible routes
- Delivery-quality loop: multi-round execution + verifier + repair with reusable verification artifacts
- MCP (Model Context Protocol) integration (local stdio and remote transports)
- Dangerous commands always require explicit approval (even with `--yolo` / relaxed policies)
- `glm inspect` / `glm verify` / `glm doctor` for runtime observability and diagnostics

## Requirements
- Node.js 22 or newer

## Install

Global install:
```bash
npm install -g @angeiv/glm
# or
pnpm add -g @angeiv/glm
```

Run without installing:
```bash
npx -y @angeiv/glm --help
```

## Quick start

```bash
glm
glm chat /path/to/project
glm run "fix the failing tests"
glm run "fix the failing tests" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff
glm verify smoke
glm inspect --json
```

## Documentation
- Documentation index: [docs/README.md](./docs/README.md)
- CLI guide: [docs/guides/cli.md](./docs/guides/cli.md)
- MCP guide: [docs/guides/mcp.md](./docs/guides/mcp.md)
- Full config/env surface: [docs/references/config-surface.md](./docs/references/config-surface.md)
- Repo docs: [ARCHITECTURE.md](./ARCHITECTURE.md) / [AGENTS.md](./AGENTS.md)

## Development
```bash
corepack enable
pnpm install
pnpm test
pnpm dev -- --help
```

## License
MIT
