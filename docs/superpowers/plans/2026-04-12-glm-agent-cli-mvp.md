# GLM Agent CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `glm` coding CLI with an embedded agent runtime, defaulting to interactive chat mode, supporting `glm run`, using the GLM official API by default, supporting OpenAI-compatible and `ANTHROPIC_*` compatibility inputs, and implementing `--yolo`.

**Architecture:** The product shell is owned by `glm` and lives in `src/`; the runtime is embedded programmatically through `createAgentSession()`, `InteractiveMode`, and `runPrintMode()`. Product-owned resources live under `resources/` and are synced into `~/.glm/agent/`, where the runtime discovers provider/policy extensions and the product system prompt.

**Tech Stack:** Node.js 22+, TypeScript, npm, embedded runtime SDK, `commander`, `zod`, `@sinclair/typebox`, `vitest`

---

## File Map

### Create

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `scripts/copy-resources.mjs`
- `src/loader.ts`
- `src/cli.ts`
- `src/commands/chat.ts`
- `src/commands/run.ts`
- `src/commands/auth.ts`
- `src/commands/config.ts`
- `src/commands/doctor.ts`
- `src/app/dirs.ts`
- `src/app/config-store.ts`
- `src/app/env.ts`
- `src/app/resource-sync.ts`
- `src/app/logger.ts`
- `src/session/managers.ts`
- `src/session/session-paths.ts`
- `src/session/create-session.ts`
- `src/runtime/chat-runtime.ts`
- `src/runtime/run-runtime.ts`
- `src/runtime/approvals.ts`
- `src/runtime/prompt.ts`
- `src/providers/types.ts`
- `src/providers/index.ts`
- `src/tools/file-tools.ts`
- `src/tools/search-tools.ts`
- `src/tools/bash-tools.ts`
- `src/tools/plan-tools.ts`
- `src/tools/index.ts`
- `resources/prompts/system.md`
- `resources/extensions/glm-providers/index.ts`
- `resources/extensions/glm-policy/index.ts`
- `tests/cli/root-command.test.ts`
- `tests/app/config-resolution.test.ts`
- `tests/providers/provider-resolution.test.ts`
- `tests/app/resource-sync.test.ts`
- `tests/session/create-session.test.ts`
- `tests/runtime/approval-policy.test.ts`
- `tests/tools/plan-tools.test.ts`
- `tests/commands/doctor.test.ts`

### Modify

- `[README.md](/Users/zhangxing/Downloads/ai-code/glm-agent-cli/README.md)` if created during implementation

### Notes

- Keep runtime-native provider and policy hooks in `resources/extensions/` because the embedded runtime loads them naturally from the synced agent directory.
- Keep CLI-side config parsing and session wiring in `src/` so the product shell stays independent from the underlying runtime.

## Task 1: Bootstrap the TypeScript CLI shell

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `scripts/copy-resources.mjs`
- Create: `src/loader.ts`
- Create: `src/cli.ts`
- Test: `tests/cli/root-command.test.ts`

- [ ] **Step 1: Write the failing root-command test**

```ts
import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../../src/cli.js";

describe("parseCliArgs", () => {
  test("defaults to chat mode when no subcommand is present", () => {
    expect(parseCliArgs([])).toMatchObject({
      command: "chat",
      yolo: false,
      cwd: process.cwd(),
    });
  });

  test("parses run mode and yolo flag", () => {
    expect(parseCliArgs(["run", "fix tests", "--yolo"])).toMatchObject({
      command: "run",
      task: "fix tests",
      yolo: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/root-command.test.ts`
Expected: FAIL with `Cannot find module '../../src/cli.js'` or missing `parseCliArgs`.

- [ ] **Step 3: Write minimal CLI bootstrap**

```json
{
  "name": "glm-agent-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "glm": "dist/loader.js"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "piConfig": {
    "name": "glm",
    "configDir": ".glm"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && node scripts/copy-resources.mjs",
    "dev": "tsx src/loader.ts",
    "test": "vitest --run"
  },
  "dependencies": {
    "@mariozechner/pi-coding-agent": "^0.66.1",
    "@sinclair/typebox": "^0.34.41",
    "chalk": "^5.6.2",
    "commander": "^14.0.0",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@types/node": "^24.3.0",
    "tsx": "^4.20.3",
    "typescript": "^5.7.3",
    "vitest": "^3.2.4"
  }
}
```

