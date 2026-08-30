# @deepseek-ai/dsh-experimental-tool-novel

[English](README.md) | 中文

## 用途

这个实验性 Consumer 为 Novel Agent 提供类型化发现/创建、精确读取和仅提案修改工具，而不向正式 Novel Asset 开放通用文件写入。

## 行为

- `novel_initialize_project` 接收作者可见书名。已有合法 Novel Project 会原样返回；项目不存在时，必须先获得用户显式批准，Repository 才会创建默认内容根并发布 `novel.yaml`。非法或已存在的清单绝不会被覆盖。
- `novel_list` 在所属 Session 工作目录发现 Novel Project，并返回带有语义父级 id、规范精确 Revision `dsh-novel:` 引用和各注册类型创建契约的当前类型化 Asset 目录。它只暴露身份和元数据，不返回作者内容。
- `novel_search` 接收标题/内容线索、可选精确类型白名单和有边界的结果数量。它返回当前精确 Revision 引用与摘要；仅发现不会注入或修改 Asset。
- `novel_create` 接收一个已注册类型、标题、可选语义父级和类型拥有的 JSON 内容。新的 `manuscript.chapter` 会在同一次调用中携带完整正文，并且没有语义父级。Repository 生成稳定 id 与安全路径、校验层级规则、发布新作者文件，并返回精确首个 Revision。创建结果携带可回放的 `novel-asset-created` 展示元数据。
- `novel_get` 接收规范引用，只读取已保留 Revision，并返回 Asset 类型、该类型注册的提案说明和精确模型投影。
- `novel_get_analysis` 接收已保留章节的精确 Revision 引用，并读取其持久化 `chapter-review` 和/或 `noai-scan` 报告。报告仍是绑定 Revision 的派生记录：既不属于 `novel_list` / `novel_search` 的作者 Asset，也不是隐藏 Prompt 上下文。
- `novel_choose_scene_action` 是关键或真实高不确定场景的有界门槛，不是普通写作的必经前奏。它只接收两到三个短小且不同的戏剧行动。`user` 模式复用现有 `ctx.userQuestions` 界面询问作者，`agent` 模式记录 Agent 的比较结果。同一 Session 中最近仍有效的 `chapter-execution` 或 `scene-drive` Skill 可以跨 turn 复用。对于已有章节目标，Host 会根据传入的精确 Asset Revision 刷新 `chapter-write` Context Manifest，并在工具结果后延迟注入这份模型可见 Frame。两条成功路径都会生成可回放的 metadata，并绑定该写作 Skill、刷新后的 Manifest、Project 和精确目标 Revision。
- `novel_propose_changes` 接收一个精确 Asset、基础 Revision、类型定义的 operation 信封和摘要。已注册 Host 定义会校验并补全这些操作，再由 Repository 持久创建单资产 `ChangeSet`；绝不应用提案。
- 最终 `novel_create` 或 `novel_propose_changes` 可以引用同 turn 的成功场景决策 call。Host 会拒绝伪造、失败、过期、跨 Session、跨 Project 或目标不匹配的 id，并从耐久 Session 事件派生方案总数、选中序号和用户/Agent 选择归属，不信任模型自报坐标。Revision Lineage 只保留小型 call id 与坐标；方案正文留在 Session 工具调用里。
- 章节提案持久化后，Novel 分析服务会在内存中物化其候选并运行确定性 NOAI 规则。达到阈值的问题会作为有边界的 deferred model context 返回，因此 Agent 必须在回复前承认可能的模板化语言热点；该反馈随 turn 写入日志，绝不创建或应用第二份提案。
- `novel_present` 只接收 `open-workbench` 或 `close-workbench`。它通过可回放的 `novel-presentation` metadata 改变浏览器展示，绝不读取、创建或修改 Asset。
- 提案结果携带可 JSON 序列化的 `novel-change-set` 展示元数据，因此浏览器可以从 Session 回放恢复审阅卡片。
- 本包加入一段简短 system prompt，说明 Revision 权威和仅提案语义。它不注册 shell、SQL、通用读取或通用写入工具。
- Asset 与分析工具都要求所属 Agent Session，并遵守该 Session 工作目录、已解析 sandbox policy 与绑定 Novel Project 规则。`novel_present` 是通过同一小说 preset 提供的纯展示动作。

## 模型体验

### 小说资产工具

#### 模型看到什么

模型看到 `novel_initialize_project`、`novel_list`、`novel_search`、`novel_create`、`novel_get`、`novel_get_analysis`、`novel_choose_scene_action`、`novel_propose_changes` 与 `novel_present` Schema，以及简洁的小说工作台工具说明。工具结果会区分初始化、发现、持久创建、精确 Asset/报告读取、原生场景决策、仅提案修改与纯展示 Frame 动作；提案绝不声称已有文件已经改变。高风险章节候选会在工具结果之后加入一条简短、写入日志的 NOAI 通知。

#### Token 影响

固定工具说明和九个 Schema 带来稳定的 prompt 开销。初始化只返回紧凑项目身份与状态字段；`novel_list` 返回紧凑目录元数据与创建说明，`novel_search` 返回有边界摘要，精确 Asset/报告读取只在显式调用后返回内容；场景方案只会在关键场景门槛触发时发送，而且不会被复制进 Revision 历史。当前 turn 只有坐标或旧任务 Frame 时，选择工具只新增一份刚编译的精确章节写作 Frame，不会重复注入 Skill 正文；创建/提案/展示结果只包含紧凑 id 或状态字段。只有达到阈值的章节提示会额外加入最多五条确定性问题。

#### KV Cache 影响

使用 Novel Workbench Preset 的每个 Session 都拥有稳定工具目录，因此切换页面或选区不会改变 system prefix 中的工具 Schema。

## 已知限制与延期工作

- **仅词法发现** — `novel_search` 提供有边界的标题/模型文本匹配；语义检索、relations、Asset 导航/聚焦与 delegation 工具尚未实现。`novel_present` 目前只控制整个 Frame。
- **一个标题与一个精确文本操作**：内置文本 Asset 可以在同一提案中把 `update-title` 与一个正文操作组合。正文使用 `insert-text` 或 `replace-text`，因此已有空章节无需占位符即可原子命名并写入。自由策划与书本指导类型使用 `replace-text`；多范围和多资产 ChangeSet 尚未实现。
- **没有应用权威** — 只有浏览器 Remote 可以接受或拒绝提案；模型不能提交修改。
- **没有自动检索注入** — 检索结果不会偷偷进入模型上下文；Agent 必须选择精确结果并用 `novel_get` 读取。
- **没有独立 Scene 对象或工作流运行时** — 场景行动门槛只是所属 Session 中的一次 DSH 原生工具交互。Subagent 可以报告候选行动，但作者问题、最终选择和修改提案必须由父 Session 拥有。
