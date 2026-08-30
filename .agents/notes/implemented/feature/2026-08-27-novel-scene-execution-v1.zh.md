# Agent Note：小说场景执行与原生决策

状态：已实现

[English](2026-08-27-novel-scene-execution-v1.md) | 中文

## 问题

Novel Studio 已经能够编译精确章节上下文、加载写作 Skill、创建章节并提出绑定 Revision 的 ChangeSet。普通场景适合直接走“章纲 -> 正文”，但关键对抗、揭秘、情绪转折与章末钩子往往存在数条真正不同的戏剧行动。在比较这些行动前就直接写正文，会把 token 花在错误的不确定层级，并可能产出句子自然却没有场景变化的内容。

Generation Lineage 还需要区分直接写作与经过 Agent 或作者决策后的正文。让模型自己填写策略名、方案总数和选中序号并不是可靠证据：模型可能填错、虚构，或在没有真实选择时复用这些坐标。

## 决策

`chapter-execution` 与 `scene-drive` 会从自由章纲、已确认 Story State、本书风格和必要前文中提炼一份短小的请求局部执行草案。草案包含场景职责与 POV、起点状态、必须发生的变化、信息边界、预期读者感受、结尾推进力，以及需要避开的近章重复。它不是新 Asset，不是要求作者填写的表单，也不是另一个永久上下文项。

目标清楚的普通场景直接执行。章节开头、核心对抗、揭秘、重大情绪转折、回收、章末钩子、用户明确要求替代方案的场景，以及真正存在高不确定性的场景，可以向 `novel_choose_scene_action` 提交恰好两到三个短戏剧行动。方案必须在人物行动、阻力与结果变化上不同，而不能只是换措辞。决策后默认仍只生成一份正文。

选择留在 DSH Agent Loop 内。作者选择会调用现有 `ctx.userQuestions` 能力，因此普通 Composer 接管区会展示方案、暂停根 Agent 的工具调用、记录回答，再恢复工具。Agent 自选使用同一个 Novel 工具，但不等待人类。被委派的 Subagent 可以报告备选方案，却不能询问作者，也不能把自己的决策 call 借给父 Agent。“其他”自由反馈表示要求 Agent 重拟方案，不等于批准某一项。

成功的选择工具调用与结果都是耐久 Session 事件。后续 `novel_create` 或 `novel_propose_changes` 只通过 `scene_decision_call_id` 引用选择 call id，不再提交策略、方案数或选中序号。Host 只接受属于当前 Session turn、当前 chapter-write Context Manifest、当前写作 Skill、Novel Project 和精确目标 Asset Revision 的成功结果。绑定已有 Revision 的选择不能授权创建新 Asset，面向新 Asset 的选择也不能授权修改已有 Asset。

Host 从耐久工具结果 metadata 推导 `action-options-user-selected` 或 `action-options-agent-selected`、有边界的方案总数与一基选中序号。`NovelGenerationLineage` 会把这些坐标和决策 call id 与已有 Session、模型路由、Preset、Skill、Context Manifest 及策略来源一同保留。方案正文只留在 Session 事件中，不复制进 Revision 或上下文 Manifest。直接写作不带决策 id，并保留 `direct` 策略。

历史 Schema 版本八通过可空 `generation_json` 列保存 Lineage。提议的 ChangeSet 会保存 Lineage，应用后的 `agent-apply` Revision 继承它。原有历史继续兼容：Repository 校验仍会读取不带决策 id 的旧 PR15 非直接记录，而 PR17 Novel 工具不会再创建缺少该字段的新非直接记录。

## 范围边界

- 不存在 Scene 数据库、永久 Scene Contract Asset、第二套上下文存储或小说专用交互状态机。
- 不存在默认多份完整正文、候选管理器、文学总分、结构化 Review Issue 生命周期或 A/B 偏好引擎。
- 方案正文不会进入普通 Novel 上下文，只有选中决策坐标进入 Lineage。
- 模型仍只能通过现有类型化创建或 ChangeSet 审阅流程发布作者内容修改。

## 验证

- 工具测试覆盖原生作者选择、Agent 选择、自由文本重拟反馈、伪造 call id 和绑定目标的决策复用。
- Repository 测试覆盖通过校验的决策 Lineage 在提案、应用、Revision 列表和历史迁移中的保留。
- 真实 Loader 装配会从 `cordis.yml` 启动 `userQuestions`、通用工具运行时与 `tool-novel`，证明产品组合可以解析打包后的场景决策 Schema，而不只是单元测试 Context 可用。
- Bundle 测试会解析两份版本二的包内写作 Skill，并固定其对原生选择工具和决策 call id 的使用。
- 聚焦 TypeScript 与 Vitest 检查覆盖这条链路。浏览器自动化不在本次变更范围内；产品手动验收使用既有的通用问题 UI。

## Alternatives considered

**所有场景都直接生成正文。** 这条路径仍是普通场景的快速路径，但若把它用于全部场景，就会在替代方案最有价值的位置把戏剧行动、阻力、信息释放与状态变化留作隐含推断。

**让模型在最终落稿时提交策略和选择坐标。** 这种方式更简单，却无法证明作者看过某个方案，也无法证明发生过真实比较。耐久 DSH 工具事件提供了 Host 可验证的证据。

**把每份执行草案或方案集都持久化为 Novel Asset。** 在临时执行形态证明稳定前，永久 Scene Contract 会增加作者可见结构与上下文增长。

**构建小说专用选择抽屉和状态存储。** 第二套交互系统会重复 DSH 的取消、恢复、Session 所有权与回放语义，而 `ctx.userQuestions` 已经拥有这项能力。

**默认生成多份完整正文候选。** 完整替代稿会消耗更多 token 并增加审阅负担；短行动选择把探索集中在真正改变场景的决策上。

## 后果

关键场景获得了明确的行动决策，但普通写作不会变慢，作者也不会被迫使用僵硬大纲格式。作者通过熟悉的 DSH 交互完成选择，选择会进入 Session 回放，并安全绑定到它实际授权的精确写入。Lineage 保持小型且不随正文长度增长，未来偏好分析可以从已验证坐标区分作者选择、Agent 选择和直接结果。这套系统并不保证被选中的行动一定写出更好的正文；最终判断仍属于作者和后续质量工作。
