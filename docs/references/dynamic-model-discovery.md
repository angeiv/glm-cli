<p align="right">
  <strong>English</strong> | <a href="./dynamic-model-discovery.zh.md" aria-label="Switch to Chinese version of this document">中文</a>
</p>

# Dynamic Model Discovery

This note defines the v1 design boundary for dynamic model discovery:

- discover remote models from `/models`
- cache discovery results per gateway
- map discovered IDs back into the existing family/profile/capability resolver
- preserve current behavior for known static models and unknown-model fallback

It is a design note for follow-up implementation tasks, not a user-facing how-to.

## Current State

The current runtime has three distinct model sources:

1. Static family catalogs in [`src/models/model-families/`](../../src/models/model-families)
2. Provider registration assembly in [`resources/extensions/glm-providers/index.ts`](../../resources/extensions/glm-providers/index.ts)
3. Per-model capability overrides from `~/.glm/config.json` via `modelOverrides`

Known models resolve well because the runtime model profile pipeline already combines:

- provider
- api
- base URL hints
- model aliases / snapshots
- family-specific capability metadata
- `modelOverrides`

Unknown models currently fall back to conservative generic capabilities. That is safe, but it means new gateway deployments depend on manual `modelOverrides` even when the upstream `/models` endpoint already knows the model list.

## Goals

- Support dynamic discovery for API surfaces that expose OpenAI-style `/models`
- Keep the current family resolver as the source of capability truth for known models
- Use discovery to improve model identity coverage, not to replace curated capability metadata
- Keep unknown models conservative and explainable
- Add enough diagnostics so operators can tell whether a model came from catalog, live discovery, cached discovery, or generic fallback

## Non-Goals

- No runtime auto-switching between APIs or providers
- No attempt to infer rich capabilities purely from `/models` payloads
- No mutation of user-managed config surfaces
- No auth-identity-aware cache partitioning in v1
- No anthropic-specific discovery path in v1

## Discovery Scope

V1 should only discover models for transports that already expose an OpenAI-style model list:

- `openai-compatible`
- `openai-responses`

V1 should not attempt discovery for:

- `anthropic`
- purely static native catalogs when discovery adds no value

In practice, discovery is most useful for:

- `custom`
- `openrouter`
- `bailian`
- other proxy or self-hosted OpenAI-compatible gateways

Native GLM catalogs remain authoritative for curated capability behavior. Discovery augments identity coverage when the endpoint exposes additional aliases, snapshots, or gateway-specific names.

## Cache Boundary

V1 cache entries should be keyed by:

- normalized provider name
- normalized API kind
- normalized base URL

Recommended shape:

```json
{
  "version": 1,
  "entries": {
    "custom|openai-compatible|https://gateway.example.com/v1": {
      "fetchedAt": "2026-05-03T00:00:00.000Z",
      "expiresAt": "2026-05-04T00:00:00.000Z",
      "models": [
        {
          "id": "foo/bar-model",
          "name": "Bar Model",
          "raw": {}
        }
      ],
      "lastError": null
    }
  }
}
```

Recommended file path:

- `~/.glm/agent/discovered-models.json`

V1 should not reuse `~/.glm/agent/models.json` as the discovery cache. That file belongs to the runtime model registry surface inherited from Pi, while discovery results are gateway observations. Keeping them separate avoids mixing:

- generated remote inventory
- registry/provider definitions
- future manual or tool-managed registry writes

## Cache Policy

V1 policy should be simple and deterministic:

- default TTL: 24 hours
- cache hit and fresh: use cache, skip network
- cache hit but stale: try live refresh, fall back to stale cache on failure
- cache miss: try live fetch, fall back to static behavior on failure

V1 should never hard-fail session startup purely because discovery failed.

If the live `/models` request fails:

- use stale cache when available
- otherwise continue with the current static resolver path
- surface the failure in diagnostics

## Resolution Pipeline

The runtime should resolve models in this order:

1. Explicit curated catalog match
2. Dynamic discovery identity match
3. Generic transport fallback
4. `modelOverrides` applied last

More concretely:

1. Determine provider, API, and normalized base URL
2. Load discovery cache for that gateway scope
3. Refresh the cache if missing or stale
4. Build the provider model list from:
   - curated known models for the provider
   - dynamically discovered IDs that are not already represented
5. For each discovered model ID:
   - run the existing family resolver
   - if a known canonical model is found, reuse curated family metadata
   - if no canonical model is found, create a generic profile for the current transport
6. Apply `modelOverrides`

This keeps capability truth in the family resolver while letting discovery broaden the visible model namespace.

## Mapping Rules

Discovered models should be mapped into three buckets:

### 1. Canonical catalog match

Examples:

- gateway alias resolves to `glm-5.1`
- Qwen snapshot resolves to a known `qwen` family model

Behavior:

- use curated family metadata
- mark resolution source as `dynamic-catalog-match`

### 2. Known family, non-canonical variant

Examples:

- provider-specific prefix/suffix naming
- snapshot names that still clearly belong to GLM or Qwen

Behavior:

- reuse family-level heuristics and variant matching
- keep confidence lower than a direct canonical ID
- mark source as `dynamic-family-match`

### 3. Unknown model

Behavior:

- use generic transport defaults
- do not infer unsupported modalities or advanced capabilities
- mark source as `dynamic-generic`

V1 should assume:

- text input only unless curated metadata or `modelOverrides` says otherwise
- no reasoning unless curated metadata or `modelOverrides` says otherwise
- no cache/tool/structured-output guarantees unless curated metadata or `modelOverrides` says otherwise

## Diagnostics Surface

`glm inspect` and runtime diagnostics should expose:

- discovery enabled or disabled
- discovery support for current provider/API
- discovery cache path
- discovery cache key
- last fetch timestamp
- cache freshness / stale status
- last fetch error, if any
- resolved model source:
  - `catalog`
  - `dynamic-catalog-match`
  - `dynamic-family-match`
  - `dynamic-generic`
  - `override`

This is required so operators can distinguish:

- "the model is known and curated"
- "the model was only found because `/models` exposed it"
- "the model is running on generic conservative defaults"

## Config Surface

V1 should add an explicit discovery config block under `~/.glm/config.json`:

```json
{
  "modelDiscovery": {
    "enabled": true,
    "cacheTtlMs": 86400000,
    "allowStaleOnError": true
  }
}
```

V1 does not need a large policy surface. The minimum knobs are:

- `enabled`
- `cacheTtlMs`
- `allowStaleOnError`

Capability tuning remains in `modelOverrides`, not in discovery config.

## Failure Model

The failure model must stay operator-safe:

- discovery fetch failure must not block startup
- malformed `/models` payload must not poison the cache
- one gateway cache entry must not affect another gateway
- one API kind must not affect another API kind for the same host

The cache writer should only persist validated entries.

## Implementation Split

Implementation should cover:

- discovery config parsing
- discovery cache store
- live `/models` fetch for supported APIs
- provider registration integration
- runtime status fields

Verification should cover:

- cache hit / miss / stale behavior
- per-base-URL isolation
- per-API isolation
- catalog match vs generic fallback
- `modelOverrides` precedence
- safe fallback when discovery fails

## Open Risks

- Some gateways return model lists that differ by credential, while v1 cache keys are only provider/API/baseURL scoped
- `/models` payload quality is inconsistent across gateways
- OpenRouter-style inventories may be very large, so cache validation and filtering need to stay cheap

These are acceptable for v1 as long as:

- stale or wrong discovery results never override explicit curated metadata
- operators can still force correctness with `modelOverrides`
