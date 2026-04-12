# glm-agent-cli

Agent CLI for GLM.

## Requirements
`glm` requires Node.js 22 or later because it embeds the Pi SDK and uses modern ECMAScript modules.

## Installing
```
npm install
```
This installs the CLI dependencies and prepares the `dist/` output via `npm run build`.

## Default `glm` command
Running `glm` (without subcommands) starts the interactive chat session against the current working directory. The CLI syncs the packaged resources into `~/.glm/agent`, initializes the embedded Pi session, and prompts you for the next action.

## `glm run "<task>"`
Use `glm run` for one-shot tasks. Provide the task description in quotes, and the command will execute through Pi's `runPrintMode`, returning the output once the model finishes. It's useful for scripting or repeated automation.

## `glm auth login`
This command prompts for the provider credentials you want to store under `~/.glm/config.json` (GLM official, OpenAI-compatible, or Anthropic-compatible). Credentials are only stored locally and are later read by `glm doctor` and the main runtime.

## `glm doctor`
Running `glm doctor` performs local health checks: it verifies the working directory, ensures credentials exist (env variables or stored config), and confirms that `~/.glm/agent/prompts/system.md` is available. Use it before a session to detect missing prerequisites.

## Anthropic compatibility
Set `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` when you need to reuse existing Anthropic-compatible workflows. The CLI maps this environment to an internal `anthropic` provider and honors the same runtime flags as the GLM official mode.

## `--yolo`
Append `--yolo` to any command (`glm`, `glm run`, etc.) to skip the interactive approval flow (`approvalPolicy` becomes `never`) while keeping the hard safety policies intact (e.g., destructive shell commands are still blocked). This flag only affects the current invocation.

