<p align="right">
  <a href="./README.en.md" aria-label="Switch to English version of this README">English</a> | <strong>中文</strong>
</p>

# glm

GLM 的本地 Agent CLI（通用任务，适配本地项目与工作流）。

npm 包名：`@angeiv/glm`  
命令：`glm`

## 特性
- 默认使用 GLM 原生 provider（BigModel / z.ai），并提供 OpenAI-compatible / Anthropic-compatible 的接入路径
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
# 进入交互模式（默认命令）
glm

# 在指定目录启动交互会话（作为工作目录）
glm chat /path/to/project

# 执行一次性任务并退出
glm run "修复测试失败"

# 启用 loop：执行 -> 验证 -> 修复（最多 4 轮），失败时停在 handoff 点
glm run "修复测试失败" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff

# 运行内置验证场景（smoke/test/build）
glm verify smoke

# 查看本次运行的有效状态（provider/model/loop/MCP/approval 等）
glm inspect --json
```

## 常见用法

```bash
# 1. 使用默认 provider（默认使用已配置的 provider/api/model）
glm

# 2. 显式使用 BigModel Coding
GLM_API_KEY=your-key \
glm --provider bigmodel-coding --model glm-5.1

# 3. 使用 OpenRouter 上托管的 GLM 模型
OPENAI_API_KEY=your-key \
glm --provider openrouter --model ZhipuAI/GLM-5

# 4. 接入自定义 OpenAI-compatible 网关
OPENAI_API_KEY=your-key \
OPENAI_BASE_URL=https://gateway.example.com/v1 \
glm --provider custom --api openai-compatible --model my-model

# 5. 接入自定义 Anthropic-compatible 网关
ANTHROPIC_AUTH_TOKEN=your-token \
ANTHROPIC_BASE_URL=https://gateway.example.com/v1/messages \
glm --provider custom --api anthropic --model my-model

# 6. 接入本地 OpenAI-compatible 模型服务
OPENAI_BASE_URL=http://127.0.0.1:8000/v1 \
glm --provider custom --model qwen2.5-coder-32b-instruct
```

如果只需记住一条使用原则：

- 先选 `provider`
- 按需覆盖 `api`
- 最后指定 `model`

更深入的使用方式（如 `custom` 参数调优、`modelOverrides`、MCP、loop、验证、缓存等）请查看详细文档。

## 文档
- 文档索引：[docs/README.zh.md](./docs/README.zh.md)
- 使用指南（CLI）：[docs/guides/cli.zh.md](./docs/guides/cli.zh.md)
- 使用指南（MCP）：[docs/guides/mcp.zh.md](./docs/guides/mcp.zh.md)
- 配置与环境变量（完整清单）：[docs/references/config-surface.zh.md](./docs/references/config-surface.zh.md)
- 架构与仓库约束：[ARCHITECTURE.zh.md](./ARCHITECTURE.zh.md) / [AGENTS.md](./AGENTS.md)

## 开发
```bash
corepack enable
pnpm install
pnpm test
pnpm dev -- --help
```

## License
MIT
