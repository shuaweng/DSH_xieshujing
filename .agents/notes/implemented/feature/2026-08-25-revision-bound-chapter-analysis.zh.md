# Agent Note：绑定 Revision 的章节分析

Status: implemented

[English](2026-08-25-revision-bound-chapter-analysis.md) | 中文

## 问题

小说工作台已经能编辑章节并创建修改提案，但还不能持久回答两个问题：一次分析针对的是哪一个精确正文 Revision，以及同一份正文再次分析时，新报告是否替代旧报告。只存在对话历史里的审稿结论会在作者继续修改章节后迅速失去语义。现有 Novel preset 虽然带有确定性的文风扫描器，作者与提案工具也还不能把结果复用为类型化、绑定 Revision 的产品界面。

工作台目前也只展示当前文件头。没有保留版本导航，审稿报告与多次改稿无法形成连贯历史；但若允许直接编辑旧快照，又会绕开当前 base guard，把历史浏览偷偷变成分支操作。

## 决策

在不可变 `asset_revisions` 旁增加绑定 Revision 的派生分析域：

- `analysis_reports` 是生成式分析结果的权威来源，但永远不是作者正文的权威来源；
- 每行由 `(project_id, asset_id, revision_id, report_kind)` 唯一标识，并引用一个已保留 Revision；
- 首批报告类型为 `chapter-review` 与 `noai-scan`；
- 对同一键成功重跑时原子替换旧报告，失败或取消则保留旧报告不变；
- 报告记录分析器版本、生成时间；由 Subagent 生成时还记录来源 Session 与工作 Session；
- 删除派生报告库不会修改 Markdown，但它不同于可重建搜索索引，系统不会静默重建，因为审稿可能具有模型成本和历史价值。

通过 `NovelRepository` 暴露保留 Revision 摘要与精确报告。读取旧 Revision 始终精确且不可变。工作台可以在章节顶部选择旧版本、引用、扫描和审稿，但标题与正文保存控件必须禁用，直到用户回到当前头版本。本次不包含从旧版本分支或恢复。

新增 `novelAnalysis` Host service。确定性的 NOAI 扫描器接收精确章节模型文本，输出有界 JSON 结果，包括来源偏移、类别、严重性、证据与修改方向。用户点击章节底栏 `NOAI` 时，工作台先保存当前脏内容，再对产生的精确 Revision 扫描并 upsert 报告，全程不调用模型。

章节审稿启动一个固定、一次性的 Subagent，并要求严格结构化输出。协调器冻结请求的章节 Revision，并在可用时提供精确章纲、全书概述、本书风格与固定 Novel 引用。工作 Agent 只读，不拥有写入或 ChangeSet 工具，并被要求使用内置 `chapter-review` Skill。只有合法完成结果才会规范化并 upsert；输出非法、中断或取消时不持久化。报告抽屉只展示当前屏幕 Revision 对应的报告，绝不把“最新报告”含糊地套到旧版本上。

`novel_propose_changes` 校验并物化 `manuscript.chapter` 候选结果后，向 `novelAnalysis` 请求确定性候选扫描。重要发现通过工具执行的 deferred model context 附加，因此只有提案成功后才进入 Session Log，并对提出修改的 Agent 可见。ChangeSet 候选并不是 Asset Revision，所以候选扫描不持久化。该反馈只作建议：不能拒绝、修改或自动应用提案。

章节底栏在现有章纲按钮旁增加审稿与 NOAI 操作，并共同使用绑定 Revision 的分析抽屉。非章节资产继续拥有全局皮肤与字体控件，但不展示章节分析操作。

## 考虑过的替代方案

**只把审稿留在 Session Log。** Session 可以保存执行来源，却无法跨 Session 为每个精确章节 Revision 提供唯一当前报告。

**把报告写进 Markdown Frontmatter。** 生成式结果会制造大量无意义作者文件 diff，并混淆派生信息和内容真相源。

**用模型检查 AI 味。** 现有检查是确定性的，应保持快速、可复现且没有模型成本。未来可用独立报告类型补充语义审校。

**允许直接编辑旧 Revision。** 这会把分支或恢复决策藏进普通保存，并破坏乐观并发约束。因此历史版本只读。

**发现 AI 味时直接拒绝提案。** 文风启发式规则可能误报。Agent 应看见并推理这些提醒，但提案仍应供用户审阅。

## 测试

- History schema 单调迁移，并建立严格绑定 Revision 的报告存储，不修改作者文件。
- Revision 摘要按最新优先稳定排序，重启后仍能打开精确旧版本。
- 同一章节 Revision 每种报告至多保留一份成功结果；成功重跑替换，失败重跑保留。
- NOAI 扫描确定、结果有界、无需模型；样本不足时明确报告，不伪装为“干净”。
- 章节审稿使用固定只读一次性 Subagent、内置 Skill、冻结上下文、严格结构化输出，并持久记录来源/工作 Session。
- 审稿与 NOAI 按钮分析工作台当前展示的精确 Revision；当前内容脏时先保存再分析。
- 历史版本的正文与标题只读；回到当前头后恢复正常编辑。
- `novel_propose_changes` 对重要候选发现追加已记录的 deferred warning，但不改变 ChangeSet 的持久化与应用权限。
- 非 Novel Profile 不变；小说工作台继续只通过既有 `novel-workbench` preset gate 激活。
- repository、迁移、扫描器、协调器、工具、remote、client、composition、type、lint、docs 与 keyless browser 的聚焦检查通过。

## 后果

作者现在可以把正文、分析结果与来源当作一条精确绑定 Revision 的历史来检查，同时确定性的 NOAI 扫描仍然快速且不调用模型。代价是增加一个持久历史表，以及一条固定审稿编排缝；部署必须为它组合兼容的 Subagent provider。

启发式文风检查可能产生噪声，所以证据与严重性保持可检查，并且不能成为自动门禁。模型审稿在多次运行间可能变化；本设计只在同一 Revision、同一报告类型内明确覆盖，并展示分析器版本。历史 Revision 可视化提高了保留历史的重要性，损坏或缺失时失败关闭，不能回退读取当前文件。第一版没有每个 Revision 的命名报告档案，也没有正文分支；这些需要独立产品决策。
