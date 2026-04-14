# glm-cli

Agent CLI for GLM.

npm package: `@angeiv/glm`  
command: `glm`

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
Skip the interactive approval flow (`approvalPolicy` toggles to `never`) for normal tool calls. Dangerous shell commands (for example `rm`) still require explicit confirmation. The flag applies to the current command invocation only.

In interactive mode, you can also switch the policy on the fly:
- `/approval ask|auto|never` (alias: `/policy`)
