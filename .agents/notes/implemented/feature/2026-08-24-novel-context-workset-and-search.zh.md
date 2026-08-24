# Agent Note: 小说上下文工作集与有界 Asset 检索

Status: implemented

[English](2026-08-24-novel-context-workset-and-search.md) | 中文

## Problem

小说工作台已经能把一个显式选区冻结为规范 `dsh-novel:` Composer 引用，Host 也已经会把模型实际看到的精确 Asset Revision 写入 Session Log。这证明了单引用安全链路，但作者还没有可管理的工作集：章节、大纲或人物卡不能跨轮固定；当前打开的 Asset 不能在受保护保存后有意跟随；Composer 也没有紧凑披露下一轮会收到的非文字引用。

Agent 还必须先用 `novel_list` 枚举完整目录，才能读取相关 Asset。Book 变大后这会产生噪声，也会诱导模型猜路径或标题，而不是通过语义化 Asset 发现目标。

## Decision

新增 Session 所属的小说上下文工作集和有界词法 Asset 检索，同时保持精确 Revision 是模型输入的唯一权威。

工作集是 whole-value 的 `novel/context-workset` Session 事件，最多包含一个 `follow` 引用和若干显式 `pinned` 引用。每项都携带同一个项目、Asset、保留 Revision、可选的类型化 selector、面向作者的 label 与来源。浏览器通过类型化 Remote mutation 替换整个值；客户端可见 Session Projection 折叠最新事件，使刷新、其他标签页和重放都能恢复同一工作集。该事件是协作状态，不是书籍作者数据，因此绝不进入 Frontmatter 或 `.novel/history.sqlite`。

在 `agent/pre-step`，小说上下文解析器把当前工作集与直接用户消息中解析出的规范引用合并。显式消息引用优先，按精确 URI 身份去重，仍然执行单项目 Session 绑定，所有仓库读取都指向指定的保留 Revision。解析器只生成一条模型可见的 `user/message`，其 `novel-context` source 是版本二 Context Manifest。Manifest 拥有确定性的内容派生 ID，并记录每个冻结引用的来源与模式；完整材料继续保存在 append-only Session Log 中，重放时无需重新读取可变 head。

Composer 只为精确 `novel-workbench` preset 贡献紧凑 Context Tray。它用人类可读 label 提供跟随当前、搜索并固定以及移除动作，不展示路径、offset、编码 URI 或原始模型负载。显式选区继续表现为普通 `@[预览…]` Composer occurrence。搜索与固定项以独立紧凑 chip 出现，因为它们会影响后续多轮，但不是用户草稿中的文字。

`novel_search` 与对应浏览器 Remote 共用一个 provider-neutral 仓库操作。版本一对当前类型化 Asset 的 model text 与标题执行确定性、有边界的词法扫描，返回精确当前 Revision 引用和短摘录，并支持可选 Asset 类型过滤。检索结果只用于发现：不会自动注入，也不会修改作者内容。以后可在同一仓库 seam 后用可重建 SQLite/FTS 或语义索引替换本地扫描。

`follow` 项只在浏览器观察到受保护保存成功并拿到新 Revision 后前进。未保存的编辑器字节绝不会被悄悄当作当前上下文；当前 Asset 为 dirty 时，Tray 标记“等待保存”，Host 保留上一个精确已保存 Revision。显式选区捕获继续保留既有的“先保存、再冻结”屏障。

## Durable and wire contracts

- `novel/context-workset` 是版本化 whole-value Session 事件，其 Projection 是唯一实时工作集读取面。
- 版本二 `novel-context` source 是冻结 Context Manifest，拥有确定性的 `manifestId`、项目身份与精确引用记录。
- 工作集 mutation 在 append 前校验边界、精确引用形状、单项目归属与 Session 工作目录绑定。
- 检索受 query 长度、结果数量、摘要长度与 Remote 聚合响应大小约束。
- 清空全部项目时 append 空工作集值，不删除或改写既有事件。

## Alternatives considered

**把每个引用都保留为隐藏 Composer 文字。** 这会让固定能力把实现 token 泄漏进草稿语义，难以区分跨轮引用与作者指令，也没有持久的当前工作集 Projection。

**工作集只存在浏览器本地状态。** 刷新和其他标签页会产生分歧，Host 也无法证明某轮模型输入包含了哪些非文字引用。

**为每次 prompt 自动检索相关 Asset。** 自动检索会隐藏模型看到了什么，并在显式工作集尚不可靠时过早引入排序质量问题。PR7 保持发现由用户或 Agent 主动发起。

**立即引入 SQLite FTS 或 embedding。** 当前项目规模不足以证明迁移与索引恢复复杂度合理。有边界的 provider-neutral 词法契约可以先验证产品行为，又不会把第一版实现固化为永久存储设计。

## Consequences

只有精确 `novel-workbench` Session 会渲染紧凑 Context Tray。作者可以跟随当前已保存 Asset、搜索并固定精确结果，也可以移除固定项或跟随项；仓库、Remote 和 Agent 检索契约还支持可选 Asset 类型过滤。刷新或重新打开 Session 时，会从 Session 事件与 Projection 重建最新工作集。

即使 prompt 中没有可见 Novel mention，也会收到固定和跟随的精确 Revision；显式 `@[预览…]` 引用会被合并去重。每个直接用户轮次在准备后都会把版本二 Context Manifest 与完整模型可见材料写入 Session Log。当前 dirty 内容绝不会被标为已包含：受保护保存会推进跟随引用，显式选区捕获仍保留“先保存、后冻结”屏障。

检索仍是有边界、只用于发现的能力。它返回精确 Asset/Revision 引用与摘要，不自动注入结果，并且只组合进小说 preset。首版词法实现可以在仓库契约之后被替换。

## Risks

如果客户端发布未变化值，whole-value 工作集事件会膨胀 Session Log，因此 mutation 必须拒绝 no-op 替换。词法检索会漏掉概念相近匹配，也可能把常见词排序不佳；这是有意且可见的限制。跟随引用会在受保护保存成功前落后于未保存输入，这是为了可重放性，而不是假装 Host 已经拥有尚未保留的字节。Context Tray 会在精确小说 preset 激活时固定占用一行紧凑 Composer 空间。即使工作集为空，仍保留跟随与搜索入口，可以让能力易于发现；preset 隔离则保证该行不会出现在普通 Agent Session。

## Testing

聚焦的仓库、上下文、Remote、Agent 工具、客户端与 Novel Studio 组合套件共 96 项测试通过。受影响的 TypeScript 项目引用可联合构建，生成的 Remote 契约为最新；仓库 lint、契约、双语配对、文档与客户端 bundle gate 在 PR7 提交前执行。