```ts
// src/cli.ts
export type ParsedCliArgs =
  | { command: "chat"; cwd: string; model?: string; provider?: string; yolo: boolean }
  | { command: "run"; cwd: string; task: string; model?: string; provider?: string; yolo: boolean };

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const cwd = process.cwd();
  const yolo = argv.includes("--yolo");
  if (argv[0] === "run") {
    return { command: "run", task: argv[1] ?? "", cwd, yolo };
  }
  return { command: "chat", cwd, yolo };
}
```

```ts
// src/loader.ts
import "./cli.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npm test -- tests/cli/root-command.test.ts && npm run build`
Expected: PASS, and `dist/loader.js` exists.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore scripts/copy-resources.mjs src/loader.ts src/cli.ts tests/cli/root-command.test.ts
git commit -m "chore: bootstrap glm typescript cli shell"
```

## Task 2: Add product directories and config resolution

**Files:**
- Create: `src/app/dirs.ts`
- Create: `src/app/config-store.ts`
- Create: `src/app/env.ts`
- Create: `src/commands/config.ts`
- Test: `tests/app/config-resolution.test.ts`

- [ ] **Step 1: Write the failing config-resolution test**

```ts
import { describe, expect, test } from "vitest";
import { resolveRuntimeConfig } from "../../src/app/env.js";

