import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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

test("suppresses changelog notice by setting lastChangelogVersion in settings.json", async () => {
  const target = await mkdtemp(join(tmpdir(), "glm-agent-"));
  await syncPackagedResources(target);

  const settingsPath = join(target, "settings.json");
  expect(existsSync(settingsPath)).toBe(true);

  const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  expect(settings.lastChangelogVersion).toBeDefined();
  expect(typeof settings.lastChangelogVersion).toBe("string");
  // Should be a semver-like version string (e.g. "0.70.0")
  expect(settings.lastChangelogVersion).toMatch(/^\d+\.\d+\.\d+/);
});

test("does not overwrite existing settings, only adds lastChangelogVersion", async () => {
  const target = await mkdtemp(join(tmpdir(), "glm-agent-"));

  // Pre-create settings with existing data
  const settingsPath = join(target, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ compaction: { enabled: true } }));

  await syncPackagedResources(target);

  const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  expect(settings.compaction).toEqual({ enabled: true });
  expect(settings.lastChangelogVersion).toBeDefined();
});
