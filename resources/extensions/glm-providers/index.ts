import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const glmModels = [
  {
    id: "glm-5",
    name: "GLM 5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
  {
    id: "glm-4.5",
    name: "GLM 4.5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
  {
    id: "glm-4.5-air",
    name: "GLM 4.5 Air",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  },
];

export default function (pi: ExtensionAPI) {
  pi.registerProvider("glm-official", {
    baseUrl: process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn/api/coding/paas/v4/",
    apiKey: "GLM_API_KEY",
    api: "openai-completions",
    models: glmModels,
  });

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    pi.registerProvider("openai-compatible", {
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: "OPENAI_API_KEY",
      api: "openai-completions",
      models: [
        {
          id: process.env.OPENAI_MODEL,
          name: process.env.OPENAI_MODEL,
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 8_192,
        },
      ],
    });
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    pi.registerProvider("anthropic", {
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://open.bigmodel.cn/api/anthropic",
      apiKey: "ANTHROPIC_AUTH_TOKEN",
      api: "anthropic-messages",
      models: glmModels,
    });
  }
}
