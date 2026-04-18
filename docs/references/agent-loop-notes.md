# Agent Loop Notes

Distilled operating notes from the OpenAI agent-loop article and their mapping to `glm`.

## Core takeaways

- Keep the agent loop explicit. Plan, execution, verification, and handoff should be visible product states rather than hidden prompt behavior.
- Treat repo-local guidance as runtime input, not as optional background reading.
- Compress context aggressively. Persist artifacts and summaries instead of replaying full transcripts.
- Distinguish low-risk tasks from heavy repair loops so cheap work does not pay the same token cost as risky work.
- Make stop points resumable. A human or later agent turn should be able to pick up from a compact state package.

## How this maps to `glm`

- Prompt layering already exists in `src/prompt/`; keep the base contract short and move variable behavior into overlays.
- The code loop already exists in `src/loop/`; extend it with clearer runtime status, richer verifier artifacts, and better handoff bundles.
- Repo-local guidance should live in compact files such as `AGENTS.md` and `ARCHITECTURE.md`, then be discoverable from the repo overlay path.
- Future task routing should separate `direct`, `standard`, and `intensive` paths instead of forcing every task through the same control flow.

## Immediate design implications

- Prefer artifact-first verification output over transcript-first replay.
- Add runtime inspection surfaces before adding more top-level features.
- Keep interactive commands explainable: operators should be able to tell why a loop continued, stopped, or handed off.
