<p align="right">
  <a href="./dynamic-model-discovery.md" aria-label="Switch to English version of this document">English</a> | <strong>中文</strong>
</p>

# Dynamic Model Discovery

本文定义动态模型发现的 v1 设计边界：

- 从 `/models` 发现远端模型
- 按网关维度缓存发现结果
- 将发现到的模型 ID 映射回现有的 family/profile/capability 解析链路
- 保持已知静态模型和未知模型兜底行为不回归

这是后续实现任务的设计说明，不是面向用户的操作指南。

## 当前状态

当前运行时有三类模型来源：

1. [`src/models/model-families/`](../../src/models/model-families) 下的静态 family catalog
2. [`resources/extensions/glm-providers/index.ts`](../../resources/extensions/glm-providers/index.ts) 中的 provider 注册装配
3. `~/.glm/config.json` 中通过 `modelOverrides` 提供的模型级能力覆写

对于已知模型，当前解析链路已经能稳定组合以下因素：

- provider
- api
- base URL 线索
- 模型别名 / snapshot
- family 级能力元数据
- `modelOverrides`

对于未知模型，当前策略会退回到一套保守的 generic 能力。这种方式是安全的，但也意味着新网关或新部署即使已经通过上游 `/models` 暴露了模型列表，仍然需要人工补 `modelOverrides` 才能获得较好的识别结果。

## 目标

- 为已经暴露 OpenAI 风格 `/models` 的 API surface 增加动态发现
- 对于已知模型，继续以 family resolver 作为能力真值来源
- discovery 主要解决“模型身份覆盖”问题，而不是替代现有的 curated capability metadata
- 未知模型保持保守且可解释
- 在诊断面中明确展示模型来自 catalog、实时 discovery、缓存 discovery，还是 generic fallback

## 非目标

- 不做 provider 或 API 的运行时自动切换
- 不尝试仅凭 `/models` 载荷推断完整能力
- 不修改用户管理的配置面
- v1 不做基于认证身份的缓存分区
- v1 不做 anthropic 专用 discovery 路径

## Discovery 范围

v1 只应覆盖已经具备 OpenAI 风格 `/models` 接口的 transport：

- `openai-compatible`
- `openai-responses`

v1 不应尝试 discovery：

- `anthropic`
- discovery 价值不高的纯静态 native catalog

实际最有价值的场景是：

- `custom`
- `openrouter`
- `bailian`
- 其他代理或自托管的 OpenAI-compatible 网关

对于原生 GLM catalog，静态定义仍然是能力行为的权威来源。discovery 的作用是补足这些 endpoint 暴露出来的别名、snapshot 和网关特有模型名。

## 缓存边界

v1 缓存键应至少包含：

- 规范化后的 provider 名称
- 规范化后的 API kind
- 规范化后的 base URL

建议结构：

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

建议缓存文件路径：

- `~/.glm/agent/discovered-models.json`

v1 不应复用 `~/.glm/agent/models.json` 作为 discovery cache。`models.json` 属于继承自 Pi 的 runtime model registry 面，而 discovery 结果本质上是对远端网关的观测。将两者分离可以避免混淆：

- 远端拉取生成的模型清单
- provider / registry 定义
- 后续可能出现的人工或工具写入

## 缓存策略

v1 的缓存策略应保持简单且确定：

- 默认 TTL：24 小时
- 缓存命中且未过期：直接使用缓存，不发网络请求
- 缓存命中但已过期：尝试实时刷新；刷新失败则回退到旧缓存
- 缓存缺失：尝试实时拉取；拉取失败则回退到当前静态行为

v1 不应因为 discovery 失败而直接阻断 session 启动。

当实时 `/models` 拉取失败时：

- 有旧缓存则继续使用旧缓存
- 没有缓存则继续走当前静态 resolver 路径
- 同时把失败信息暴露到诊断面

## 解析管线

运行时模型解析顺序应为：

1. 显式 curated catalog 命中
2. 动态 discovery 身份命中
3. 通用 transport fallback
4. 最后应用 `modelOverrides`

更具体地说：

