# @deepseek-ai/dsh-experimental-novel-workbench

[English](README.md) | 中文

## 用途

这个实验性 Client Consumer 提供 Agent 原生 Novel Studio 根工作台：在一个由 Profile 拥有的界面中组合 DSH 会话导航、类型化作者 Asset、由注册表驱动的画布、可见 Agent 上下文、对话和可审阅 ChangeSet。

## 行为

- Novel Studio Profile 禁用普通 `ui-layout` 根占位者。本包成为唯一根占位者，并声明原生 `sidebar`、`conversation`、`details`、`shell.overlay`、`novel.explorer` 和 `novel.canvas` 插槽。
- 桌面组合把 Agent 对话放在左侧，把正文浏览器与创作画布放在右侧，同时在最外侧保留可折叠的原生 DSH Session 侧栏。
- 原生 DSH 侧栏仍然可用并默认折叠；它可以展开以搜索和导航会话。切换 Session 不会替换根工作台组件。
- 资产浏览器发现当前 Session 的 Novel Project，并打开绑定精确 Revision 的类型化 Asset 文档。
- `ctx.novelAssetRenderers` 拥有 effect 作用域内、按精确类型匹配的编辑器、选区描述和 Diff contribution。共享画布拥有版本保护保存、Context Commit Barrier、Agent mention 插入和审阅权威；缺少 renderer 时会明确拒绝，而不是展示误导性的通用编辑器。
- 内置正文 renderer 编辑章节正文并捕获 UTF-16 范围。“引用选区到 Agent”先保存脏的类型化草稿，保存失败即安全停止，然后冻结选区，并把返回的 Markdown `dsh-novel:` 引用追加到当前 Composer。
- Context Tray 披露当前冻结选区，并说明它会在发送时进入 Session 日志。
- `novel_propose_changes` 工具结果渲染持久的行内 Diff 卡片。接受和拒绝调用 Session 所属 Remote 方法；接受后从权威 Repository 状态刷新资产浏览器和画布。
- 工作台在对话插槽所有者挂载后延迟解析 conversation service，在避免 Client 插件依赖循环的同时继续使用 DSH 普通 Composer 草稿状态。

## 模型体验

### 工作台展示

#### 模型看到什么

Client 包本身不加入模型内容。用户创建的上下文引用由 `@deepseek-ai/dsh-experimental-novel-context` 解析，模型提案由 `@deepseek-ai/dsh-experimental-tool-novel` 创建。

#### Token 影响

布局、编辑器、Context Tray 和审阅卡片不增加 token。只有用户发送的引用和稳定 Novel 工具 Schema 会影响模型请求。

#### KV Cache 影响

打开资产、编辑草稿、审阅 ChangeSet 和切换面板都不会改变模型工具目录或 system prompt。

## 已知限制与延期工作

- **只内置一个 renderer** — 画布由注册表驱动，但当前只安装 `manuscript.chapter`；大纲、人物、灵感、场景、时间线、关系和多编辑器标签尚未实现。
- **没有实时文件事件** — 工作台内应用修改后会刷新资产浏览器，Repository 调用会协调外部编辑；目前没有文件监听或浏览器失效事件流。
- **一个活动选区** — 固定上下文、多选区、Block id、批注和旧 Revision 标记尚未实现。
- **桌面宽度布局** — 面板尺寸调整、移动端布局、路由级多工作台切换和持久面板几何尚未实现。
- **基础文本编辑器** — 富 Markdown 编辑、语法装饰、自动保存节奏、导入导出和发布视图尚未实现。
