# Agent Note：任务感知的小说 Context Compiler

状态：已实现

[English](2026-08-26-novel-context-compiler.md) | 中文

## 问题

小说工作台已经能记录显式选区和可见的跟随/固定工作集，但每个直接 Turn 都仍采用同一种浅层处理。写正文、改大纲、风格改写、章节审查与定稿学习需要的材料不同。让每个 Skill 都用 `novel_list`、`novel_get` 重新发现资产，会重复且不一致；若把本书概述、本书风格、所有大纲与固定资产塞进每一轮，又会造成隐藏的上下文膨胀。

第一版工作集还为 `follow` 保存精确 Revision。受控保存后，只要浏览器漏掉一次更新或刷新恢复到旧状态，就可能继续保留旧 Revision；但“跟随当前视图”表达的是活动 Asset 身份，并不是历史版本固定。

## 决策

增加 Host 所有的 `NovelContextResolver.compile()` 边界。调用方必须给出闭集任务策略和精确目标；编译器永远不从自然语言猜测策略。第一版策略为 `direct-turn`、`chapter-write`、`selection-rewrite`、`selection-review`、`outline-edit`、`chapter-review` 与 `preference-learning`。

每个策略只扩展类型化 Asset 已表达的确定关系。章节写作和审查可以物化精确目标章节、对应章纲、本书概述与本书风格，并只把全书大纲保留为坐标；选区任务物化选区与本书风格，把概述保留为坐标；书纲/卷纲任务可物化父级和概述，把子级保留为坐标；章纲任务可物化书纲和概述，把对应正文父级保留为坐标；偏好学习只使用显式提供的草稿、定稿与风格 Revision。项目级资产不会成为常驻 Prompt。

编译器会合并完全相同的精确坐标，同时保留不同选区。必需任务材料先于可选上下文；同一 Asset/Revision 已有必需选区或投影时，较低优先级的可选副本不能把它扩成更宽材料。编译器还限制最终引用数量和 UTF-8 作者文本预算。必需材料放不下时失败关闭；可选材料放不下时降级成规范坐标，而不是截断或静默消失。结果是一份第三版 Context Manifest，记录策略、精确 Revision、类型、投影、原因、内容哈希、模型文本字节数与模型文本哈希。精确渲染帧以模型可见文本进入接收 Session，因此重放时不会重新读取可变 head。

小说 Skill 在普通 metadata 中声明一个 `novelContextPolicy`。显式 `/skill-name` Turn 会立即按该策略编译；当模型通过标准 `skill` 工具加载 Skill 时，下一 Step 会编译该策略的关联材料。第一 Step 已经物化的正文或选区只保留坐标，不会重复复制。固定章节审查与定稿学习 Subagent 也改用同一编译器，不再维护各自的上下文拼装规则。

工作集升级为第二版。`follow` 只保存项目、Asset 身份与标签；Host 在编译 Prompt 时解析当前 head。`pinned` 仍保存精确 Revision 和可选 selector。已有第一版事件继续可读，并在下次替换时规范化为第二版。本决策取代 [小说上下文工作集与有界 Asset 搜索](2026-08-24-novel-context-workset-and-search.zh.md) 中 follow 保存 Revision 的决定；显式引用与固定引用仍和以前一样精确冻结。

## 边界

- 编译器选择已有作者资产；它不创建 Story State、不从正文提取事实、不总结可变 head、不做 embedding 排名，也不判断用户意图。
- UI focus 仍是协调状态。follow 在 Prompt 编译前是动态指针；每份编译后的 Manifest 都不可变。
- Skill metadata 只选择策略，不能扩大 Repository、Tool、Subagent 或 sandbox 权限。
- 上下文预算通过投影和原因字段可观察。坐标仍可供后续显式 `novel_get` 读取。
- 审查与偏好 worker 在自己的子 Session Prompt 中接收编译器精确文本；浏览器状态本身不会被继承。

## 考虑过的替代方案

**始终注入本书概述和风格。** 这会在无关问题上浪费 token，也更难解释一次结果为什么使用某条规则。

**让每个 Skill 自己调用发现工具。** 工具读取仍适合探索小说，但让每个固定流程重新发现同一批确定关系，会复制策略并产生不一致的重放记录。

**自动分类用户自然语言任务。** 第一版编译器刻意不引入隐藏意图模型。显式 Skill 选择和固定流程入口才是稳定、可测试的策略选择器。

**为每章预计算一份永久上下文包。** 这种包会过期并复制作者真相。编译器改为在任务边界解析 current head，再冻结精确结果。

## 结果

普通直接 Turn 保持轻量：显式选区会物化，follow 与 pinned 工作集项只给坐标。加载或显式调用小说 Skill 时，只增加该任务声明的关联材料。章节审查和偏好学习与根 Agent 共用同一套选择、去重、预算、哈希与重放契约。

编译器仍保留可替换空间。未来可以在相同的显式请求与 V3 Manifest 接缝后增加 Story State、摘要、检索评分、按模型 token 预算或更多 Asset 策略，而无需改变工作台引用，也不会引入未记录的模型上下文。

## 测试

聚焦测试覆盖旧工作集迁移、新 Revision 后的 live follow 解析、策略扩展、精确去重、确定性 Manifest 身份、可选材料降级为坐标、必需材料预算失败、显式 Skill 策略选择、模型加载 Skill 后不重复正文、固定审查/定稿流程使用编译器、Remote V2 合约、Context Tray 行为与 Novel Studio Skill metadata。
