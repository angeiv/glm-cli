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
- Verifies credentials for the effective provider only (glm-official, openai-compatible, or anthropic compatibility mode).
- Reports whether `~/.glm/agent/prompts/system.md` is already synced; missing resources are reported as "will sync on first run" instead of failing because the main CLI populates them automatically.

### `glm auth login`
Prompts for the provider (`glm-official` or `openai-compatible`), the API key, and an optional base URL. Credentials are persisted under `~/.glm/config.json` so `glm doctor`, `glm`, and `glm run` can pick them up without repeating the prompt.

### `glm auth status`
Prints credential availability for:
- `glm-official` (stored config key)
- `openai-compatible` (stored config key)
- `anthropic` compatibility mode (`ANTHROPIC_AUTH_TOKEN` env)

### `glm auth logout`
Clears persisted API keys for `glm-official` and `openai-compatible` in `~/.glm/config.json`.

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
