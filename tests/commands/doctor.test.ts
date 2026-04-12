import { expect, test } from "vitest";
import { runDoctor } from "../../src/commands/doctor.js";

test("reports missing credentials for default glm provider", async () => {
  const result = await runDoctor({ env: {}, cwd: process.cwd() });
  expect(result.ok).toBe(false);
  expect(result.checks.some((check) => check.id === "credentials")).toBe(true);
  expect(result.checks.some((check) => check.id === "resources")).toBe(true);
});
