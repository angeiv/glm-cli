# Task 3 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure provider resolution respects CLI and env intent, defaults stay typed, and compatibility detection works end-to-end.

**Architecture:** Provider helpers live in `src/providers`; runtime plumbing is in `src/app/env.ts`; config validation lives in `src/app/config-store.ts` and gains more acceptance tests. Tests live in `tests/providers` and `tests/app` to keep TDD coverage aligned with changes.

**Tech Stack:** TypeScript, Node 22+, Vitest, existing helper files under `src/app` and `src/providers`.

---

### Task 1: Provider selection precedence

**Files:**
- Modify: `src/providers/index.ts`
- Modify: `src/app/env.ts`
- Modify: `tests/providers/provider-resolution.test.ts`
- Modify: `tests/app/config-resolution.test.ts`

- [ ] **Step 1: Write failing test covering GLM provider not overridden by compatibility credentials**

```ts
test("explicit GLM provider env is honored over Anthropic/OpenAI creds", () => {
  const runtime = resolveRuntimeConfig(
    {},
    { GLM_PROVIDER: "glm-official", ANTHROPIC_AUTH_TOKEN: "token", OPENAI_API_KEY: "key" },
    createConfigFile({ defaultProvider: "openai-compatible" }),
  );
  expect(runtime.provider).toBe("glm-official");
});
```

- [ ] **Step 2: Run the tests to see the failure**

Run: `npm test -- tests/providers/provider-resolution.test.ts tests/app/config-resolution.test.ts`
Expected: FAILURE because compatibility check currently overrides GLM provider.

- [ ] **Step 3: Update `resolveProviderSelection`/`resolveRuntimeConfig` to skip compatibility overrides when a GLM provider is in CLI or env**

- [ ] **Step 4: Re-run same tests to confirm they pass**

- [ ] **Step 5: Commit**

```bash
git add src/providers/index.ts src/app/env.ts tests/providers/provider-resolution.test.ts tests/app/config-resolution.test.ts
git commit -m "fix: honor explicit GLM provider over compatibility credentials"
```

### Task 2: Validate `defaultModel` when reading config file

**Files:**
- Modify: `src/app/config-store.ts`
- Modify: `tests/app/config-resolution.test.ts`

- [ ] **Step 1: Write failing test checking non-string defaultModel throws**

```ts
test("readConfigFile rejects non-string defaultModel", async () => {
  vi.spyOn(fileSystem, "readFile").mockResolvedValueOnce(
    JSON.stringify({
      defaultProvider: "glm-official",
      defaultModel: 123,
      approvalPolicy: "ask",
      providers: { glmOfficial: { apiKey: "", baseURL: "" }, openAICompatible: { apiKey: "", baseURL: "" } },
    }),
  );
  await expect(readConfigFile()).rejects.toThrow(/defaultModel/i);
});
```

- [ ] **Step 2: Run `npm test -- tests/app/config-resolution.test.ts` to confirm failure**

- [ ] **Step 3: Add validation after parsing config to assert `typeof defaultModel === "string"` and throw otherwise**

- [ ] **Step 4: Re-run `npm test -- tests/app/config-resolution.test.ts`**

- [ ] **Step 5: Commit**

```bash
git add src/app/config-store.ts tests/app/config-resolution.test.ts
git commit -m "fix: validate defaultModel in config store"
```

### Task 3: OpenAI-compatible autodetection when only API key is present

**Files:**
- Modify: `src/providers/index.ts`
- Modify: `tests/providers/provider-resolution.test.ts`

- [ ] **Step 1: Add failing test that `OPENAI_API_KEY` alone triggers `openai-compatible` when `openai-compatible` is selected by default**

```ts
test("OPENAI_API_KEY alone enables openai-compatible fallback", () => {
  const resolved = resolveProviderSelection(
    {},
    { OPENAI_API_KEY: "key" } as NodeJS.ProcessEnv,
    "openai-compatible",
    "glm-5",
  );
  expect(resolved.provider).toBe("openai-compatible");
});
```

- [ ] **Step 2: Run `npm test -- tests/providers/provider-resolution.test.ts` to watch it fail**

- [ ] **Step 3: Update autodetection to allow OPENAI_API_KEY to be sufficient (use fallback model)**

- [ ] **Step 4: Re-run the same test command**

- [ ] **Step 5: Commit**

```bash
git add src/providers/index.ts tests/providers/provider-resolution.test.ts
git commit -m "fix: detect openai-compatible provider with only API key"
```
