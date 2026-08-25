# @deepseek-ai/dsh-experimental-novel-context

[English](README.md) | 中文

## 用途

这个实验性 Host Consumer 将携带 Revision 的规范 Novel 引用转换为精确的模型可见上下文，并让 DSH 可以从 Session 日志中重建它。

## 行为

- `dsh-novel:` URI 携带一个项目、资产、已保留 Revision、可选的类型定义 JSON selector 和展示标签；`formatNovelReferenceMention()` 将 URI 包装为 Composer 草稿中的可读 Markdown 引用。
- `NovelContextResolver` 在 `agent/pre-step` 拦截直接用户消息，只从可读消息中移除已识别的规范引用，解析精确的已保留 Revision，并紧随其后追加一条来源类型为 `novel-context` 的不可变 `user/message`。
- `replaceWorkset()` 把完整的当前跟随/固定引用集记录为带版本的 `novel/context-workset` Session 事件。最多一个条目跟随当前已保存 Asset；检索到的 Asset 可以固定。替换为相同值时不追加事件。
- 客户端可见的 `novelContextWorkset` Session Projection 折叠最新整值。浏览器只用它披露并编辑下一轮工作集；模型可见权威仍是冻结进 Session Log 的第二版 Context Manifest。
- 每个条目都会序列化规范、绑定精确 Revision 的 `dsh-novel:` 坐标。跟随/固定工作集只携带坐标，需要正文时由 Agent 使用 `novel_get`；Composer 显式引用则在不可信资料框架中嵌入精确选中文字（或显式整 Asset 投影）。
- 在直接用户轮次中，Composer 显式引用排在保留工作集之前，精确重复项会合并；一份 Manifest 会记录每个精确 Revision 的 `explicit`、`follow` 或 `pinned` 模式及来源。工具续步不会重复注入工作集。
- 默认一次请求最多包含八个引用和 256 KiB 已解析 UTF-8 文本。两个正整数上限均可配置，重复引用会合并，超限会在模型请求前失败。
- 解析器让目标 Asset 已注册的 Host 定义校验 selector 并生成模型投影。内置文本 selector 会拒绝切开代理对或 quote 漂移；任何 selector 都绝不回退读取当前文件。
- 第一条持久 Novel 上下文消息把 Session 绑定到一个 Project；后续引用另一个 Project 会明确失败。

## 模型体验

### 冻结的小说上下文

#### 模型看到什么

模型先看到用户的可读消息，随后看到一份含规范精确 Revision 坐标的 Manifest。只有显式引用携带创作文本；自动跟随的当前 Asset 与检索固定项只保留坐标。第二版 `novel-context` 来源携带确定性 Manifest id、来源和保留模式，因此 Session 回放可以重建同一个上下文切面。

#### Token 影响

可见工作集的坐标只增加有界元数据；显式引用文本才是受配置字节上限约束的可变部分。

#### KV Cache 影响

本包不改变 system prompt 或工具目录。引用不同 Revision 会改变本次请求的用户消息后缀，但不影响更早的可复用前缀。

## 已知限制与延期工作

- **仅由作者控制检索进入上下文** — 检索结果只有在作者或 Agent 选择精确结果后才会进入上下文；自动检索、语义排序和隐藏上下文注入尚未实现。
- **每个 Session 一个 Project** — 不支持跨项目上下文和 Series 级共享资产。
- **UTF-16 范围选择器** — 稳定 Block id、模糊重定位和三方选区修复尚未实现。
- **显式文本保持原文** — 解析器不摘要或压缩显式选区或整 Asset 引用；调用方必须遵守配置预算。
