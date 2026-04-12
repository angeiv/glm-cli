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
