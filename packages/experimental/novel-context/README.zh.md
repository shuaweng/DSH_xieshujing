# @deepseek-ai/dsh-experimental-novel-context

[English](README.md) | 中文

## 用途

这个实验性 Host Consumer 将携带 Revision 的规范 Novel 引用转换为精确的模型可见上下文，并让 DSH 可以从 Session 日志中重建它。

## 行为

- `dsh-novel:` URI 携带一个项目、资产、已保留 Revision、可选 UTF-16 文本选择器和展示标签；`formatNovelReferenceMention()` 将 URI 包装为 Composer 草稿中的可读 Markdown 引用。
- `NovelContextResolver` 在 `agent/pre-step` 拦截直接用户消息，只从可读消息中移除已识别的规范引用，解析精确的已保留 Revision，并紧随其后追加一条来源类型为 `novel-context` 的不可变 `user/message`。
- 被引用的正文以确定性 JSON 序列化在明确的“不可信资料”框架内。引用不会授予指令、权限或工具权威。
- 默认一次请求最多包含八个引用和 256 KiB 已解析 UTF-8 文本。两个正整数上限均可配置，重复引用会合并，超限会在模型请求前失败。
- 文本选择器只有在 UTF-16 边界不切开代理对且 quote hash 与精确的已保留 Revision 匹配时才有效。解析器绝不回退读取当前文件。
- 第一条持久 Novel 上下文消息把 Session 绑定到一个 Project；后续引用另一个 Project 会明确失败。

## 模型体验

### 冻结的小说上下文

#### 模型看到什么

模型先看到用户的可读消息，随后看到一条 `Referenced novel material` 消息，其中包含精确 Revision 元数据和安全序列化的创作文本。Session 回放可通过其 `novel-context` 来源恢复该上下文消息。

#### Token 影响

只有明确引用的文本会被加入。固定安全框架和 JSON 元数据带来少量开销；配置的引用数和字节上限限制可变部分。

#### KV Cache 影响

本包不改变 system prompt 或工具目录。引用不同 Revision 会改变本次请求的用户消息后缀，但不影响更早的可复用前缀。

## 已知限制与延期工作

- **仅显式引用** — 自动检索、固定工作集、语义搜索和相关性排序尚未实现。
- **每个 Session 一个 Project** — 不支持跨项目上下文和 Series 级共享资产。
- **UTF-16 范围选择器** — 稳定 Block id、模糊重定位和三方选区修复尚未实现。
- **完整保留文本** — 解析器不摘要或压缩被引用资产；调用方必须遵守配置预算。
