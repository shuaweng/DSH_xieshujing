# Agent Note: 小说 Session Skill 控制与严格章节审查

Status: implemented

[English](2026-08-28-novel-session-skills-and-strict-review.md) | 中文

## Problem

小说作者需要看见当前小说 Preset 提供了哪些可复用写作方法，并能在某个对话中停用不适合的方法。仅改变显示的开关会造成误导，因为 Agent 仍可能收到 Skill Catalog 或加载已关闭的 Skill。章节审查也需要系统寻找缺陷的编辑立场，而不是礼貌性夸奖和乐观的默认高分。

## Decision

小说工作台通过底栏抽屉列出当前 Agent 作用域内、作者可见的自定义 Skills。开关状态是一份完整、后写覆盖的禁用名称集合，以持久 `skill/activation` Session 事件保存。`@deepseek-ai/dsh-tool-skill` 将该状态同时用于目录发布、模型工具加载和用户显式调用，因此一次切换会真正改变当前 Session 的 Agent 能力，但不会修改 Preset 或其他 Session。

固定章节审稿人在 `chapter-review` 被禁用时拒绝运行。启用时，它必须返回八个证据化维度：剧情、逻辑与连续性、人物、节奏、钩子、文风、沉浸/出戏和 AI 模板味。提示禁止礼貌性夸奖和默认高分。确定性 NOAI 扫描器会提供一份有界证据列表，但审稿人必须结合语境确认候选问题后才能报告。

## Alternatives considered

**把启用状态全局写入 Preset。** 一次试验会影响所有已有和未来对话，并把局部写作选择变成配置修改。

**只在工作台隐藏已关闭的 Skills。** 模型可见目录和加载工具仍然可执行，开关会给出虚假保证。

**把确定性 NOAI 结果直接当作审查结论。** 这种方式可复现，但不能区分有意的文风和有害模板；扫描器因此只提供证据，不负责最终编辑判断。

**只要求审稿人口吻更严格，不改变输出要求。** 口吻不能保证检查范围，因此服务会校验完整八维结果，并拒绝缺失或重复的维度。

## Consequences

Skill 启用状态属于追加式 Session 历史，并可能让下一次合格 pre-step 追加一份替换 Skill Catalog。重新启用不会删除较早的目录消息，但后续使用只以最新目录为准。新 Skills 默认启用。

章节审查仍只消耗一次有界 Subagent 请求，外加一次确定性本地扫描。更严格的 Schema 会拒绝不完整的审稿输出，不会持久化残缺报告；工作台仍能读取已有的六维报告。
