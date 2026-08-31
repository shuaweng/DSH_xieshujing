---
description: "为模型请求与重放编译精确 Asset Revision 的冻结式、任务专用 Novel Context Manifest。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-novel-context

[English](README.md) | 中文

## 概述

这个实验性 Host Consumer 将规范 Novel 引用和显式任务策略转换为有边界、精确的模型可见上下文，并让 DSH 可以从 Session 日志中重建它。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="behavior"></a>
## 行为

- `dsh-novel:` URI 携带一个项目、资产、已保留 Revision、可选的类型定义 JSON selector 和展示标签；`formatNovelReferenceMention()` 将 URI 包装为 Composer 草稿中的可读 Markdown 引用。
- `NovelContextResolver` 在 `agent/pre-step` 拦截直接用户消息，只从可读消息中移除已识别的规范引用，并紧随其后追加一条来源类型为 `novel-context` 的不可变 `user/message`。
- `compile()` 接受闭集任务策略与精确目标。策略覆盖普通 Turn、章节写作、选区改写/审查、大纲编辑、章节审查、偏好学习与 Story State 提取。策略由显式流程或 Skill 的 `novelContextPolicy` metadata 选择，绝不从用户自然语言猜测。
- 策略只扩展确定的类型化关系。章节写作/审查可加入对应章纲、本书概述、本书风格与已确认 Story State，而全书大纲只保留坐标；选区改写/审查加入风格与 Story State。项目级指导不是常驻上下文。
- `replaceWorkset()` 记录第二版整值。唯一 `follow` 条目只保存活动 Asset 身份，在编译时解析 current head；`pinned` 条目保留精确 Revision 和可选 selector。该整值也可以携带一份有边界的 `library-home` surface 快照，其中只有首页可见的书库元数据，且不会授予仓库或跨项目读取能力。旧版事件可继续重放，并在替换时规范化。
- 客户端可见的 `novelContextWorkset` Session Projection 折叠最新整值。它只是协调状态；模型可见权威是冻结进 Session Log 的第三版 Context Manifest。
- 普通 Turn 物化 Composer 显式引用，follow/pinned 工作集只给坐标。显式 `/skill-name` Turn 会立即按 Skill 策略编译；模型加载 Skill 后，下一 Step 会增加关联材料，不复制上一份 Manifest 已经物化的文本。
- 编译器会合并完全相同的精确坐标，同时保留不同选区；同一 Asset/Revision 已有必需材料时，也不会再被较低优先级的可选副本扩成全文。默认最多八个引用和 256 KiB 作者 UTF-8 文本。必需目标超预算时失败关闭；可选材料降级成坐标，而不是被截断。
- 每份 V3 Manifest 在一个确定性 Manifest id 下记录策略、精确 Revision、类型、来源、保留模式、投影、选取原因、内容哈希、模型文本大小与模型文本哈希。
- 解析器让目标 Asset 已注册的 Host 定义校验 selector 并生成模型投影。内置文本 selector 会拒绝切开代理对或 quote 漂移；任何 selector 都绝不回退读取当前文件。
- 第一条持久 Novel 上下文消息把 Session 绑定到一个 Project；后续引用另一个 Project 会明确失败。

<a id="model-experience"></a>
## 模型体验

### 冻结的小说上下文

#### 模型看到什么

模型先看到用户的可读消息，随后看到一份 `NovelContextManifestSourceV3` 框架，其中包含规范精确 Revision 坐标，以及当前任务策略选中的必要材料。在书库首页，该框架改为包含有边界的可见书库摘要，同时仍维持 Session 的单项目绑定，绝不会借此打开另一本书的 Asset。普通直接 Turn 保持轻量；Skill 与固定流程可以按显式原因和投影加入章纲、概述、风格、已确认 Story State 或大纲关系。Session 回放能重建同一个精确上下文切面。

#### Token 影响

坐标和书库首页 surface 只增加有界元数据；物化的目标和关联文本才是受配置字节上限约束的可变部分。预算耗尽时，可选文本会变成坐标。

#### KV Cache 影响

本包不改变 system prompt 或工具目录。引用不同 Revision 会改变本次请求的用户消息后缀，但不影响更早的可复用前缀。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- **仅确定类型关系** — 语义排序、embedding、生成摘要与隐藏意图分类尚未实现；Story State 只在显式章节策略下以精确作者文本加入。
- **每个 Session 一个 Project** — 不支持跨项目上下文和 Series 级共享资产。
- **UTF-16 范围选择器** — 稳定 Block id、模糊重定位和三方选区修复尚未实现。
- **物化文本保持原文** — 编译器不摘要或压缩选中的投影。后续可在相同显式 compile 与 V3 Manifest 接缝后增加策略化摘要或按模型 token 预算。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
