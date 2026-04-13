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

### `glm run "<task>"`
Executes a single task through Pi's `runPrintMode`. Wrap the task description in quotes if it contains spaces. Global flags such as `--provider`, `--model`, `--cwd`, and `--yolo` behave the same as in the interactive mode.

### `glm doctor`
Performs local health checks before you start a session:

- Validates the current working directory is accessible.
- Verifies credentials for the effective provider only (glm-official, openai-compatible, or anthropic compatibility mode).
- Reports whether `~/.glm/agent/prompts/system.md` is already synced; missing resources are reported as "will sync on first run" instead of failing because the main CLI populates them automatically.

### `glm auth login`
Prompts for the provider (`glm-official` or `openai-compatible`), the API key, and an optional base URL. Credentials are persisted under `~/.glm/config.json` so `glm doctor`, `glm`, and `glm run` can pick them up without repeating the prompt.

### Anthropic compatibility
Set `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` when you already rely on Anthropic-style wrappers or gateways. The CLI maps that trio to an internal `anthropic` provider without overriding the core product defaults.

### `--yolo`
Skip the interactive approval flow (`approvalPolicy` toggles to `never`) while keeping the hard safety policy intact (destructive tool calls are still blocked). The flag applies to the current command invocation only.
