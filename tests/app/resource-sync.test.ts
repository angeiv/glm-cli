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
