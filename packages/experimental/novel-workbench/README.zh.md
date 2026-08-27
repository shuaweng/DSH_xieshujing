# @deepseek-ai/dsh-experimental-novel-workbench

[English](README.md) | 中文

## 用途

这个实验性 Client Consumer 向原生 DSH 外壳贡献 Agent 原生 Novel Studio 界面：在一个按 preset 限定的工作台中组合类型化作者 Asset、由注册表驱动的画布、紧凑而精确的 Agent 引用、对话和可审阅 ChangeSet。

## 行为

- 原生 `ui-layout` 始终是唯一根和布局服务的拥有者。本包只向其按 selector 路由的 `shell.workbench` chain 贡献纯 `novel` surface，并仅在该 surface 被选中时声明 `novel.explorer` 与 `novel.canvas`。它既不跨插件导入 React 组件，也不注册竞争根。
- 整个工作台按 Preset 限定。只有精确选择 `novel-workbench` 时，才会在 `conversation.input.left`、原生 access/plan 控件旁得到纯图标“小说工作台”开关；其无障碍名称与悬浮提示仍保留完整动作说明。已经开始的 Session 读取已提交摘要，空白 Composer 则读取 Agent preset 选择器所用的同一份只读暂存值。Session 仍从普通 DSH Frame 开始；作者无需切换 preset 或修改作者数据即可展开/收起工作台。切到任何其他 preset 会立即恢复普通 Frame 并移除按钮。
- 桌面组合把 Agent 对话放在左侧，把正文浏览器与创作画布放在右侧，同时在最外侧保留可折叠的原生 DSH Session 侧栏。无障碍拖拽分隔条（也支持方向键）会按动画帧频率预览 CSS track，并在松开时只提交一次经过边界限制的宽度，因此作者工作台不会随每个 pointer 事件重渲染。
- 原生 DSH 侧栏仍然可用，可收起或展开以搜索和导航会话。切换 Session 不会替换已选中的小说 surface；切到不符合条件的 preset 会关闭它。
- 资产浏览器发现当前 Session 的 Novel Project，呈现逻辑“本书”引导分组、稳定的“正文”与“大纲 → 卷纲”分支（包括空分支），可以创建可编辑章节、项目级唯一的本书概述/本书风格和自由大纲/卷纲，打开绑定精确 Revision 的类型化 Asset 文档，并可独立于 DSH Session 侧栏收起。正文章节支持原生拖动排序，先乐观预览，再由 Remote 确认权威顺序，失败时回滚。层级来自语义类型与父级 id，而不是文件路径。
- 当精确 Session 根目录没有 `novel.yaml` 时，资产浏览器与 Context Tray 会进入中性未初始化状态，不发起 Asset 或上下文工作集请求。画布只要求输入书名，通过与 Agent 工具相同的 Remote/Repository 操作完成初始化，然后刷新为普通资产界面；已有但损坏的清单仍会明确报错。
- `ctx.novelAssetRenderers` 拥有 effect 作用域内、按精确类型匹配的编辑器、选区描述、可选阅读展示和 Diff contribution。共享画布拥有版本保护保存、Context Commit Barrier、Agent 引用插入和审阅权威；缺少 renderer 时会明确拒绝，而不是展示误导性的通用编辑器。
- 内置正文 Renderer 通过同一次带 Revision 保护的保存编辑章节名称与正文、捕获简单 UTF-16 范围、统计排除空白后的作者字符，并启用全高居中的纸张画布。跨整个工作台的底栏及六套联动皮肤、字体和字号控件由所有 Asset Renderer 共用；只有正文额外显示本章字数与章纲入口。
- 章节头部会列出带来源与时间戳的不可变 Revision。打开历史 Revision 时仍使用同一个 Renderer 和分析控件，但标题/正文只读；保存绝不会重写历史。
- 仅章节拥有的审稿与 `NOAI` 动作位于底栏。两者都会为当前显示的精确 Revision 打开右侧抽屉。NOAI 会立即运行确定性扫描；打开审稿页本身不会启动模型，只展示已有报告，只有作者明确点击“开始审查”或重跑才启动固定只读审稿人。每种成功报告在每个 Revision 上只保留一份，因此切换历史版本也会切换到对应报告。
- 章节头部可以把屏幕上的精确 Revision 标记为定稿。满足条件的 Agent 草稿/作者定稿比较会打开偏好抽屉并展示前后证据；候选在作者采纳前不会改变任何内容，采纳后通过 ChangeSet 写入精确“本书风格”Revision，拒绝决策同样可审计。
- `@deepseek-ai/dsh-experimental-novel-asset-outline` 独立贡献自由的 `planning.outline` 与 `planning.chapter-outline` Renderer。书本指导和策划 Asset 默认展示渲染后的 Markdown 阅读视图，并可明确切换到不受模板限制、支持精确文本选区与 Diff 的源码编辑。一个 ChangeSet 可以同时预览一次标题变更和一次正文变更。正文底栏把用户提供的章纲图标放在皮肤控件左侧；点击会打开与当前章节一对一绑定的右侧抽屉，作者可自由写作、保存或把章纲选区引用给 Agent。情绪/钩子/节奏/起承转合实用起步模板只是可选按钮，插入后仍是普通可编辑 Markdown。
- Agent 创建的 Asset 会返回可回放创建卡片并刷新权威 Explorer。人类与 Agent 创建都经过同一条类型化 Remote/Repository 链路，任何一方都不能自行发明文件路径。
- 小说 Agent 可以用 `novel_present` 调用 `open-workbench` 或 `close-workbench`。其持久工具结果 metadata 与 Composer 开关驱动同一个浏览器本地 `ctx.layout` 选择；普通 Agent 回复文字绝不控制布局，展示动作也绝不修改 Asset。
- “引用选区到 Agent”先保存脏的类型化草稿，保存失败即安全停止，然后冻结选区。Composer 会在当前光标处插入可见引用，或替换 Composer 当前选区，不再一律追加到末尾。它只显示 `@[引用文字前十个字…]`；隐藏的 occurrence 保留完整规范 `dsh-novel:` mention，并在提交时把精确值序列化给 Agent。
- 按 Preset 限定的 `conversation.input.dock` 会加入与 Composer 等宽的紧凑坐标栏。实时跟随项只保存当前可见 Asset 的身份，在下一次任务编译时解析当前已保存 head；搜索后固定的条目仍保留精确 Revision 坐标。有脏稿时仍指向最后已保存的 head，并明确提示保存。显式划词引用则另行发送规范精确坐标与完整选中文字。
- `novel_propose_changes` 工具结果渲染持久的行内 Diff 卡片。接受和拒绝调用 Session 所属 Remote 方法；接受后从权威 Repository 状态刷新资产浏览器和画布。
- 工作台在对话插槽所有者挂载后延迟解析 conversation service，在避免 Client 插件依赖循环的同时继续使用 DSH 普通 Composer 草稿状态。

