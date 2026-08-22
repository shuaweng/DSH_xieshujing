# @deepseek-ai/dsh-experimental-novel-repository-remote

[English](README.md) | 中文

## 用途

这个实验性 Host Consumer 提供只读的 Novel Project 发现能力，同时避免把传输行为加入提供方无关的 `ctx.novelRepository` Service Definition。它的 Host 服务及其生成的浏览器约定都是 Novel Studio 组合中的显式可选部分。

## 行为

- `NovelRepositoryRemote` 使用 Host service key `novelRepositoryRemote` 注册，消费 `ctx.novelRepository` 与 `ctx.fs`，并导出 wire namespace `novelRepository`。
- `novelRepository/discover` 解析被寻址 Agent Session 的工作目录，将校验委托给当前 Novel Repository 提供方，并且只在提供方找不到 `novel.yaml` 时返回 `undefined`。
- `NovelProjectDescriptor` 包含稳定项目 id、schema、标题与显示路径。它不会向浏览器暴露文件系统 target key 或可变的提供方对象。
- 现有 Gateway 身份策略负责解析被寻址的 Agent；本包不增加授权机制。`descriptorMaxBytes` 限制以 UTF-8 编码的完整 descriptor JSON，默认值为 256 KiB，且不能超过运行时最大字符串长度。
- 生成的 `./remote` contribution 对浏览器安全，由独立的 `@deepseek-ai/dsh-experimental-novel-repository-client` 包负责挂载；这个 Host 包不会进入 Client 编译 aggregate。
- Host 服务拥有独立 Cordis key，因此安装传输层不会替换 `novelRepository` 提供方。不同的 wire namespace 则保留面向浏览器的 `ctx.remote.novelRepository` API。

## 模型体验

### 项目发现 Remote

#### 模型看到的内容

`novelRepository/discover` 的任何内容都不会加入模型上下文。此端点服务于浏览器插件，既不注册提示词 contribution，也不注册面向模型的工具。

#### Token 影响

Remote descriptor 与浏览器结果不会增加提示词或工具 schema token。

#### KV Cache 影响

本包不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **仅支持发现**：该 Remote 不会列出资产、读取 Frontmatter、公开 Revision 或提交 ChangeSet。
- **没有工作台 UI**：本包会发布类型化浏览器约定，但不会渲染项目选择器、资源管理器、编辑器或错误状态。
- **没有 Session Log 或模型上下文集成**：发现会使用现有 Gateway 身份策略选定的 Agent Session 工作目录，但结果不会进入 Session Log 或模型上下文；未来的上下文 Consumer 必须负责该持久投影。
- **需要显式组合**：Host 服务不属于默认 Web Profile；Novel Studio 组合必须将其与 Repository 提供方及独立 Client adapter 一起安装。
