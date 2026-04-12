import { test, expect } from "vitest";
import { isDangerousCommand } from "../../resources/extensions/glm-policy/index.js";
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
