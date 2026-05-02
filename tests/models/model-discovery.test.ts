import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearModelDiscoveryRuntimeState,
  getDefaultModelDiscoveryConfig,
  resolveDiscoveredModels,
  resolveModelDiscoveryStatus,
} from "../../src/models/model-discovery.js";

function createTempCachePath(): { dir: string; cachePath: string } {
  const dir = mkdtempSync(join(tmpdir(), "glm-model-discovery-"));
  return {
    dir,
    cachePath: join(dir, "discovered-models.json"),
  };
}

afterEach(() => {
  clearModelDiscoveryRuntimeState();
  vi.restoreAllMocks();
});

describe("resolveDiscoveredModels", () => {
  test("fetches and caches OpenAI-style model ids", async () => {
    const { dir, cachePath } = createTempCachePath();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [{ id: "qwen/qwen3.5-122b-a10b" }, { id: "glm-5.1" }, { id: "glm-5.1" }],
        }),
    }));

    try {
      const result = await resolveDiscoveredModels(
        {
          provider: "custom",
          api: "openai-compatible",
          baseUrl: "https://gateway.example.com/v1",
          apiKey: "test-key",
          cachePath,
          config: getDefaultModelDiscoveryConfig(),
        },
        {
          fetch: fetchMock as typeof fetch,
          now: () => Date.parse("2026-05-03T10:00:00.000Z"),
        },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.models).toEqual([{ id: "glm-5.1" }, { id: "qwen/qwen3.5-122b-a10b" }]);
      expect(result.status).toMatchObject({
        source: "live",
        modelCount: 2,
      });

      const status = await resolveModelDiscoveryStatus({
        provider: "custom",
        api: "openai-compatible",
        baseUrl: "https://gateway.example.com/v1",
        cachePath,
        config: getDefaultModelDiscoveryConfig(),
      });
      expect(status.source).toBe("live");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("uses fresh cache without refetching", async () => {
    const { dir, cachePath } = createTempCachePath();
    writeFileSync(
      cachePath,
      JSON.stringify(
        {
          version: 1,
          entries: {
            "custom::openai-compatible::https://gateway.example.com/v1": {
              provider: "custom",
              api: "openai-compatible",
              baseUrl: "https://gateway.example.com/v1",
              fetchedAt: "2026-05-03T10:00:00.000Z",
              models: [{ id: "glm-5.1" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const fetchMock = vi.fn();

    try {
      const result = await resolveDiscoveredModels(
        {
          provider: "custom",
          api: "openai-compatible",
          baseUrl: "https://gateway.example.com/v1",
          cachePath,
          config: getDefaultModelDiscoveryConfig(),
        },
        {
          fetch: fetchMock as typeof fetch,
          now: () => Date.parse("2026-05-03T10:10:00.000Z"),
        },
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.models).toEqual([{ id: "glm-5.1" }]);
      expect(result.status.source).toBe("cache-fresh");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("falls back to stale cache when refresh fails", async () => {
    const { dir, cachePath } = createTempCachePath();
    writeFileSync(
      cachePath,
      JSON.stringify(
        {
          version: 1,
          entries: {
            "custom::openai-compatible::https://gateway.example.com/v1": {
              provider: "custom",
              api: "openai-compatible",
              baseUrl: "https://gateway.example.com/v1",
              fetchedAt: "2026-05-03T07:00:00.000Z",
              models: [{ id: "glm-5.1" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const fetchMock = vi.fn(async () => {
      throw new Error("gateway down");
    });

    try {
      const result = await resolveDiscoveredModels(
        {
          provider: "custom",
          api: "openai-compatible",
          baseUrl: "https://gateway.example.com/v1",
          cachePath,
          config: {
            enabled: true,
            cacheTtlMs: 60_000,
            allowStaleOnError: true,
          },
        },
        {
          fetch: fetchMock as typeof fetch,
          now: () => Date.parse("2026-05-03T10:00:00.000Z"),
        },
      );

      expect(result.models).toEqual([{ id: "glm-5.1" }]);
      expect(result.status).toMatchObject({
        source: "cache-stale",
        stale: true,
        modelCount: 1,
      });
      expect(result.status.error).toContain("gateway down");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips discovery for unsupported apis", async () => {
    const { dir, cachePath } = createTempCachePath();
    const fetchMock = vi.fn();

    try {
      const result = await resolveDiscoveredModels(
        {
          provider: "custom",
          api: "anthropic",
          baseUrl: "https://gateway.example.com/v1",
          cachePath,
          config: getDefaultModelDiscoveryConfig(),
        },
        {
          fetch: fetchMock as typeof fetch,
        },
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.models).toEqual([]);
      expect(result.status.source).toBe("unsupported");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