1. 确定 provider、API 和规范化 base URL
2. 读取当前网关范围下的 discovery cache
3. 若缓存缺失或过期，则尝试刷新
4. provider 模型列表由两部分组成：
   - 当前 provider 已知的 curated 模型
   - discovery 返回且尚未被 curated 模型覆盖的 ID
5. 对每个 discovery 模型 ID：
   - 先走现有 family resolver
   - 若能命中 canonical model，则继续使用 curated family metadata
   - 若不能命中，则为当前 transport 生成 generic profile
6. 最后应用 `modelOverrides`

这能保证能力真值仍然由 family resolver 提供，同时让 discovery 扩展可见的模型命名空间。

## 映射规则

discovery 得到的模型应被分成三类：

### 1. 命中 canonical catalog

例如：

- 网关别名能映射到 `glm-5.1`
- Qwen snapshot 能映射到已知 `qwen` family 模型

行为：

- 直接使用 curated family metadata
- 解析来源标记为 `dynamic-catalog-match`

### 2. 命中已知 family，但不是 canonical ID

例如：

- provider 特有的前缀 / 后缀命名
- 仍能明确归属到 GLM 或 Qwen 的 snapshot 名称

行为：

- 复用 family 级匹配和变体推断逻辑
- 置信度低于直接 canonical ID
- 来源标记为 `dynamic-family-match`

### 3. 未知模型

行为：

- 使用当前 transport 的 generic 默认能力
- 不主动推断未声明的模态或高级能力
- 来源标记为 `dynamic-generic`

v1 对未知模型应默认假设：

- 仅支持 text 输入，除非 curated metadata 或 `modelOverrides` 明确声明
- 默认不支持 reasoning，除非 curated metadata 或 `modelOverrides` 明确声明
- 默认不承诺 cache / tool / structured output，除非 curated metadata 或 `modelOverrides` 明确声明

## 诊断面

`glm inspect` 与运行时诊断应至少展示：

- discovery 是否启用
- 当前 provider/API 是否支持 discovery
- discovery cache 路径
- discovery cache key
- 上次拉取时间
- 缓存是否过期
- 最近一次拉取错误
- 当前模型的解析来源：
  - `catalog`
  - `dynamic-catalog-match`
  - `dynamic-family-match`
  - `dynamic-generic`
  - `override`

这是必要的，因为操作者需要区分：

- “这是一个已知且被精细维护的模型”
- “这个模型是因为 `/models` 暴露出来才被识别到”
- “这个模型当前只是 generic 保守模式，并没有精细调参”

## 配置面

v1 应在 `~/.glm/config.json` 中增加明确的 discovery 配置块：

```json
{
  "modelDiscovery": {
    "enabled": true,
    "cacheTtlMs": 86400000,
    "allowStaleOnError": true
  }
}
```

v1 不需要过大的策略面。最小可控项应为：

- `enabled`
- `cacheTtlMs`
- `allowStaleOnError`

能力调优仍然继续放在 `modelOverrides`，而不是混进 discovery config。

## 失败模型

失败模型应保持对操作者安全：

- discovery 拉取失败不能阻断启动
- 非法 `/models` 响应不能污染缓存
- 一个网关的缓存不能影响其他网关
- 同一 host 下不同 API kind 的缓存不能互相污染

缓存写入只应在条目校验通过后发生。

## 实现切分

实现阶段应覆盖：

- discovery 配置解析
- discovery cache store
- 支持 API 的实时 `/models` 拉取
- provider 注册集成
- runtime status 字段补齐

验证阶段应覆盖：

- 缓存命中 / 缺失 / 过期行为
- base URL 维度隔离
- API 维度隔离
- catalog match 与 generic fallback
- `modelOverrides` 优先级
- discovery 失败时的安全回退

## 已知风险

- 某些网关的 `/models` 结果会随认证身份变化，而 v1 的缓存键只按 provider/API/baseURL 分区
- 不同网关返回的 `/models` 载荷质量差异较大
- OpenRouter 一类聚合网关的模型清单可能很大，需要保证校验和过滤逻辑足够轻量

这些风险在 v1 可以接受，但前提是：

- discovery 结果不能覆盖显式 curated metadata
- 操作者仍然可以通过 `modelOverrides` 强制校正行为
