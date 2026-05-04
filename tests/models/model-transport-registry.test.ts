import { describe, expect, test } from "vitest";
import {
  getTransportGenericCaps,
  getTransportGenericModalities,
  listModelTransports,
  resolveModelTransport,
} from "../../src/models/model-transport-registry.js";

describe("model transport registry", () => {
  test("lists supported transports", () => {
    expect(listModelTransports().map((transport) => transport.id)).toEqual([
      "openai-completions",
      "openai-responses",
      "anthropic-messages",
    ]);
  });

  test("maps configured api kinds onto runtime transports", () => {
    expect(resolveModelTransport("openai-compatible")).toBe("openai-completions");
    expect(resolveModelTransport("openai-responses")).toBe("openai-responses");
    expect(resolveModelTransport("anthropic")).toBe("anthropic-messages");
  });

  test("exposes generic caps and modalities through the transport layer", () => {
    expect(getTransportGenericCaps("anthropic-messages")).toMatchObject({
      supportsThinking: true,
      defaultThinkingMode: "enabled",
    });
    expect(getTransportGenericCaps("openai-completions")).toMatchObject({
      supportsThinking: false,
      supportsToolCall: true,
    });
    expect(getTransportGenericModalities("openai-responses")).toEqual(["text", "image"]);
  });
});
