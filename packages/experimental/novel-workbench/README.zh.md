# @deepseek-ai/dsh-experimental-novel-workbench

[English](README.md) | 中文

## 用途

这个实验性 Client Consumer 向原生 DSH 外壳贡献 Agent 原生 Novel Studio 界面：在一个按 preset 限定的工作台中组合类型化作者 Asset、由注册表驱动的画布、紧凑而精确的 Agent 引用、对话和可审阅 ChangeSet。

## 行为

- 原生 `ui-layout` 始终是唯一根和布局服务的拥有者。本包只向其按 selector 路由的 `shell.workbench` chain 贡献纯 `novel` surface，并仅在该 surface 被选中时声明 `novel.explorer` 与 `novel.canvas`。它既不跨插件导入 React 组件，也不注册竞争根。
- 整个工作台按 Preset 限定。只有精确选择 `novel-workbench` 时，才会在 `conversation.input.left`、原生 access/plan 控件旁得到纯图标“小说工作台”开关；其无障碍名称与悬浮提示仍保留完整动作说明。已经开始的 Session 读取已提交摘要，空白 Composer 则读取 Agent preset 选择器所用的同一份只读暂存值。Session 仍从普通 DSH Frame 开始；作者无需切换 preset 或修改作者数据即可展开/收起工作台。切到任何其他 preset 会立即恢复普通 Frame 并移除按钮。
- 桌面组合把 Agent 对话放在左侧，把正文浏览器与创作画布放在右侧，同时在最外侧保留可折叠的原生 DSH Session 侧栏。无障碍拖拽分隔条（也支持方向键）会按动画帧频率预览 CSS track，并在松开时只提交一次经过边界限制的宽度，因此作者工作台不会随每个 pointer 事件重渲染。
- 原生 DSH 侧栏仍然可用，可收起或展开以搜索和导航会话。切换 Session 不会替换已选中的小说 surface；切到不符合条件的 preset 会关闭它。
- 资产浏览器发现当前 Session 的 Novel Project，呈现逻辑“本书”引导分组、稳定的“正文”与“大纲 → 卷纲”分支（包括空分支），可以创建项目级唯一的本书概述/本书风格和自由大纲/卷纲，打开绑定精确 Revision 的类型化 Asset 文档，并可独立于 DSH Session 侧栏收起。层级来自语义类型与父级 id，而不是文件路径。
- `ctx.novelAssetRenderers` 拥有 effect 作用域内、按精确类型匹配的编辑器、选区描述、可选阅读展示和 Diff contribution。共享画布拥有版本保护保存、Context Commit Barrier、Agent 引用插入和审阅权威；缺少 renderer 时会明确拒绝，而不是展示误导性的通用编辑器。
- 内置正文 Renderer 通过同一次带 Revision 保护的保存编辑章节名称与正文、捕获简单 UTF-16 范围、统计排除空白后的作者字符，并启用全高居中的纸张画布。跨整个工作台的底栏及六套联动皮肤、字体和字号控件由所有 Asset Renderer 共用；只有正文额外显示本章字数与章纲入口。
- `@deepseek-ai/dsh-experimental-novel-asset-outline` 独立贡献自由的 `planning.outline` 与 `planning.chapter-outline` Renderer。大纲和卷纲是不受模板限制的 Markdown 写作表面，支持精确文本选区与 Diff。正文底栏把用户提供的章纲图标放在皮肤控件左侧；点击会打开与当前章节一对一绑定的右侧抽屉，作者可自由写作、保存或把章纲选区引用给 Agent。情绪/钩子/节奏/起承转合实用起步模板只是可选按钮，插入后仍是普通可编辑 Markdown。
- Agent 创建的 Asset 会返回可回放创建卡片并刷新权威 Explorer。人类与 Agent 创建都经过同一条类型化 Remote/Repository 链路，任何一方都不能自行发明文件路径。
- 小说 Agent 可以用 `novel_present` 调用 `open-workbench` 或 `close-workbench`。其持久工具结果 metadata 与 Composer 开关驱动同一个浏览器本地 `ctx.layout` 选择；普通 Agent 回复文字绝不控制布局，展示动作也绝不修改 Asset。
- “引用选区到 Agent”先保存脏的类型化草稿，保存失败即安全停止，然后冻结选区。Composer 只显示 `@[引用文字前十个字…]`；隐藏的 occurrence 保留完整规范 `dsh-novel:` mention，并在提交时把精确值序列化给 Agent。
- 按 Preset 限定的 `conversation.input.dock` 会加入与 Composer 等宽的紧凑坐标栏。它自动跟随当前可见且已保存的章节、大纲、卷纲、全书指导或其他注册 Asset，只展示坐标，并允许固定检索到的坐标；有脏稿时保留最后已保存 Revision 并明确提示保存。显式划词引用则另行发送规范坐标与完整选中文字。
- `novel_propose_changes` 工具结果渲染持久的行内 Diff 卡片。接受和拒绝调用 Session 所属 Remote 方法；接受后从权威 Repository 状态刷新资产浏览器和画布。
- 工作台在对话插槽所有者挂载后延迟解析 conversation service，在避免 Client 插件依赖循环的同时继续使用 DSH 普通 Composer 草稿状态。

## 模型体验

### 工作台展示

#### 模型看到什么

Client 包本身不加入隐藏模型内容。显式 mention 与可见 Context Tray 工作集由 `@deepseek-ai/dsh-experimental-novel-context` 解析，模型提案由 `@deepseek-ai/dsh-experimental-tool-novel` 创建。

#### Token 影响

布局、编辑器、控件、短引用 label、Tray 外观和审阅卡片不增加 token。工作集坐标只增加有界元数据；只有显式引用文本与稳定 Novel 工具 Schema 增加可变请求内容。

#### KV Cache 影响

打开资产、编辑草稿、审阅 ChangeSet 和切换面板都不会改变模型工具目录或 system prompt。

## 已知限制与延期工作

- **内置五个 renderer** — 画布安装 `manuscript.chapter`；策划包增加 `planning.outline`、`planning.chapter-outline`、`book.brief` 与 `book.style-profile`。人物、灵感、场景、时间线、关系和多编辑器标签尚未实现。
- **没有实时文件事件** — 工作台内应用修改后会刷新资产浏览器，Repository 调用会协调外部编辑；目前没有文件监听或浏览器失效事件流。
- **一个活动文本选区** — 现在已经可以固定精确 Asset，但固定选区、多选区、Block id、批注和旧 Revision 标记尚未实现。
- **桌面优先布局** — 移动端布局、路由级多工作台切换、持久面板几何，以及瞬时打开状态的跨浏览器同步尚未实现。
- **基础文本编辑器** — 富 Markdown 编辑、语法装饰、自动保存节奏、导入导出和发布视图尚未实现。
