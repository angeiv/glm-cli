import { describe, expect, test } from "vitest";
import {
  listModelGateways,
  resolveGatewayUpstreamVendor,
  resolveModelGatewayRoute,
} from "../../src/models/model-gateway-registry.js";

describe("model gateway registry", () => {
  test("lists the supported gateway routes", () => {
    expect(listModelGateways().map((gateway) => gateway.id)).toEqual(
      expect.arrayContaining([
        "native-bigmodel",
        "native-zai",
        "gateway-openrouter",
        "gateway-modelscope-openai",
        "gateway-dashscope",
        "gateway-other",
      ]),
    );
  });

  test("resolves provider and baseUrl into the expected gateway route", () => {
    expect(resolveModelGatewayRoute("bigmodel", "https://proxy.example.com/v1")).toBe(
      "native-bigmodel",
    );
    expect(
      resolveModelGatewayRoute("custom", "https://api-inference.modelscope.cn/v1/messages"),
    ).toBe("gateway-modelscope-openai");
    expect(resolveModelGatewayRoute("openrouter", "https://internal.example.com/v1")).toBe(
      "gateway-openrouter",
    );
  });

  test("resolves gateway-specific upstream vendor hints", () => {
    expect(resolveGatewayUpstreamVendor("gateway-openrouter", "z-ai/glm-5.1")).toBe("z-ai");
    expect(resolveGatewayUpstreamVendor("gateway-openrouter", "vendor/fireworks-glm-5")).toBe(
      "fireworks",
    );
    expect(resolveGatewayUpstreamVendor("gateway-dashscope", "z-ai/glm-5.1")).toBe("unknown");
  });
});
