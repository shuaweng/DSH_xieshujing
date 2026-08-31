# Agent Note: 自由大纲与章纲资产

Status: proposed

[English](2026-08-23-freeform-outline-and-chapter-plan-assets.md) | 中文

## Problem

第一版 `planning.outline` 使用固定 YAML 树，节点暴露 `summary`、`goal`、`conflict` 和 `turn` 字段。这个格式证明 Asset Type Registry 能支持结构化数据，却也把一种写作方法变成了唯一合法的大纲。作者和 Agent 无法直接使用散文、表格、自定义标题、节拍清单或项目自己的约定，必须先把想法翻译成 Repository 预设字段。

章纲也有同样风险。情绪目标、场面钥匙、钩子分布、节奏比例和起承转合都是有用提示，并不是普遍 Canon。把它们设为必填字段，会把可选写作指导误当成持久数据完整性规则。

工作台还缺少创建新 Asset 的领域操作。Agent 可以列出、读取并提议修改已有大纲，但不能通过同一类型化边界创建全书大纲、卷纲或章纲。

## Proposal

用自由 Markdown Asset 取代固定大纲树。Repository 只约束身份、类型、父级关系、嵌套深度、Revision 和修改协议，不约束作者内部采用何种大纲记法。

`planning.outline` 只有两个层级：

- 全书大纲没有父大纲；
- 卷纲恰好有一个全书大纲父级。

两个层级都只包含一份不受限制的 Markdown 正文。作者需要备选方案时，一个项目可有多个全书大纲；卷纲不能再包含卷纲。Explorer 把父子关系渲染成两层树，编辑区是自由写作面，而不是字段检查器。

新增独立的 `planning.chapter-outline` 自由 Markdown Asset，它恰好有一个 `manuscript.chapter` 父级。每章最多对应一个当前章纲。它不出现在主策划树中，而是从正文底部状态栏打开右侧抽屉，让作者无需离开章节就能查阅或编辑。用户可主动插入起步模板，其中建议核心事件、情绪目标、场面钥匙、钩子、节奏、起承转合和连续性检查。模板只是插入的文字，不是 Schema；作者或 Agent 可以完全替换。

新增类型化 Repository 创建操作，并通过 `novel_create` 暴露。Asset Type 定义拥有创建校验和序列化；Repository 生成身份以及注册内容根内的安全路径，校验父级类型和基数，使用 `createIfAbsent` 发布，并记录产生的 Revision。模型只提交语义类型、标题、可选父 Asset id 和类型化内容，不能提交文件系统路径。

创建立即生效，因为它只增加可恢复的新文件，不会覆盖已有 Canon。Agent 对现有大纲或章纲的修改仍只能生成绑定 base Revision 的 ChangeSet 提案。`novel_get` 提供精确自由正文和类型专属指导；`novel_propose_changes` 使用与正文相同的 Revision-bound 文本范围协议。

作者文件继续作为当前内容权威。若文件发布后、历史插入前崩溃，磁盘上仍是一份合法类型文件；项目协调会观察它并补建缺失 Revision。因此创建无需跨介质事务，也不增加 apply journal 状态。

## On-disk formats

全书大纲是带 version-one Frontmatter 的 Markdown：

```markdown
---
novel:
  schema: 1
  id: outline_...
  type: planning.outline
  level: book
  title: 全书大纲
---

作者可采用任意 Markdown 结构。
```

卷纲增加 `parent`，并使用 `level: volume`。章纲使用 `type: planning.chapter-outline`，`parent` 指向章节 Asset。类型化内容只包含 discriminator、适用时的大纲层级以及 Markdown body。Frontmatter 拥有层级关系；正文保留为不受约束的作者文本。

## Alternatives considered

**保留固定 goal/conflict/turn 树，再加一个自由备注字段。** 这样仍把 Repository 的写法放在主位、自由写作放在次位，Agent 仍会优先完成表格，而不是使用作者的策划语言。

**把完整层级存进一个大纲文档。** 这省去父级引用，却让卷纲难以独立寻址、修订、打开或提供给 Agent。独立 Asset 让全书大纲和卷纲各有稳定身份与 Revision，Explorer 再重建两层视图。

**把章纲方法设成必填字段。** 这些方法适合模板和提示词，但不够普遍、也不够稳定，不能成为持久格式契约。必填字段会拒绝作者或 Agent 设计的其他有效格式。

**让 Agent 用通用写工具创建文件。** 这会绕过类型校验、父级约束、Revision 创建、工作台失效通知和安全路径所有权。`novel_create` 让创建与读取、ChangeSet 处于同一领域边界。

**让 Agent 创建也变成 ChangeSet 提案。** 多文件创建提案需要更广的 journal 和审阅模型。第一版只立即创建拥有唯一名字的新 Asset；可能覆盖当前作者内容的修改仍使用 ChangeSet。

## Acceptance criteria

- 全书大纲与卷纲是自由 Markdown Asset，并在 Explorer 中呈现两层层级。
- 工作台可以创建、打开、改名、编辑、保存并对两级大纲执行 Revision 校验，不出现方法专属字段。
- `novel_create`、`novel_get` 和 `novel_propose_changes` 让 Agent 能创建、读取并提议 Revision-bound 的两级大纲修改。
- 每个章节都能从正文状态栏打开一个主题联动的自由章纲右侧抽屉；可选起步模板从不参与校验。
- Agent 可以通过章节父级寻址并创建、读取、提议修改章纲。
- 默认 `web` 与 `headless` 组合不加载该能力。
- 真实 Novel Studio 组合测试与无 key 浏览器快照覆盖创建、编辑、上下文、提案展示和章纲抽屉。

## Risks

自由 Markdown 放弃字段级校验、字段级 Diff，以及围绕规范 goal/conflict/turn 属性的自动推理。搜索和后续 skill 必须理解自由文本，或使用自愿约定。稳定 Asset 身份、父级关系、不可变 Revision、精确选区和 ChangeSet 仍然机器可读，所以未来仍能并存新的结构化策划类型，而无需重新限制本类型。
