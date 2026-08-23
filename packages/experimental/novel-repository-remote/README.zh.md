# @deepseek-ai/dsh-experimental-novel-repository-remote

[English](README.md) | 中文

## 用途

这个实验性 Host Consumer 提供 Novel Project 发现，以及有边界的浏览器资产目录、章节读取、版本保护保存和选区冻结方法，同时避免把传输行为加入提供方无关的 `ctx.novelRepository` Service Definition。Host 服务及其生成的浏览器约定仍是 Novel Studio 中显式启用的部分。

## 行为

- `NovelRepositoryRemote` 使用 Host service key `novelRepositoryRemote` 注册，消费 `ctx.novelRepository`、`ctx.fs` 与 `ctx.sandboxPolicy`，并导出 wire namespace `novelRepository`。
- `novelRepository/discover` 解析被寻址 Agent Session 的工作目录，将校验委托给当前 Novel Repository 提供方，并且只在提供方找不到 `novel.yaml` 时返回 `undefined`。
- `NovelProjectDescriptor` 包含稳定项目 id、schema、标题与显示路径。它不会向浏览器暴露文件系统 target key 或可变的提供方对象。
- `assets`、`asset` 和 `saveChapter` 只投影浏览器安全的 id、元数据和章节正文。`captureSelection` 还会返回包含规范 `dsh-novel:` 引用的可读 Markdown mention。
- `changeSet`、`applyChangeSet` 和 `rejectChangeSet` 暴露浏览器审阅。应用和拒绝把被寻址 Agent Session id 作为显式授权，并返回持久终态或冲突状态。
- 资产目录、当前 head 读取、保存与应用都会解析被寻址 Agent Session 的 sandbox policy，并把它传入 Repository 协调流程。这样外部 Session 工作区可写，同时不会放宽部署 fallback 根目录。
- `responseMaxBytes` 默认是 8 MiB，对所有非发现 JSON 完整响应设置边界；超出预算时明确失败，不截断也不静默漏掉数据。
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

- **没有提案端点**：模型提案通过独立 Novel 工具进入；浏览器 Remote 只能读取、接受或拒绝已有 ChangeSet。
- **没有工作台 UI**：本包发布类型化浏览器 API，但不渲染资产浏览器、编辑器、Context Tray 或审阅卡片。
- **不拥有 Session Log**：独立 Novel context Consumer 拥有持久模型上下文；浏览器 discovery 响应本身不会进入 Session Log。
- **需要显式组合**：Host 服务不属于默认 Web Profile；Novel Studio 组合必须将其与 Repository 提供方及独立 Client adapter 一起安装。
