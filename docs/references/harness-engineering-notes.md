# Harness Engineering Notes

Distilled operating notes from the OpenAI harness-engineering article and how they apply to `glm`.

## Core takeaways

- Product quality comes from reproducible verification, not only better prompts.
- The best harnesses are local, cheap to run, and produce machine-readable artifacts.
- Verification contracts should be named and repeatable so regressions can be tracked over time.
- Repo structure and docs are part of the harness because they reduce ambiguity before a model starts spending tokens.

## How this maps to `glm`

- `glm` already has verifier detection and loop repair; the next step is a product-owned harness entrypoint instead of ad hoc shell-only verification.
- Verification output should be stored under `~/.glm/sessions/.../artifacts/` so later turns can reference summaries instead of replaying raw logs.
- Inspect and event surfaces should expose why a verifier was chosen, what ran, and where artifacts were written.
- Repo guides such as `AGENTS.md`, `ARCHITECTURE.md`, and `docs/references/config-surface.md` reduce repeated explanation and improve task framing.

## Near-term implementation direction

- add a local `glm verify` harness entrypoint
- define scenario manifests and stable artifact bundles
- store verifier summaries plus artifact paths in loop results
- expose runtime and verification decisions through inspect/events surfaces
