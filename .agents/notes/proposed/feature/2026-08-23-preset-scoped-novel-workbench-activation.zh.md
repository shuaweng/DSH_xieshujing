# Agent Note: 按 Preset 激活小说工作台

Status: proposed

[English](2026-08-23-preset-scoped-novel-workbench-activation.md) | 中文

## Problem

Novel Studio Profile 目前会为整个进程替换 Web 根布局。这证明了隔离工作台可以复用 DSH 对话 Slot，却也导致 Session 即便切换到 `standard`、`minimal` 或其他 Agent preset，页面仍然显示小说 UI。一个 Profile 级能力被误做成了与 Session 无关的展示决定。

作者也不能在不离开 Profile 的情况下收起整个工作台。现有控制只能收起单个栏位，同时没有模型可见的展示动作，让小说 Agent 在任务需要时主动唤起工作台。

## Proposal

保持原生 `ui-layout` 为唯一根和布局服务拥有者，并在该外壳中加入按 selector 路由的 `shell.workbench` chain：

- 关闭模式渲染普通 sidebar、conversation、details 与 overlay Slot；
- 打开模式保留 sidebar，把 conversation 放入可调宽度的 Agent 栏，并选出已注册的 Novel surface 作为主工作台；
- 模式属于浏览器瞬时展示状态，不是小说作者数据，也不是 Session Projection；
- 只有当前 Session 或空白 Session 选择器精确报告 `novel-workbench` Agent preset 时才允许打开；
- 切换到其他 Session 或 preset 时立即恢复默认 Frame，并清除打开请求。

在 `conversation.input.left` 注册一个纯图标紧凑开关。这个可加式单行 Composer 位置就在 access/plan 控件之后；无障碍名称与悬浮提示描述当前展开／收起动作，无需让文字标签长期占用 Composer 宽度。已经开始的 Session 只读取已提交的 `agentPreset` 摘要；空白 Session 可能尚无对应摘要行，因此 `ui-agent-preset` 通过只读的 `ctx.agentPresetSelection` face 发布选择器 store，并且只有空白 Composer 可以使用这份暂存值。最终精确值为 `novel-workbench` 时才渲染开关。激活状态只负责打开或关闭整个工作台，不切换 Session preset，也不修改小说 Asset。

Agent／工作台分隔条按动画帧频率预览一个经过边界限制的 CSS track 变量，只在松开指针时提交 `ctx.layout` 宽度。因此作者工作台子树不会随每个 pointer 事件重渲染，外壳 track 缓动也只在当前拖拽期间关闭。键盘调宽仍通过同一个有界布局服务立即提交。

为小说 preset 新增 `novel_present`。第一版只接受 `open-workbench` 与 `close-workbench`。工具调用和结果留在 Session Log 中，浏览器通过小说工具视图消费结果的 presentation metadata，只更新瞬时展示状态。禁止解析自然语言、使用 DOM 坐标、写文件或隐式猜测 preset。

通用 `web` Profile 保持不变。Novel Studio 等待既有 `ui-layout` 服务与只读 Agent preset 选择 face，再通过通用 `shell.workbench` chain 贡献自己的 frame。小说包只导入公开服务与布局类型，既不跨插件导入 React 实现，也不注册第二个根或布局服务。这样遵循 Client Slot 所有权，并把布局组合留在原生外壳内部。

## Alternatives considered

**Novel Studio Profile 运行时始终显示工作台。** 这是当前行为，会让无关 preset 也像小说 Agent。

**动态注册第二个根。** 根 Slot 有意设计为 single，会拒绝第二个注册；动态遮蔽也会破坏子 Slot 所有权。按 selector 路由的子 surface 可以保留单一根与单一布局权威。

**把完整工作台放入 `details`。** Details 是生命周期和尺寸语义不同的辅助 Session 面板；正文画布应是主工作面。

**从 Agent 回复文字推断。** 解析“我已打开工作台”既不持久也不可信；模型入口必须是类型化 `novel_present` 工具。

## Acceptance criteria

- Novel Studio Profile 中的 `standard`、`minimal` 等非小说 Session 只显示普通 DSH Frame，且没有工作台开关。
- 空白选择器设为 `novel-workbench`，或 Session 已提交为 `novel-workbench` 时，初始都显示普通 DSH Frame，并在 access/plan 旁显示一个纯图标 Composer 开关。
- 把空白选择器改为 `standard`、旧 `novel` preset 或任何其他 preset 时，开关消失；上一个 Session 的状态不得泄漏到该空白 Composer。
- 点击开关打开小说 Frame；再次点击返回普通 Frame，不更改 preset 或作者内容。
- 指针拖动 Agent／工作台分隔条时应流畅预览且不在每次移动时发布布局状态；松开后只提交一次有边界的宽度，同时保留键盘调节能力。
- 切换离开符合条件的 Session/preset 时关闭工作台，不把状态泄漏给下一个 Session。
- `novel_present` 能通过持久工具结果 metadata 打开或关闭工作台，并且只通过小说 preset 组合提供。
- 默认 `web` 与 `headless` 组合保持不变。
- 聚焦 Client、工具、组合、类型、lint、文档与无 key 浏览器检查覆盖普通／工作台两种外壳模式、资格门控、手动开关和 Agent 展示动作。

## Risks

外壳在普通 tracks 与选中工作台之间切换时，对话流与编辑器可能重新排版。展示状态特意仅保存在当前浏览器，因此第二个浏览器不会继承另一浏览器的开关状态。重放已记录的 `novel_present` 结果时，其工具卡挂载可能恢复展示意图；第一版中该意图是显式的且受 preset 门控，因此可以接受，未来可由专门的展示事件运行时进一步区分 live 与 replay。
