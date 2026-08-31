# Agent Note：小说定稿与偏好学习

Status: implemented

[English](2026-08-26-novel-finalization-preference-learning.md) | 中文

## 问题

小说工作台已经保留每次作者修改形成的 Revision，但还不能区分普通保存和作者真正认可的最终稿。因此，草稿/终稿 Diff 目前不是可靠的学习证据：中间编辑、被拒绝的 Agent 结果和误保存都会被误当成同等信号。PR11 必须先建立由作者显式控制的定稿边界，之后才允许推断长期文风或节奏指导。

这个切片不能把一次编辑偷偷变成永久 Prompt，也不引入人物、地点、灵感、Story State 或其他知识资产类型。现有的自由正文、章纲、全书概述与本书风格足以作为输入。

## 决策

在 `.novel/history.sqlite` Schema 版本五中增加持久定稿 sidecar 与持久偏好候选 sidecar。

- 一次定稿指向一个精确的 `manuscript.chapter` Revision。只有浏览器/用户 Remote 能创建定稿记录；没有模型工具可以把自己的输出标成定稿。重复标记同一 Revision 幂等。多个历史 Revision 可以继续保留定稿标记，因为定稿是作者决策，历史只追加。
- 学习源是同一 Revision 父链中最近的 `agent-apply` 祖先。其已应用 ChangeSet 仍是来源 Agent Session 的权威。如果没有 Agent 祖先、Agent 之后没有作者编辑，或文本没有变化，定稿仍成功，但系统不会虚构偏好候选。
- 固定一次性 Subagent 比较精确 Agent Revision 与精确定稿 Revision。Prompt 只包含有界、明确分隔的不可信文本，以及存在时精确的 `book.style-profile` 当前版本。输出为严格有界候选：摘要、建议 Markdown 指导和修改前后证据。
- 候选不等于风格规则。在作者接受或拒绝之前，它一直是 `pending`。接受时通过现有 ChangeSet 与可恢复 Apply 协议，把已审阅指导追加到提取时绑定的精确风格 Revision；风格资产已经变化时产生冲突，绝不覆盖。拒绝只改变候选状态。
- 缺少风格资产时不创建隐藏状态。工作台要求作者先创建可见的 singleton 风格资产，再重新提取。
- 原始指令、Skill 调用、模型/工具轨迹与 Context Manifest 继续以 DSH Session Log 为权威。PR11 只保存来源 ChangeSet 与来源 Session 身份作为 lineage 指针，不把 Session Log 复制进 SQLite。

## 用户体验

章节头部对屏幕上的精确 Revision 提供“标记为定稿”。完成后工作台明确显示三种结果之一：没有可学习的 Agent Diff、产生待确认候选，或定稿已经保留但后续分析失败。偏好抽屉展示推断指导与精确证据。“采纳到本书风格”通过 ChangeSet 应用；“拒绝”保留拒绝决策以供审计。

历史 Revision 仍然只读，但作者可以有意把它标为定稿。Revision 选择器显示定稿状态。保存、应用 ChangeSet、审查和 NOAI 扫描都不会自动定稿。

## 边界

- 模型回复不能自动修改 `book.style-profile`。
- PR11 不做偏好 RAG、模型训练、候选排序、Story State、人物认知或 Scene Contract。
- 不增加人物、地点、灵感、梗或范本库资产类型。
- 偏好提取只是绑定精确 Revision 的建议，不是质量分数。
- 现有文件/SQLite 权威边界、SelectionRef、ChangeSet 授权与崩溃恢复规则不变。

## 后果

- 满足条件的定稿增加一次有边界的 one-shot Subagent 请求；没有此前 Agent 草稿的定稿不增加模型请求。
- 已采纳指导会成为普通作者 `book.style-profile` 文本，并带有 ChangeSet 与 Revision lineage。它可以继续通过现有机制编辑、审阅或回退，而不会变成隐藏 Prompt 状态。
- 精确风格 Revision 绑定会有意把并发风格编辑转成冲突。作者必须审阅或重新提取，不会丢失更新的指导。
- 项目不增加人物、地点、灵感或偏好 Asset 类型。这些概念继续使用自由字符串，直到真实语义操作证明需要更强结构。

## 考虑过的替代方案

- **从每次保存学习**：拒绝，因为中间保存、被拒输出和误编辑都不代表作者认可。
- **允许 Agent 把自己的 Revision 标成定稿**：拒绝，因为这会把生成权和批准权合并。
- **把推断指导直接写进本书风格**：拒绝，因为一次模型推断必须保持可审阅、可逆。
- **现在就建立通用偏好或知识 Asset 图**：拒绝，因为 PR11 只需要有界证据与可见“本书风格”目标；在用户工作流证明必要性之前增加类型只会过早施加结构。

## 验证

测试覆盖 Schema v4 到 v5 迁移、幂等定稿、精确父链来源发现、无候选情况、候选持久化与校验、风格 Revision 陈旧冲突、显式拒绝、严格 Subagent 输出、Remote 响应边界，以及章节头部与抽屉交互。`novel-studio` Profile 仍与默认 Web 模式隔离。
