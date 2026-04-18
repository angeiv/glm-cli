import { test, expect, vi } from "vitest";
import glmPolicyExtension, { isDangerousCommand } from "../../resources/extensions/glm-policy/index.ts";
import { resolveProviderSettings } from "../../resources/extensions/glm-providers/index.ts";

const rmVariants = [
  "rm -rf /tmp/demo",
  "rm -fr /tmp/demo",
  "rm -r -f /tmp/demo",
  "rm -f -r /tmp/demo",
  "sudo rm -fr /tmp/demo",
];

test.each(rmVariants)(
  "marks '%s' as dangerous even in yolo mode",
  (command) => {
    expect(isDangerousCommand(command)).toBe(true);
  },
);

test("dangerous bash commands always require explicit confirmation even when approval policy is never", async () => {
  const previous = process.env.GLM_APPROVAL_POLICY;
  process.env.GLM_APPROVAL_POLICY = "never";

  try {
    const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<unknown>> = {};
    const commands: Array<{ name: string; handler: unknown }> = [];
    glmPolicyExtension({
      on: (name: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
        handlers[name] = handler;
      },
      registerCommand: (name: string, options: { handler: unknown }) => {
        commands.push({ name, handler: options.handler });
      },
    } as unknown as Parameters<typeof glmPolicyExtension>[0]);

    const handler = handlers.tool_call;
    expect(handler).toBeTypeOf("function");

    const confirm = vi.fn(async () => false);
    const denyResult = await handler(
      { toolName: "bash", input: { command: "rm -rf /tmp/demo" } },
      { ui: { confirm } },
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(
      "Dangerous command requires explicit approval",
      "rm -rf /tmp/demo",
    );
    expect(denyResult).toMatchObject({ block: true, reason: "Denied dangerous command" });

    confirm.mockResolvedValueOnce(true);
    const allowResult = await handler(
      { toolName: "bash", input: { command: "rm -rf /tmp/demo" } },
      { ui: { confirm } },
    );
    expect(allowResult).toBeUndefined();
  } finally {
    if (previous === undefined) {
      delete process.env.GLM_APPROVAL_POLICY;
    } else {
      process.env.GLM_APPROVAL_POLICY = previous;
    }
  }
});

test("approval command offers three policy completions", async () => {
  const commands = new Map<string, { handler: unknown; getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null }>();

  glmPolicyExtension({
    on: vi.fn(),
    registerCommand: (
      name: string,
      options: {
        handler: unknown;
        getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
      },
    ) => {
      commands.set(name, options);
    },
  } as unknown as Parameters<typeof glmPolicyExtension>[0]);

  const approval = commands.get("approval");
  expect(approval?.getArgumentCompletions).toBeTypeOf("function");

  expect(approval?.getArgumentCompletions?.("")).toEqual([
    {
      value: "ask",
      label: "ask - confirm every non-dangerous bash command",
    },
    {
      value: "auto",
      label: "auto - allow low-risk commands automatically; still ask for sensitive ones",
    },
    {
      value: "never",
      label: "never - skip non-dangerous approvals; dangerous commands still require approval",
    },
  ]);
  expect(approval?.getArgumentCompletions?.("a")).toEqual([
    {
      value: "ask",
      label: "ask - confirm every non-dangerous bash command",
    },
    {
      value: "auto",
      label: "auto - allow low-risk commands automatically; still ask for sensitive ones",
    },
  ]);
});

test("approval auto shows a risk warning when toggled", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();

  glmPolicyExtension({
    on: vi.fn(),
    registerCommand: (
      name: string,
      options: {
        handler: (args: string, ctx: any) => Promise<void>;
      },
    ) => {
      commands.set(name, options);
    },
  } as unknown as Parameters<typeof glmPolicyExtension>[0]);

  const notify = vi.fn();
  const setStatus = vi.fn();
  await commands.get("approval")?.handler("auto", {
    ui: {
      notify,
      setStatus,
    },
  });

  expect(setStatus).toHaveBeenCalledWith("glm.approvalPolicy", "approval: auto");
  expect(notify).toHaveBeenCalledWith(
    "approvalPolicy set to auto. Low-risk bash commands will run without confirmation; sensitive and dangerous commands still require approval.",
    "warning",
  );
});

test("resolveProviderSettings prefers persisted config when env vars missing", () => {
  const settings = resolveProviderSettings({
    envApiKey: undefined,
    envBaseUrl: undefined,
    persisted: { apiKey: "persisted-key", baseURL: "https://persisted.url" },
    defaultBaseUrl: "https://default.url",
  });
  expect(settings.apiKey).toBe("persisted-key");
  expect(settings.baseUrl).toBe("https://persisted.url");
});

test("resolveProviderSettings lets env override persisted config", () => {
  const settings = resolveProviderSettings({
    envApiKey: "env-key",
    envBaseUrl: "https://env.url",
    persisted: { apiKey: "persisted-key", baseURL: "https://persisted.url" },
    defaultBaseUrl: "https://default.url",
  });
  expect(settings.apiKey).toBe("env-key");
  expect(settings.baseUrl).toBe("https://env.url");
});
