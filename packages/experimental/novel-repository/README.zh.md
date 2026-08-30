# @deepseek-ai/dsh-experimental-novel-repository

[English](README.md) | 中文

## 用途

这个实验包定义提供方无关的 `ctx.novelRepository` 能力 seam、effect 作用域内的 `ctx.novelAssetTypes` 注册表，以及第一版 Novel Project 类型。它让 Host 消费方使用稳定的 Project、Asset、Revision 与 Selection 身份，而不把文件系统路径、Session、浏览器状态或传输请求当作这些对象的身份。

## 行为

- `NovelRepository.discoverProject()` 接收一个规范化的文件系统目录 target；只有该目录不存在 `novel.yaml` 时才返回 `undefined`。
- `initializeProject()` 会先创建默认内容根目录，最后才发布作为激活标记的 `novel.yaml`。空标题、已存在清单以及内容根不是目录的冲突都会被拒绝，既不修改已有项目，也不覆盖损坏项目。
- 已发现的 `NovelProjectSnapshot` 包含 schema `1`、稳定 `ProjectId`、作者可见标题、规范化项目与清单 target、规范化的具名内容根 target、可选类型顺序以及可恢复的逻辑删除身份。
- `listAssets()` 把作者文件协调为当前目录项并应用清单中可选的按类型顺序，也会暴露由外部文件引入的单例冲突，供作者检查并删除修复；严格的创建、保存与应用路径仍会拒绝冲突。`reorderAssets()` 原子替换某一类型完整的稳定 ID 序列，`deleteAsset()` 把一个受保护的当前 Asset 及其语义后代移出实时目录，同时保留文件与历史，`searchAssets()` 通过提供方拥有的检索策略发现有边界的当前精确 Revision，`createAsset()` 在提供方拥有的路径创建已注册类型，`readAsset()` 读取当前或指定的已保留不可变 Revision，`listAssetRevisions()` 暴露有边界的 Revision 历史，`restoreAssetRevision()` 把一份已保留历史快照重新发布为新的、受版本保护的当前 Revision，`saveAssetContent()` 以版本保护方式保存完整类型化内容，`captureSelection()` 冻结由资产类型定义的语义选区。
- `NovelAssetTypeMap` 可以通过声明合并扩展。每个匹配的 Host 定义拥有创建说明、可选语义父级规则、全项目或无父根级单例 cardinality、精确作者类型解析/创建、模型投影、选区校验、保存物化、持久操作解码和 ChangeSet 物化；注册项必须唯一，并随调用方 effect 释放而移除。
- 第一版内置 `manuscript.chapter`，并由独立策划包贡献自由的 `planning.outline`、`planning.chapter-outline`、`book.brief`、`book.style-profile` 与 `book.story-state`；同时提供精确 `sha256:` 内容哈希、不可变 Revision 父链、绑定 Revision 的 `SelectionRef`、类型化正文插入与精确替换操作，以及携带目标 Asset 类型的持久单资产 ChangeSet。Agent 创作的 ChangeSet 及其发布的 Revision 可以保留有边界的生成 Lineage：Session/turn、模型路由、Preset、已加载 Skill 版本、冻结 Context Manifest，以及直接执行或 2–3 方案选择策略。Lineage 绝不保存 Prompt、方案正文或生成的小说正文副本。
- 恢复请求同时绑定精确当前 base Revision 与已保留源 Revision。成功后会创建新的当前 Revision 并记录恢复来源，绝不倒退指针或删除历史；该 Asset 所有仍为 `proposed` 的 ChangeSet 会被标记为冲突。绑定 Revision 的报告、定稿、偏好证据与 Story State 候选仍保留在产生它们的历史 Revision 上。
- `proposeChangeSet()` 记录提案但不修改创作文件。`readChangeSet()`、`applyChangeSet()` 和 `rejectChangeSet()` 暴露明确审阅状态转换；应用权威是由获授权 Consumer 提供的 Session id。
- `NovelAnalysisReport` 绑定一个 Project、Asset、精确 Revision 和报告种类。提供方暴露列出与 upsert 操作，因此成功重跑只替换某 Revision 的同类报告，而失败分析无法清除旧报告；各报告 payload 的语义归分析 Consumer 所有。
- `RevisionFinalization` 保留用户对一个精确章节 Revision 的显式定稿决策及其最近 Agent 作者祖先；`NovelPreferenceCandidate` 保留有边界的草稿/定稿证据，并在用户显式采纳或拒绝前保持惰性。提取与审阅后应用语义归分析 Consumer 所有。
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

- **内置六种资产类型**：内核安装 `manuscript.chapter`；策划包贡献 `planning.outline`、`planning.chapter-outline`，以及项目级唯一的 `book.brief` / `book.style-profile` / `book.story-state`。人物、灵感、关系、场景与视图定义均暂缓。
- **每个 ChangeSet 最多一个标题操作与一个正文操作**：内置文本 Asset 可以针对同一精确 Revision，把一个 `update-title` 与一个正文操作组合。正文使用 `insert-text` 或 `replace-text`；其他当前自由文本 Asset 使用 `replace-text`。类型会原子物化这组操作，所有操作都拒绝自动重定位到较新的 Revision。
- **没有实时监听**：资产目录通过显式协调更新。Service 已提供有边界检索；文件监听与浏览器失效通知仍暂缓。
- **仅定义层**：Remote 投影、工作台展示、Session Log 上下文和面向模型的 Novel 工具都属于独立 Consumer。
- **通用报告信封**：Repository 校验身份、大小、来源与无损 JSON；分析器特定的 payload 校验归写入它的分析服务所有。
