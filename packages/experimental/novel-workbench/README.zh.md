# @deepseek-ai/dsh-experimental-novel-workbench

[English](README.md) | 中文

## 用途

这个实验性 Client Consumer 提供 Agent 原生 Novel Studio 根工作台：在一个由 Profile 拥有的界面中组合 DSH 会话导航、正文资产、创作画布、可见 Agent 上下文、对话和可审阅 ChangeSet。

## 行为

- Novel Studio Profile 禁用普通 `ui-layout` 根占位者。本包成为唯一根占位者，并声明原生 `sidebar`、`conversation`、`details`、`shell.overlay`、`novel.explorer` 和 `novel.canvas` 插槽。
- 原生 DSH 侧栏仍然可用并默认折叠；它可以展开以搜索和导航会话。切换 Session 不会替换根工作台组件。
- 资产浏览器发现当前 Session 的 Novel Project，列出已协调的 `manuscript.chapter` 资产，并打开携带精确 Revision 的章节文档。
- 画布只编辑章节正文。保存使用当前显示的基础 Revision；“引用选区到 Agent”先保存脏草稿，再冻结选中的 UTF-16 范围，最后把返回的 Markdown `dsh-novel:` 引用追加到当前 Composer。
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

- **仅章节画布** — 大纲、人物、灵感、场景、时间线、关系和多编辑器标签尚未实现。
- **没有实时文件事件** — 工作台内应用修改后会刷新资产浏览器，Repository 调用会协调外部编辑；目前没有文件监听或浏览器失效事件流。
- **一个活动选区** — 固定上下文、多选区、Block id、批注和旧 Revision 标记尚未实现。
- **桌面宽度布局** — 面板尺寸调整、移动端布局、路由级多工作台切换和持久面板几何尚未实现。
- **基础文本编辑器** — 富 Markdown 编辑、语法装饰、自动保存节奏、导入导出和发布视图尚未实现。
