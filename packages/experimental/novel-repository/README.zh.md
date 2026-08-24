# @deepseek-ai/dsh-experimental-novel-repository

[English](README.md) | 中文

## 用途

这个实验包定义提供方无关的 `ctx.novelRepository` 能力 seam、effect 作用域内的 `ctx.novelAssetTypes` 注册表，以及第一版 Novel Project 类型。它让 Host 消费方使用稳定的 Project、Asset、Revision 与 Selection 身份，而不把文件系统路径、Session、浏览器状态或传输请求当作这些对象的身份。

## 行为

- `NovelRepository.discoverProject()` 接收一个规范化的文件系统目录 target；只有该目录不存在 `novel.yaml` 时才返回 `undefined`。
- 已发现的 `NovelProjectSnapshot` 包含 schema `1`、稳定 `ProjectId`、作者可见标题、规范化项目与清单 target，以及规范化的具名内容根 target。
- `listAssets()` 把作者文件协调为当前目录项，`searchAssets()` 通过提供方拥有的检索策略发现有边界的当前精确 Revision，`createAsset()` 在提供方拥有的路径创建已注册类型，`readAsset()` 读取当前或指定的已保留不可变 Revision，`saveAssetContent()` 以版本保护方式保存完整类型化内容，`captureSelection()` 冻结由资产类型定义的语义选区。
- `NovelAssetTypeMap` 可以通过声明合并扩展。每个匹配的 Host 定义拥有创建说明、可选语义父级规则、精确作者类型解析/创建、模型投影、选区校验、保存物化、持久操作解码和 ChangeSet 物化；注册项必须唯一，并随调用方 effect 释放而移除。
- 第一版内置 `manuscript.chapter`，并由独立策划包贡献自由的 `planning.outline` 与 `planning.chapter-outline`；同时提供精确 `sha256:` 内容哈希、不可变 Revision 父链、绑定 Revision 的 `SelectionRef`、类型化 `replace-text` 操作，以及携带目标 Asset 类型的持久单资产 ChangeSet。
- `proposeChangeSet()` 记录提案但不修改创作文件。`readChangeSet()`、`applyChangeSet()` 和 `rejectChangeSet()` 暴露明确审阅状态转换；应用权威是由获授权 Consumer 提供的 Session id。
- 可能发布文件或恢复中断 apply 的操作接收可选的逐调用 sandbox policy。感知 Session 的 Consumer 必须传入被寻址 Session 的已解析策略，使位于 Host 进程工作目录之外的 Project 也只能在该 Session 工作区边界内写入。
- 提供方通过稳定的 `NovelRepositoryError` code 报告非法根目录、格式错误或过大的清单、不支持的 schema 与路径逃逸，而不会猜测如何修复。
- 本包只负责 Service Definition、与提供方无关的公共值和错误类型。`@deepseek-ai/dsh-experimental-novel-repository-local` 等提供方负责清单 I/O 与校验；任何 Remote 或 UI 投影均由独立 Consumer 负责。

## 模型体验

### 项目发现服务

#### 模型看到的内容

`ctx.novelRepository` 的任何内容都不会加入模型上下文；本包既不注册提示词贡献，也不注册面向模型的工具。

#### Token 影响

Service Definition 与项目值不会增加提示词或工具 schema token。

#### KV Cache 影响

本包不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **内置三种资产类型**：内核安装 `manuscript.chapter`；策划包贡献 `planning.outline` 与 `planning.chapter-outline`。人物、灵感、关系、场景与视图定义均暂缓。
- **每个 ChangeSet 一个操作**：当前文本 Asset 支持一个精确 `replace-text`，并拒绝自动重定位到较新的 Revision。
- **没有实时监听**：资产目录通过显式协调更新。Service 已提供有边界检索；文件监听与浏览器失效通知仍暂缓。
- **仅定义层**：Remote 投影、工作台展示、Session Log 上下文和面向模型的 Novel 工具都属于独立 Consumer。
