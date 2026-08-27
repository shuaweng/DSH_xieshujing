# Agent Note：小说故事状态与经审阅的 Story Delta

Status: implemented

[English](2026-08-27-novel-story-state-and-delta.md) | 中文

## 问题

小说工作台已经具备可见的本书概述、本书风格、大纲、章纲、正文 Revision、审查报告与显式作者定稿。它们分别描述意图、约束、草稿和批评，但目前没有一份持久权威记录“已经定稿的正文究竟让故事真实发生了什么”。长篇正文逐渐偏离旧大纲后，后续写作仍可能遗忘已经确认的事件、使用过期人物状态、重复已解决的悬念，或把未来计划误当成已经发生的事实。

如果每次都注入此前全部章节来重建状态，成本高、结果不可稳定重放，也会破坏 PR12 建立的任务态上下文预算。现在就新增人物、地点、物品、时间线和认知图谱等多类 Asset，则会在作者工作流尚未证明需要时过早固定结构。

## 决策

实现新增了项目级单例、作者可见、自由 Markdown 资产 `book.story-state`。它记录定稿正文已经确认的当前故事现实：时间顺序、人物状态和位置、关系与认知、物品状态、已确认事实、活动剧情线、未解决承诺，以及作者认为有用的其他内容。这些只是可选写作惯例，不是必填字段；Repository 只约束身份、单例基数、Revision 与修改协议，不约束 Markdown 的内部写法。

用户把某个精确 `manuscript.chapter` Revision 标记为定稿后，系统启动固定的一次性 Story Delta worker。worker 只通过 Novel Context Compiler 接收精确定稿章节与精确当前故事状态，加载随产品打包的 `story-state-extraction` Skill，并返回严格、受限的完整故事状态替换稿、摘要，以及来自该章节的短证据引用。

结果是持久化 `StoryStateCandidate`，不是自动 Canon 修改。它绑定精确定稿章节 Revision 与精确目标 Story State Revision，记录提取器和 worker 血缘，在作者接受或拒绝前保持 `pending`。接受时创建并应用普通的、绑定精确 base Revision 的 ChangeSet；故事状态已更新时进入冲突，绝不覆盖新内容。拒绝只保留决策，不修改 Asset。对同一章 Revision 重复定稿会复用已有候选。

偏好学习和 Story Delta 提取是相互独立的定稿产物。即使章节完全由作者撰写、没有可学习的 Agent 初稿与作者 Diff，Story Delta 仍可执行。如果故事状态单例不存在，定稿仍然成功，工作台显示明确创建入口，不生成隐藏状态。

Context Compiler 只在章节写作、选区改写和章节审查等任务策略中加入最新已确认的 `book.story-state` 正文。普通对话、大纲任务和偏好学习只保留坐标或不自动加入故事状态正文，因此不会让所有对话都变成不断膨胀的全书 Prompt。每个 Manifest 继续记录实际包含的精确 Revision 与预算决策。

不新增模型工具。现有 `novel_create`、`novel_get`、`novel_search` 与 `novel_propose_changes` 通过 Asset Type Registry 理解新资产。候选接受与拒绝仍是仅面向作者的 Remote 操作。

## 权威与恢复

- `book.story-state` 的作者文件是当前已确认故事状态的权威。
- 不可变 Revision、定稿、Story State 候选、ChangeSet、apply journal 和决策保存在 `.novel/history.sqlite` schema version six 的持久 sidecar 中。
- DSH Session Log 继续是 Prompt、Skill 加载、Context Manifest、Subagent 轨迹和工具调用的权威。候选行只保存血缘标识，不复制对话正文。
- 发布故事状态修改沿用现有 ChangeSet apply 与崩溃恢复协议。只有 apply 达到 applied 结果并记录结果 ChangeSet、Revision 后，候选才变成 `accepted`。
- 定稿之后即使 worker 或候选持久化失败，也不回滚用户的显式定稿。UI 分别呈现“定稿已保留”和“派生产物缺失/失败”。

## 已考虑的替代方案

**定稿后自动修改 Story State。** 拒绝，因为提取属于语义推断，模型不能把自己的解释静默升级为 Canon。

**每次请求从全部正文动态推导状态。** 拒绝，因为成本高、面对变化正文不可稳定重放，也会破坏确定性上下文预算。

**现在就建立结构化人物、地点、物品、时间线、认知和承诺类型。** 拒绝，因为当前用户工作流偏好自由字符串。经审阅的单例能先证明状态生命周期，同时避免过早固定本体；未来仍可从同一作者状态迁移或投影出类型化视图。

**只把 Story Delta 保存为审查报告。** 拒绝，因为报告只诊断一个 Revision，而后续 Agent 需要一份可见、可编辑、版本化的当前真相源。

**每轮都完整注入 Story State。** 拒绝，因为普通提问和策划任务并不总需要它。任务策略与 Manifest 预算才是合适的包含边界。

## 验证

- 工作台和 `novel_create` 最多创建一个自由 Markdown `book.story-state`；Agent 能通过现有 Novel 工具列出、搜索、读取并对它提交绑定 Revision 的修改提案。
- 只要单例存在，定稿任何章节 Revision 都至多生成一份持久、精确绑定 Revision 的 Story State 候选，且不依赖偏好学习是否满足条件。
- 打包的提取 Skill 与固定一次性 worker 返回经校验、受限的完整替换稿、摘要和证据；畸形输出绝不修改 Asset。
- 作者可以检查、接受或拒绝候选。接受沿用 ChangeSet/apply 协议，base Revision 过期时安全冲突。
- 章节写作、选区改写、选区审查和章节审查的 Context Manifest 在显式预算内包含精确的已接受 Story State Revision；普通对话不自动注入其正文。
- schema-v5-to-v6 迁移、候选生命周期、幂等性、上下文预算、Remote 边界、工作台创建/审阅，以及真实 keyless Novel Studio composition 都有测试和快照验证。
- 默认 `web` 和 `headless` Profile 继续与 Novel Studio 隔离。

## 后果

提取器可能漏掉事实、过度解读暗示，或保留已经过期的描述。强制作者审阅、短证据、精确 Revision 绑定和普通 ChangeSet 冲突处理共同限制该风险。自由 Markdown 的直接查询能力弱于知识图谱，但它保留了作者自由，也为以后增加类型化投影、结构化 Issue 链接或题材专属状态分区保留了演进空间，无需重写存储层。
