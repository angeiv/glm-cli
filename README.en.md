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
# Start an interactive session (default command)
glm

# Start an interactive session in a specific directory (used as the working dir)
glm chat /path/to/project

# Run a one-shot task and exit
glm run "fix the failing tests"

# Enable the delivery-quality loop: run -> verify -> repair (up to 4 rounds), hand off on failure
glm run "fix the failing tests" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff

# Run a built-in verification scenario (smoke/test/build)
glm verify smoke

# Inspect the effective runtime state (provider/model/loop/MCP/approval)
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
