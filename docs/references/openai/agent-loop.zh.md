<p align="right">
  <a href="./agent-loop.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# Agent Loop 笔记（Agent Loop Notes）

整理自 OpenAI 的 agent-loop 文章的操作笔记，并映射到 `glm` 的实现方向。

## 核心要点

- 让 agent loop 显式化：计划、执行、验证、交接（handoff）应是可观察的产品状态，而不是隐藏在 prompt 里的行为。
- 将 repo 本地指导视为运行时输入，而不是可选的背景阅读材料。
- 强化上下文压缩：优先持久化 artifacts 与摘要，而不是重放完整 transcript。
- 区分低风险任务与高成本修复：让轻量任务不必承担与高风险修复相同的 token 成本。
- 让停止点可恢复：人类或后续 agent 回合应能从一个紧凑的状态包继续推进。

## 映射到 `glm`

- Prompt 分层已在 `src/prompt/` 中实现：保持 base contract 简短，将可变行为下沉到 overlays。
- 代码 loop 已在 `src/loop/` 中实现：下一步应强化 runtime 状态可见性、丰富 verifier artifacts、并改进 handoff bundle。
- Repo 本地指导应放在 `AGENTS.md` 与 `ARCHITECTURE.md` / `ARCHITECTURE.zh.md` 等精简文件中，并能通过 repo overlay 被发现。
- 任务路由应区分 `direct`、`standard`、`intensive`，避免所有任务都走同一套控制流。

## 近期设计影响

- 优先以“artifact 为中心”的验证输出，而不是“transcript 为中心”的回放。
- 在新增更多顶层特性之前，优先补齐 runtime inspect 与事件相关的可观测面。
- 保持交互命令可解释：操作者应能清楚知道 loop 为什么继续、停止或交接。

