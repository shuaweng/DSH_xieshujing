# @deepseek-ai/dsh-experimental-novel-repository-client

[English](README.md) | 中文

## 用途

这个实验性 Client adapter 为浏览器插件挂载生成的 Novel Repository Remote，同时让 Host Consumer 保持在独立的编译 aggregate 中。它是 Novel Studio 组合中显式启用的基础设施条目，不贡献工作台 UI。

## 行为

- 浏览器 `./client` 插件消费 `ctx.remote`，并挂载 `@deepseek-ai/dsh-experimental-novel-repository-remote/remote`。
- 释放 Cordis fiber 会撤销完整的生成 contribution，包括 `novelRepository/discover` 方法。
- Node loader 入口没有 Host 行为。现有 Gateway 身份策略与 `@deepseek-ai/dsh-experimental-novel-repository-remote` 分别继续负责 Agent 解析与项目发现。
- adapter 位于 Client aggregate，因此 Host 专属的 Agent 与文件系统 target 类型不会进入浏览器编译。

## 模型体验

### 项目发现挂载

#### 模型看到的内容

`ctx.remote.novelRepository` 的任何内容都不会加入模型上下文。该 adapter 挂载这个浏览器 API，不注册提示词 contribution 或面向模型的工具。

#### Token 影响

该 adapter 不增加提示词或工具 schema token。

#### KV Cache 影响

该 adapter 不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **没有工作台 UI**：该 adapter 挂载项目发现能力，但不会渲染项目选择器、资源管理器、编辑器、Context Tray 或错误状态。
- **仅支持发现**：挂载的约定不能列出资产、读取 Frontmatter、公开 Revision 或提交 ChangeSet。
- **需要生成的 Host 产物**：Host 构建必须先生成 Remote contribution，随后才能执行 Client 编译与打包。
- **需要显式组合**：受支持的 Novel Studio 组合会安装该 adapter，自定义 Cordis 组合也可直接安装；默认 Web 与 headless Profile 不包含它。
