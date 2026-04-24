<p align="right">
  <a href="./README.en.md" aria-label="Switch to English version of this README">English</a> | <strong>中文</strong>
</p>

# glm

GLM 的本地 Agent CLI（通用任务，适配本地项目与工作流）。

npm 包名：`@angeiv/glm`  
命令：`glm`

## 特性
- 默认走 GLM 原生 provider（BigModel / z.ai），并提供 OpenAI-compatible / Anthropic-compatible 的接入路径
- 交付质量 loop：多轮执行 + verifier + repair，产出可复用的验证 artifacts
- MCP（Model Context Protocol）工具接入（支持本地 stdio 与远程 transport）
- 危险命令强制审批（即使 `--yolo` 或更宽松的 policy）
- `glm inspect`/`glm verify`/`glm doctor` 等可观测与诊断命令

## 环境要求
- Node.js 22 或更高版本

## 安装

全局安装：
```bash
npm install -g @angeiv/glm
# 或
pnpm add -g @angeiv/glm
```

临时运行（不安装）：
```bash
npx -y @angeiv/glm --help
```

## 快速开始

```bash
glm
glm chat /path/to/project
glm run "修复测试失败"
glm run "修复测试失败" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff
glm verify smoke
glm inspect --json
```

## 文档
- 使用指南（CLI）：[docs/guides/cli.zh.md](./docs/guides/cli.zh.md)
- 使用指南（MCP）：[docs/guides/mcp.zh.md](./docs/guides/mcp.zh.md)
- 配置与环境变量（完整清单）：[docs/references/config-surface.zh.md](./docs/references/config-surface.zh.md)
- 架构与仓库约束：[ARCHITECTURE.md](./ARCHITECTURE.md) / [AGENTS.md](./AGENTS.md)

## 开发
```bash
corepack enable
pnpm install
pnpm test
pnpm dev -- --help
```

## License
MIT
