import { test, expect, vi } from "vitest";
import glmPolicyExtension, { isDangerousCommand } from "../../resources/extensions/glm-policy/index.js";
import { resolveProviderSettings } from "../../resources/extensions/glm-providers/index.js";

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
