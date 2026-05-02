import { describe, expect, test } from "vitest";
import {
  getModelFamilyAdapter,
  listModelFamilyAdapters,
} from "../../src/models/model-family-registry.js";

describe("model family registry", () => {
  test("lists the catalog-backed model family adapters", () => {
    expect(listModelFamilyAdapters().map((adapter) => adapter.id)).toEqual(["glm", "qwen"]);
  });

  test("resolves canonical aliases through the family adapter interface", () => {
    const glmFamily = getModelFamilyAdapter("glm");
    const qwenFamily = getModelFamilyAdapter("qwen");

    expect(glmFamily?.resolveCanonicalModelId("ZhipuAI/GLM-5")).toBe("glm-5");
    expect(qwenFamily?.resolveCanonicalModelId("qwen3.6-plus-2026-04-02")).toBe(
      "qwen/qwen3.6-plus",
    );
  });
});
