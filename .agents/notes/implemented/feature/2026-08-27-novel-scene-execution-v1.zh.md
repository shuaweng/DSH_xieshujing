# Agent Note：小说场景执行 V1 与有边界生成 Lineage

状态：已实现

[English](2026-08-27-novel-scene-execution-v1.md) | 中文

## 问题

Novel Studio 已经可以编译精确章节上下文、加载写作 Skill、创建章节，并提出绑定 Revision 的 ChangeSet。但写作路径仍大体是“章纲 -> 正文”，因此结构上合法的结果仍可能缺少真正的戏剧行动：谁尝试了什么、阻力如何回应、信息如何释放，以及场景结束时究竟改变了什么。

保留的 Revision 也没有说明某个 Agent 提案来自哪个模型路由、Preset、写作 Skill、冻结 Context Manifest 或生成策略。后续偏好与质量工作若想区分直接落稿和比较过数条场景行动后的落稿，只能重新分析整条 Session trajectory。

## 决策

`chapter-execution` 与 `scene-drive` 现在会从自由章纲、已确认 Story State、本书风格和必要前文中提炼一份短小的请求局部执行草案。草案包含场景职责与 POV、起点状态、必须发生的变化、信息边界、预期读者感受、结尾推进力，以及需要避开的近章重复。它不是新 Asset，不是要求作者填写的表单，也不是另一个永久上下文项。

目标清楚的普通场景直接执行。章节开头、核心对抗、揭秘、重大情绪转折、回收、章末钩子、用户明确要求替代方案的场景，以及真正存在多条高价值路径的场景，可以先给出两到三个短行动方案。方案必须在人物行动和戏剧回应上不同，而不能只是换措辞。作者可以选择一项，也可以授权 Agent 根据人物逻辑、连续性、信息边界、重复度、张力与后续空间进行比较并选择。选定后默认仍只生成一个正文候选，并且只能通过现有类型化创建或 ChangeSet 审阅流程发布。

两个写作 Skill 会向 `novel_create` 和 `novel_propose_changes` 说明采用了哪种有边界策略：直接执行、Agent 选择行动方案或用户选择行动方案；采用方案时还会记录二到三个方案总数及一基选中序号。其余来源由 Host 从持久 Session 状态推导，而不信任模型自行填写 provenance：

- Agent Session 与最新 turn；
- 生效的 provider/model 请求头；
- 已选择 Agent Preset；
- 最近成功加载的 Skill 及其包内版本；
- 当前冻结 Novel Context Manifest id 与策略名称。

该 `NovelGenerationLineage` 会随提议的 ChangeSet 保存，并由最终 `agent-apply` Revision 继承。历史 Schema 版本八新增可空 `generation_json` 列，并让版本一至七原地迁移。记录有意排除 Prompt、行动方案正文、生成正文、审查与质量分数。

所有包内 Novel Skill 现在都会把 `novelContextPolicy` 放入标准 Skill `metadata`。这修复了文件系统 Skill 注册表对策略的发现；只有 `chapter-execution` 与 `scene-drive` 新增 PR15 Skill 版本。

## 范围边界

- 没有新增结构化 Review Issue 类型、生命周期、修复 API 或 Issue 中心 UI。
- 没有新增文学总分、质量指标、评测集、A/B 候选 UI 或浏览器流程。
- 没有新增持久 Scene Contract Asset。执行草案保持临时，未来可以迁到类型化编译器接缝后，而不改变现有 Asset 或 V3 Context Manifest 回放。
- 多个完整正文候选仍是显式 opt-in；Scene Execution V1 把替代方案用在短行动决策上，并默认只产生一份作者结果。

## 验证

- Repository 测试覆盖一份通过校验的 Lineage 在提案、应用、Revision 列表和 Schema 八迁移中的保留。
- Novel 工具测试证明 provider/model、Preset、Skill 版本、Context Manifest 和行动方案坐标由 Host 推导并校验，同时拒绝不完整的方案坐标。
- Bundle 测试解析所有包内 Skill frontmatter，确认每个上下文策略都通过标准 metadata 暴露，并确认两个场景写作 Skill 的版本为一。
- 定向 TypeScript 构建与 Repository、工具、bundle 的聚焦测试通过。本 PR 按约定不运行浏览器自动化，产品验收交由手工步骤完成。

## Alternatives considered

**直接从章纲生成正文。** 这条路径最短，却会在最影响场景质量的位置把戏剧行动、阻力、信息释放与状态变化留作隐含推断。

**把每份执行草案都持久化成新 Asset。** 在临时执行形态证明稳定前，永久 Scene Contract 会增加作者可见结构与上下文增长。

**默认生成多份完整正文候选。** 完整替代稿会消耗更多 token 并增加审阅负担；短行动方案把探索集中在真正改变场景的决策上。

## 后果

场景执行变得更有意识，但不会强迫作者使用僵硬大纲格式，也不会增加持久上下文负担。Lineage 足以让未来比较 Skill 和上下文策略，同时保持小型且不随正文长度增长。它本身不判断哪种策略写得更好；偏好学习与未来评测只能在产品积累真实作者选择后使用这些来源坐标。
