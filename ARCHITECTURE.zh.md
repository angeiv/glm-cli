<p align="right">
  <a href="./ARCHITECTURE.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# 架构（Architecture）

`glm-cli` 的简明架构地图。

## 1. CLI 层

主要文件：

- `src/loader.ts`
- `src/cli.ts`
- `src/commands/*.ts`

职责：

- 解析 CLI 参数
- 归一化命令级 flags
- 汇总 config 与 env 输入
- 分发到 chat、run、doctor、config 等流程

CLI 层应保持轻薄，业务逻辑应放在 runtime、session、loop 或 provider 模块中。

## 2. Session 与 runtime 层

主要文件：

- `src/session/create-session.ts`
- `src/session/managers.ts`
- `src/session/session-paths.ts`
- `src/runtime/chat-runtime.ts`
- `src/runtime/run-runtime.ts`

职责：

- 计算 `~/.glm` 相关的运行时路径
- 会话启动前同步内置 prompts/extensions
- 解析 provider/model 选择与 scoped env 覆盖
- 创建交互聊天与单次任务执行所使用的 runtime

`create-session.ts` 是 CLI 配置与内嵌 agent runtime 之间的关键边界。

## 3. Prompt stack 层

主要文件：

- `src/prompt/base-contract.ts`
- `src/prompt/mode-overlays.ts`
- `src/prompt/repo-overlay.ts`
- `src/prompt/task-overlay.ts`
- `src/prompt/verification-overlay.ts`
- `src/runtime/prompt.ts`

职责：

- 保持稳定产品契约（base contract）简洁
- 只在需要时叠加动态 overlay
- 注入从当前工作目录派生的 repo hints
- 为 loop 执行塑造 task prompts 与 repair prompts

当前方向是分层 prompts，而不是单体系统 prompt。

## 4. Provider 层

主要文件：

- `src/providers/index.ts`
- `src/providers/types.ts`
- `src/app/env.ts`
- `resources/extensions/glm-providers/`
- `resources/extensions/glm-zhipu/`

职责：

- 解析有效 provider 与 model
- 将 env/config 映射为 runtime env vars
- 将 provider 能力适配尽量放在 extension/runtime 边界附近

仓库当前支持 `glm`、`openai-compatible` 与 `anthropic` 三条兼容接入路径。

## 5. Loop 与 verification 层

主要文件：

- `src/loop/controller.ts`
- `src/loop/state.ts`
- `src/loop/types.ts`
- `src/loop/verify-detect.ts`
- `src/loop/verify-runner.ts`
- `src/loop/failure-summary.ts`
- `src/loop/profiles/`
- `resources/extensions/glm-loop/`

职责：

- 明确的 loop 状态机与状态迁移
- 面向代码任务的 verifier 自动探测
- verifier 执行与结果整形
- 验证失败后的 repair/handoff 行为
- 交互模式下的 `/loop` 控制命令

这是产品自有的质量 loop；它应当可解释，并且能以较低成本恢复与继续执行。

## 6. Extension 与 tool 层

主要文件：

- `resources/extensions/`
- `src/tools/`
- `src/app/resource-sync.ts`

职责：

- 随 CLI 一起发布运行时扩展资源
- 注册交互命令以及 provider/tool 行为
- 暴露在本进程内创建的内置工具
- 在 runtime 使用前将仓库资源同步到 `~/.glm/agent/`

将 `resources/` 视为“随包发布的运行时资源”，而不是普通文档目录。

## 7. 持久化布局

产品状态保存在 `~/.glm/`：

- `config.json`：持久化的 operator 配置
- `mcp.json`：MCP server 声明
- `agent/`：同步后的 prompts 与 extensions
- `sessions/`：由 cwd 派生的会话状态与可恢复记录

仓库状态应与 runtime 状态保持隔离。新增持久化需求时，优先写入 `~/.glm/`，而不是写入用户项目目录。

## 8. 近期压力点

当前架构的主要压力点包括：

- runtime inspect 与事件日志
- 更丰富的 verification artifacts 与 handoff bundle
- 产品自有的本地 verification harness
- 更紧凑的 repo context 打包策略，以减少 token 浪费

这些能力应扩展现有分层结构，而不是绕开它。

