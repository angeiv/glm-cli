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

## Common usage

```bash
# 1. Use the default configured provider/api/model
glm

# 2. Explicitly use BigModel Coding
GLM_API_KEY=your-key \
glm --provider bigmodel-coding --model glm-5.1

# 3. Use a GLM model hosted on OpenRouter
OPENAI_API_KEY=your-key \
glm --provider openrouter --model ZhipuAI/GLM-5

# 4. Connect to a custom OpenAI-compatible gateway
OPENAI_API_KEY=your-key \
OPENAI_BASE_URL=https://gateway.example.com/v1 \
glm --provider custom --api openai-compatible --model my-model

# 5. Connect to a custom Anthropic-compatible gateway
ANTHROPIC_AUTH_TOKEN=your-token \
ANTHROPIC_BASE_URL=https://gateway.example.com/v1/messages \
glm --provider custom --api anthropic --model my-model

# 6. Connect to a local OpenAI-compatible model server
OPENAI_BASE_URL=http://127.0.0.1:8000/v1 \
glm --provider custom --model qwen2.5-coder-32b-instruct

# 7. Disable gateway /models discovery and use only the explicit model plus curated catalog
glm config set modelDiscoveryEnabled false
```

If you only remember one rule:

- choose `provider`
- optionally override `api`
- then set `model`

For deeper usage such as `custom` capability tuning, `modelOverrides`, MCP, loop behavior, verification, and `/models` discovery cache controls, use the detailed docs below.

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
