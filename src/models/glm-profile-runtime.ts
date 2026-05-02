// Entry point used to generate `resources/extensions/shared/glm-profile.js`.
// Keep exports in sync with what extensions expect at runtime.

export * from "./glm-profile-core.js";
export { resolveGlmProfileV2 } from "./resolve-glm-profile-v2.js";
export {
  resolveAnthropicModels,
  resolveNativeGlmProviderModels,
  resolveOpenAiCompatibleModelDefinition,
  resolveOpenAiResponsesModelDefinition,
} from "./provider-model-definitions.js";
export {
  resolveProviderTransport,
  resolveRuntimeModelProfile,
} from "./runtime-model-profile.js";
export {
  API_KINDS,
  PROVIDER_NAMES,
  getProviderDefaultApi,
  getProviderDefaultBaseUrl,
  getProviderDisplayName,
  normalizeApiKind,
  normalizeProviderName,
  resolveProviderInput,
} from "../providers/types.js";
export {
  resolveProviderBaseUrl,
  resolveProviderCredential,
  resolveProviderSettings,
} from "../providers/settings.js";
