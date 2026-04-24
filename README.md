<p align="right">
  <a href="./README.en.md" aria-label="Switch to English version of this README">English</a> | <strong>中文</strong>
</p>

# glm-cli

GLM 的 Agent CLI。

npm 包名：`@angeiv/glm`  
命令：`glm`

## 环境要求
- Node.js 22 或更高版本（当前运行时 SDK 与原生 ESM 运行方式要求）

## 安装
```
corepack enable
pnpm install
```
这会安装依赖并准备 CLI 入口，随后可通过 `pnpm run build` 生成 `dist/loader.js`。

## 项目文档
- [AGENTS.md](./AGENTS.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/guides/cli.zh.md](./docs/guides/cli.zh.md)
- [docs/guides/mcp.zh.md](./docs/guides/mcp.zh.md)
- [docs/references/config-surface.zh.md](./docs/references/config-surface.zh.md)

## 快速使用

```bash
glm
glm chat /path/to/repo
glm run "修复测试失败"
glm run "修复测试失败" --loop --verify "pnpm test" --max-rounds 4 --fail-mode handoff
glm verify smoke
glm inspect --json
```

更多使用细节请查看：

- [docs/guides/cli.zh.md](./docs/guides/cli.zh.md)：命令、flags、loop、prompt lane、web tools 等
- [docs/guides/mcp.zh.md](./docs/guides/mcp.zh.md)：MCP 配置与 adapter modes
- [docs/references/config-surface.zh.md](./docs/references/config-surface.zh.md)：完整配置项与环境变量
