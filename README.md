# glm-agent-cli

Agent CLI for GLM.

## Requirements
- Node.js 22 or newer (required by the embedded Pi SDK and native ECMAScript module usage)

## Installing
```
npm install
```
This sets up the dependencies and prepares the CLI entrypoint so `npm run build` can create `dist/loader.js`.

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
Configure provider credentials via environment variables:

- GLM official: `GLM_API_KEY` (optional: `GLM_BASE_URL`)
- OpenAI compatible: `OPENAI_API_KEY` (optional: `OPENAI_BASE_URL`, `OPENAI_MODEL`)
- Anthropic compatibility: `ANTHROPIC_AUTH_TOKEN` (optional: `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`)

### `glm config get <key>`
Reads one supported config key and prints its value. Supported keys:
- `defaultProvider`
- `defaultModel`
- `approvalPolicy`

### `glm config set <key> <value>`
Writes one supported config key (`defaultProvider`, `defaultModel`, or `approvalPolicy`) to `~/.glm/config.json`.

### Anthropic compatibility
When provider is not explicitly set, runtime provider resolution order is:
1. CLI flag: `--provider`
2. Env override: `GLM_PROVIDER`
3. Anthropic compatibility env: `ANTHROPIC_AUTH_TOKEN` (auto-selects provider `anthropic`)
4. OpenAI compatibility env: `OPENAI_API_KEY` (auto-selects provider `openai-compatible`)
5. Config fallback: `~/.glm/config.json` `defaultProvider`

In anthropic compatibility mode, model selection prefers `ANTHROPIC_MODEL`, then `GLM_MODEL`, then config fallback.

### `--yolo`
Skip the interactive approval flow (`approvalPolicy` toggles to `never`) while keeping the hard safety policy intact (destructive tool calls are still blocked). The flag applies to the current command invocation only.