describe("resolveRuntimeConfig", () => {
  test("prefers cli flags over env and file config", () => {
    const config = resolveRuntimeConfig(
      { provider: "glm-official", model: "glm-5", yolo: true },
      {
        GLM_PROVIDER: "openai-compatible",
        GLM_MODEL: "glm-4.5",
      },
      {
        defaultProvider: "openai-compatible",
        defaultModel: "foo",
        approvalPolicy: "ask",
        providers: { glmOfficial: { apiKey: "k", baseURL: "" }, openAICompatible: { apiKey: "", baseURL: "" } },
      },
    );

    expect(config.provider).toBe("glm-official");
    expect(config.model).toBe("glm-5");
    expect(config.approvalPolicy).toBe("never");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/config-resolution.test.ts`
Expected: FAIL with missing `resolveRuntimeConfig`.

- [ ] **Step 3: Write config and directory primitives**

```ts
// src/app/dirs.ts
import { homedir } from "node:os";
import { join } from "node:path";

export function getGlmRootDir(): string {
  return join(homedir(), ".glm");
}

export function getGlmAgentDir(): string {
  return join(getGlmRootDir(), "agent");
}

export function getGlmConfigPath(): string {
  return join(getGlmRootDir(), "config.json");
}
```

```ts
// src/app/env.ts
export function resolveRuntimeConfig(cli, env, fileConfig) {
  const provider =
    cli.provider ??
    env.GLM_PROVIDER ??
    fileConfig.defaultProvider ??
    "glm-official";

  const model =
    cli.model ??
    env.GLM_MODEL ??
    env.OPENAI_MODEL ??
    env.ANTHROPIC_MODEL ??
    fileConfig.defaultModel ??
    "glm-5";

  const approvalPolicy = cli.yolo ? "never" : (fileConfig.approvalPolicy ?? "ask");

  return { provider, model, approvalPolicy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app/config-resolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dirs.ts src/app/config-store.ts src/app/env.ts src/commands/config.ts tests/app/config-resolution.test.ts
git commit -m "feat: add glm config resolution and product dirs"
```

## Task 3: Add auth flow and provider-selection logic

**Files:**
- Create: `src/commands/auth.ts`
- Create: `src/providers/types.ts`
- Create: `src/providers/index.ts`
- Test: `tests/providers/provider-resolution.test.ts`

- [ ] **Step 1: Write the failing provider-resolution test**

```ts
import { describe, expect, test } from "vitest";
import { resolveProviderSelection } from "../../src/providers/index.js";

describe("resolveProviderSelection", () => {
  test("maps ANTHROPIC_* env to anthropic compatibility mode", () => {
    const resolved = resolveProviderSelection(
      {},
      {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
        ANTHROPIC_MODEL: "glm-5",
      },
    );

    expect(resolved.provider).toBe("anthropic");
    expect(resolved.model).toBe("glm-5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/providers/provider-resolution.test.ts`
Expected: FAIL with missing `resolveProviderSelection`.

- [ ] **Step 3: Write provider and auth helpers**

```ts
// src/providers/types.ts
export type ProviderName = "glm-official" | "openai-compatible" | "anthropic";
```

```ts
// src/providers/index.ts
import type { ProviderName } from "./types.js";

export function resolveProviderSelection(cli: { provider?: ProviderName; model?: string }, env: NodeJS.ProcessEnv) {
  if (cli.provider) return { provider: cli.provider, model: cli.model };
  if (env.ANTHROPIC_AUTH_TOKEN) {
    return { provider: "anthropic" as const, model: env.ANTHROPIC_MODEL ?? "glm-5" };
  }
  if (env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    return { provider: "openai-compatible" as const, model: env.OPENAI_MODEL };
  }
  return { provider: "glm-official" as const, model: cli.model ?? env.GLM_MODEL ?? "glm-5" };
}
```

```ts
// src/commands/auth.ts
export async function authLogin(): Promise<void> {
  // prompt for GLM key and persist to ~/.glm/config.json
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/providers/provider-resolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/auth.ts src/providers/types.ts src/providers/index.ts tests/providers/provider-resolution.test.ts
git commit -m "feat: add auth and provider selection logic"
```

## Task 4: Sync packaged resources and define product prompt

**Files:**
- Create: `src/app/resource-sync.ts`
- Create: `src/runtime/prompt.ts`
- Create: `resources/prompts/system.md`
- Test: `tests/app/resource-sync.test.ts`

- [ ] **Step 1: Write the failing resource-sync test**

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { syncPackagedResources } from "../../src/app/resource-sync.js";

test("copies resources into ~/.glm/agent-style target directory", async () => {
  const target = await mkdtemp(join(tmpdir(), "glm-agent-"));
  await syncPackagedResources(target);
  const prompt = await readFile(join(target, "prompts", "system.md"), "utf8");
  expect(prompt).toContain("You are glm");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/resource-sync.test.ts`
Expected: FAIL with missing `syncPackagedResources`.

- [ ] **Step 3: Write resource sync and prompt assets**

```ts
// src/app/resource-sync.ts
import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resourcesRoot = resolve(here, "../../resources");

export async function syncPackagedResources(agentDir: string): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  await cp(resourcesRoot, agentDir, { recursive: true, force: true });
}
```

```md
<!-- resources/prompts/system.md -->
You are glm, a local-repository coding assistant.
Inspect code before editing.
Prefer structured tools over arbitrary shell output.
Respect approval policy. `--yolo` skips prompts but not hard safety denials.
Be concise.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app/resource-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/resource-sync.ts src/runtime/prompt.ts resources/prompts/system.md tests/app/resource-sync.test.ts
git commit -m "feat: add product resources and system prompt"
```

## Task 5: Register GLM/OpenAI/Anthropic-compat providers and policy hooks as runtime extensions

**Files:**
- Create: `resources/extensions/glm-providers/index.ts`
- Create: `resources/extensions/glm-policy/index.ts`
- Test: `tests/runtime/approval-policy.test.ts`

- [ ] **Step 1: Write the failing approval-policy test**

```ts
import { expect, test } from "vitest";
import { isDangerousCommand } from "../../resources/extensions/glm-policy/index.js";

test("marks rm -rf as dangerous even in yolo mode", () => {
  expect(isDangerousCommand("rm -rf /tmp/demo")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/runtime/approval-policy.test.ts`
Expected: FAIL with missing `isDangerousCommand`.

- [ ] **Step 3: Implement provider and policy extensions**

```ts
// resources/extensions/glm-providers/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const glmModels = [
  { id: "glm-5", name: "GLM 5", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
  { id: "glm-4.5", name: "GLM 4.5", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
  { id: "glm-4.5-air", name: "GLM 4.5 Air", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }
];

export default function (pi: ExtensionAPI) {
  pi.registerProvider("glm-official", {
    baseUrl: process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn/api/coding/paas/v4/",
    apiKey: "GLM_API_KEY",
    api: "openai-completions",
    models: glmModels,
  });

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    pi.registerProvider("openai-compatible", {
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: "OPENAI_API_KEY",
      api: "openai-completions",
      models: [{
        id: process.env.OPENAI_MODEL,
        name: process.env.OPENAI_MODEL,
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      }],
    });
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    pi.registerProvider("anthropic", {
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://open.bigmodel.cn/api/anthropic",
      apiKey: "ANTHROPIC_AUTH_TOKEN",
      api: "anthropic-messages",
      models: glmModels,
    });
  }
}
```

```ts
// resources/extensions/glm-policy/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export function isDangerousCommand(command: string): boolean {
  return /\brm\s+-rf\b|\bmkfs\b|\bdd\b/.test(command);
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const command = String(event.input.command ?? "");
    if (isDangerousCommand(command)) {
      return { block: true, reason: "Blocked by glm safety policy" };
    }

    const policy = process.env.GLM_APPROVAL_POLICY ?? "ask";
    if (policy === "never") return;
    if (policy === "auto" && !/git push|npm publish|sudo/.test(command)) return;
    const ok = await ctx.ui.confirm("Allow command?", command);
    if (!ok) return { block: true, reason: "Denied by user" };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/runtime/approval-policy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/extensions/glm-providers/index.ts resources/extensions/glm-policy/index.ts tests/runtime/approval-policy.test.ts
git commit -m "feat: register glm providers and approval policy extensions"
```

## Task 6: Build session services and wire `glm chat` / `glm run`

**Files:**
- Create: `src/session/managers.ts`
- Create: `src/session/session-paths.ts`
- Create: `src/session/create-session.ts`
- Create: `src/runtime/chat-runtime.ts`
- Create: `src/runtime/run-runtime.ts`
- Create: `src/commands/chat.ts`
- Create: `src/commands/run.ts`
- Test: `tests/session/create-session.test.ts`

- [ ] **Step 1: Write the failing session-factory test**

```ts
import { expect, test } from "vitest";
import { buildSessionOptions } from "../../src/session/create-session.js";

test("uses ~/.glm/agent and never policy when yolo is enabled", () => {
  const options = buildSessionOptions({
    cwd: "/tmp/demo",
    model: "glm-5",
    provider: "glm-official",
    approvalPolicy: "never",
  });

  expect(options.agentDir.endsWith("/.glm/agent")).toBe(true);
  expect(options.customTools.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/session/create-session.test.ts`
Expected: FAIL with missing `buildSessionOptions`.

- [ ] **Step 3: Implement session creation around the runtime SDK**

```ts
// src/session/create-session.ts
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  InteractiveMode,
  runPrintMode,
} from "@mariozechner/pi-coding-agent";
import { getGlmAgentDir } from "../app/dirs.js";
import { syncPackagedResources } from "../app/resource-sync.js";
import { createBuiltinTools, createPlanTools } from "../tools/index.js";

export function buildSessionOptions(input) {
  const agentDir = getGlmAgentDir();
  return {
    cwd: input.cwd,
    agentDir,
    tools: createBuiltinTools(input.cwd),
    customTools: createPlanTools(),
  };
}

export async function createGlmSession(input) {
  const options = buildSessionOptions(input);
  await syncPackagedResources(options.agentDir);
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const settingsManager = SettingsManager.create(input.cwd, options.agentDir);
  const sessionManager = SessionManager.create(input.cwd);
  const resourceLoader = new DefaultResourceLoader({ cwd: input.cwd, agentDir: options.agentDir, settingsManager });
  await resourceLoader.reload();

  return createAgentSession({
    cwd: input.cwd,
    agentDir: options.agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager,
    resourceLoader,
    tools: options.tools,
    customTools: options.customTools,
  });
}
```

```ts
// src/runtime/chat-runtime.ts
export async function runChatSession(session) {
  const interactiveMode = new InteractiveMode(session);
  await interactiveMode.run();
}
```

```ts
// src/runtime/run-runtime.ts
export async function runSingleTask(session, task: string) {
  await runPrintMode(session, { mode: "text", messages: [task] });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/session/create-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/managers.ts src/session/session-paths.ts src/session/create-session.ts src/runtime/chat-runtime.ts src/runtime/run-runtime.ts src/commands/chat.ts src/commands/run.ts tests/session/create-session.test.ts
git commit -m "feat: wire glm chat and run to embedded runtime sessions"
```

## Task 7: Add tool composition and lightweight plan tools

**Files:**
- Create: `src/tools/file-tools.ts`
- Create: `src/tools/search-tools.ts`
- Create: `src/tools/bash-tools.ts`
- Create: `src/tools/plan-tools.ts`
- Create: `src/tools/index.ts`
- Test: `tests/tools/plan-tools.test.ts`

- [ ] **Step 1: Write the failing plan-tools test**

```ts
import { expect, test } from "vitest";
import { createPlanState, updatePlan } from "../../src/tools/plan-tools.js";

test("updatePlan replaces the tracked task list", () => {
  const state = createPlanState();
  updatePlan(state, [{ step: "bootstrap", status: "in_progress" }]);
  expect(state.items).toEqual([{ step: "bootstrap", status: "in_progress" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/plan-tools.test.ts`
Expected: FAIL with missing `createPlanState` and `updatePlan`.

- [ ] **Step 3: Implement built-in tool composition and custom plan tools**

```ts
// src/tools/index.ts
import { createCodingTools } from "@mariozechner/pi-coding-agent";
import { createPlanTools } from "./plan-tools.js";

export function createBuiltinTools(cwd: string) {
  return createCodingTools({ cwd });
}

export { createPlanTools } from "./plan-tools.js";
```

```ts
// src/tools/plan-tools.ts
import { Type } from "@sinclair/typebox";

export function createPlanState() {
  return { items: [] as Array<{ step: string; status: string }> };
}

export function updatePlan(state, items) {
  state.items = items;
}

export function createPlanTools() {
  const state = createPlanState();
  return [
    {
      name: "update_plan",
      description: "Replace the current task plan",
      parameters: Type.Object({
        items: Type.Array(
          Type.Object({
            step: Type.String(),
            status: Type.String(),
          }),
        ),
      }),
      async execute(_toolCallId, params) {
        updatePlan(state, params.items);
        return {
          content: [{ type: "text", text: JSON.stringify(state.items, null, 2) }],
          details: {},
        };
      },
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/plan-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/file-tools.ts src/tools/search-tools.ts src/tools/bash-tools.ts src/tools/plan-tools.ts src/tools/index.ts tests/tools/plan-tools.test.ts
git commit -m "feat: add tool composition and plan tools"
```

## Task 8: Add doctor command and final verification

**Files:**
- Create: `src/commands/doctor.ts`
- Test: `tests/commands/doctor.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing doctor test**

```ts
import { expect, test } from "vitest";
import { runDoctor } from "../../src/commands/doctor.js";

test("reports missing credentials for default glm provider", async () => {
  const result = await runDoctor({ env: {}, cwd: process.cwd() });
  expect(result.ok).toBe(false);
  expect(result.checks.some((check) => check.id === "credentials")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands/doctor.test.ts`
Expected: FAIL with missing `runDoctor`.

- [ ] **Step 3: Implement local health checks and update README**

```ts
// src/commands/doctor.ts
export async function runDoctor({ env, cwd }) {
  const checks = [];
  checks.push({ id: "cwd", ok: Boolean(cwd) });
  checks.push({ id: "credentials", ok: Boolean(env.GLM_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_AUTH_TOKEN) });
  checks.push({ id: "resources", ok: true });
  return { ok: checks.every((c) => c.ok), checks };
}
```

Add README sections for:

- Node version and install
- `glm` default command
- `glm run`
- `glm auth login`
- `ANTHROPIC_*` compatibility
- `--yolo`

- [ ] **Step 4: Run final verification**

Run: `npm test && npm run build`
Expected: all tests PASS and `dist/loader.js` is generated.

- [ ] **Step 5: Commit**

```bash
git add src/commands/doctor.ts README.md tests/commands/doctor.test.ts
git commit -m "feat: add doctor command and mvp docs"
```

## Execution Notes

- Implement with Node 22+ from the start; do not try to support older runtimes in MVP.
- Keep `glm` as the only binary entrypoint; `glm chat` is explicit, but bare `glm` must remain the default UX.
- Treat `ANTHROPIC_*` as compatibility input only. Product-owned config keys and docs should still present `GLM_*` as the native path.
- Preserve the hard distinction between approval policy and hard safety denials.
- Use the runtime SDK surface directly:
  - `createAgentSession()`
  - `InteractiveMode`
  - `runPrintMode()`
  - `AuthStorage`
  - `ModelRegistry`
  - `SessionManager`
  - `SettingsManager`
  - `DefaultResourceLoader`
- Keep provider registration and policy interception in `resources/extensions/` because that is the runtime's natural customization seam.