## 模型体验

### 工作台展示

#### 模型看到什么

Client 包本身不加入隐藏模型内容。显式 mention 与可见 Context Tray 工作集只是 `@deepseek-ai/dsh-experimental-novel-context` 的输入；其显式任务策略决定这些引用保留坐标，还是在冻结 V3 Manifest 中加入有边界的关联材料。模型提案和显式报告读取由 `@deepseek-ai/dsh-experimental-tool-novel` 提供。打开章节审稿页不使用模型；点击“开始审查”才启动有边界的审稿 Subagent。把满足条件的 Revision 标记为定稿会启动独立的有边界偏好 worker；点击 NOAI 不使用模型。

#### Token 影响

布局、编辑器、控件、短引用 label、Tray 外观和审阅卡片不增加 token。工作集坐标只增加有界元数据；只有显式引用文本与稳定 Novel 工具 Schema 增加可变请求内容。

#### KV Cache 影响

打开资产、编辑草稿、审阅 ChangeSet 和切换面板都不会改变模型工具目录或 system prompt。

## 已知限制与延期工作

- **内置五个 renderer** — 画布安装 `manuscript.chapter`；策划包增加 `planning.outline`、`planning.chapter-outline`、`book.brief` 与 `book.style-profile`。人物、灵感、场景、时间线、关系和多编辑器标签尚未实现。
- **没有实时文件事件** — 工作台内应用修改后会刷新资产浏览器，Repository 调用会协调外部编辑；目前没有文件监听或浏览器失效事件流。
- **一个活动文本选区** — 现在已经可以固定精确 Asset 并只读浏览历史 Revision，但固定选区、多选区、Block id、批注、命名快照、恢复与 Revision 删除尚未实现。
- **桌面优先布局** — 移动端布局、路由级多工作台切换、持久面板几何，以及瞬时打开状态的跨浏览器同步尚未实现。
- **基础文本编辑器** — 富 Markdown 编辑、语法装饰、自动保存节奏、导入导出和发布视图尚未实现。
