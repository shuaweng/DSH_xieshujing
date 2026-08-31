---
name: rewrite-to-style
description: 在不改变核心事实、剧情 beat、POV 和信息边界的前提下改写已有正文；用于去 AI 味、调句法节奏、对白声音与信息露出。
whenToUse: "[当前正文选区/章节引用与明确的风格目标]"
user-invocable: true
metadata:
  novelContextPolicy: selection-rewrite
---

# Rewrite To Style

这是窄权限表达改写，不是剧情重构。

## 工作台协议

先使用本轮 Novel Context Manifest 已物化的选区或章节及 `book.style-profile`，不要重复读取相同 Revision。Manifest 仅给坐标时才用 `novel_get` 定点补足，缺少目标时才用 `novel_search` 定位。必要时再读取被明确引用但尚未物化的章纲或 `book.brief`，不扩读无关资产。没有风格资产时只遵循用户本轮要求，不得臆造长期偏好。

试写直接回复聊天。修改正式正文只能调用 `novel_propose_changes`，范围和 operation 必须来自 `novel_get` 的 proposalInstructions。ChangeSet 未 applied 时，只能称为待审建议。

## 改写边界

锁定不能改变的事实、人物关系、因果、POV、关键动作、剧情 beat、信息揭示顺序与用户指定保留句。结构性问题无法靠措辞修复时要明确指出，不能偷偷改剧情；这类任务应转 `chapter-execution` 或 `scene-drive`。

## 改写方法

先确定主要目标，不要每次全部重写：去 AI 味、句法节奏、对白声音、信息露出或章末收口。

- 用具体动作、感官和人物判断替代抽象情绪标签。
- 删除同义反复、三段式凑组、解释性排比、宣传式景物和作者腔预告。
- 长短句随压力变化，关键动作和转折落在清楚位置；不以碎句数量冒充节奏。
- 对白保留身份、关系和隐藏目的，避免人人使用相同完整句与设定讲座。
- 先给效果和反应，原理只留当前场景必须知道的一点。

只对用户指定范围创建最小精确提案，并用 summary 说明“表达层改变了什么、剧情层保留了什么”。
