<p align="right">
  <a href="./harness-engineering.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# Harness Engineering 笔记（Harness Engineering Notes）

整理自 OpenAI 的 harness-engineering 文章的操作笔记，并说明其对 `glm` 的含义。

## 核心要点

- 产品质量来自可复现的验证，而不只是更好的 prompts。
- 最佳 harness 通常是本地的、成本低、并能产出机器可读 artifacts 的。
- 验证契约应具备稳定命名与可重复执行特性，便于持续追踪回归。
- Repo 结构与文档也是 harness 的一部分：它们能在模型开始消耗 token 之前降低歧义。

## 映射到 `glm`

- `glm` 已具备 verifier 探测与 loop repair；下一步应提供产品自有的 harness 入口，而不是仅依赖 ad hoc 的 shell 验证命令。
- 验证输出应写入 `~/.glm/sessions/.../artifacts/`，使后续回合可以直接引用摘要，而不必重放原始日志。
- inspect 与事件面应暴露：为什么选择某个 verifier、实际执行了什么、artifacts 写在何处。
- 仓库指南文件（例如 `AGENTS.md`、`ARCHITECTURE.md` / `ARCHITECTURE.zh.md`、`docs/references/config-surface.md`）可减少重复解释并提升任务 framing 的稳定性。

## 近期实现方向

- 增强 `glm verify` 的 harness 入口能力
- 定义场景清单（scenario manifests）与稳定的 artifact bundle
- 在 loop 结果中保存 verifier 摘要与 artifact 路径
- 通过 inspect/events 暴露 runtime 与 verification 的关键决策

