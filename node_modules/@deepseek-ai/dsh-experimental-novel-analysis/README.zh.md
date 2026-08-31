---
description: "Novel Studio 的精确 Revision 章节扫描、严格审稿、Story State 提取与作者偏好学习。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-novel-analysis

[English](README.md) | 中文

## 概述

这个实验性 Host 服务拥有 Novel Studio 的精确 Revision 章节分析与显式定稿学习。它将确定性的中文网文风格扫描、固定只读审稿人、草稿/定稿偏好提取器与定稿正文 Story State 提取器结合，并且只通过 `ctx.novelRepository` 持久化通过校验的报告与待审候选。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="behavior"></a>
## 行为

- `scanChapter()` 读取一个已保留的 `manuscript.chapter` Revision，无需模型即可运行有边界的确定性规则，并为该精确 Revision upsert 一份 `noai-scan` 报告。工作台规则从持续维护的小说 Preset guard 中适配，覆盖重复解释/强调、模板化转折与节奏、抽象情绪、泛化意象/景物、POV/镜头越权、Markdown 残留、宣传腔等可解释模式，同时保留可编辑的精确 offset。
- `reviewChapter()` 只会在作者明确点击“开始审查”或重跑后执行；当前 Session 禁用 `chapter-review` 时会拒绝请求。它再请求 Novel Context Compiler 的闭集 `chapter-review` 策略，由编译器把目标章节、确定关联的章纲/全书指导和当前工作集冻结进一份精确 V3 Manifest，然后服务启动一个全新 one-shot Subagent，使用只读 persona、`maxDepth: 1`、仅 `skill` 工具和严格的结构化输出 Schema。
- 审稿人加载包内 `chapter-review` Skill，并必须返回八个证据化维度：剧情、逻辑/连续性、人物、节奏、钩子、文风、沉浸/出戏和 AI 模板味。提示禁止礼貌性夸奖和默认高分；确定性 NOAI 扫描会作为有界候选证据提供给审稿人，但必须结合语境确认，不能机械照抄。作者材料被明确标为不可信内容，不能扩大 worker 权限。
- 只有 worker 正常完成并且服务校验全部字段和边界后，报告才会写入。因此失败的重跑会保留旧的成功 `(project, asset, revision, kind)` 报告；成功重跑只替换这一行。
- `candidateWarning()` 在内存中物化章节 ChangeSet 候选并运行同一确定性扫描。达到风险阈值时，它为调用方返回有边界的提示文字以加入当前模型 turn；它既不持久化报告，也不创建第二个 ChangeSet。
- `finalizeChapter()` 先保留用户对一个精确章节 Revision 的显式定稿决策。项目存在 `book.story-state` 时，全新的 one-shot worker 只接收该精确状态 Revision 与定稿章节，通过 `story-state-learning` 返回带正文证据的完整替换候选。与之独立，只有作者确实在某个 Agent 草稿后继续修改时，服务才启动偏好 worker。
- `acceptPreference()` 通过普通 ChangeSet 应用与崩溃恢复协议，把作者审阅后的指导追加到精确风格 Revision；`rejectPreference()` 只记录终态，不改作者内容。保存、审稿、扫描和 Agent 工具路径都不会自动定稿。
- `acceptStoryState()` 通过同一 ChangeSet 协议替换精确 Story State Revision；目标过期时会冲突，不会静默重定位。拒绝只记录终态，不修改作者确认的状态。

<a id="model-experience"></a>
## 模型体验

### 章节审稿与定稿学习 worker

#### 模型看到什么

专用审稿 Subagent 只看到为精确章节及确定关联 Asset 编译的 V3 Manifest；偏好 worker 只看到精确 Agent 草稿、用户定稿与当前“本书风格”；Story State worker 只看到精确定稿章节和它准备替换的精确已确认状态。三者都使用固定只读 persona、仅 `skill` 工具与严格输出契约。报告不会进入普通 Prompt 上下文；根 Agent可通过 `novel_get_analysis` 显式读取精确 Revision 报告。

#### Token 影响

确定性 NOAI 扫描不消耗模型 token。一次章节审稿使用一个有边界的 Subagent 请求；项目存在 Story State 时，一次显式定稿使用一个有边界的状态提取请求，只有存在有意义的 Agent 草稿/作者定稿差异时才再使用一个偏好请求。候选提示最多向当前 turn 加入五条问题。

#### KV Cache 影响

分析器不会增加动态工具 Schema 或 system prefix 内容。冻结审稿材料属于子 Agent 请求；候选反馈作为提案工具结果之后、写入日志的 deferred context 进入当前 turn。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- **启发式而非作者身份检测** — NOAI 报告定位可修改的模板化语言候选；它既不能证明 AI 创作，也不能代替编辑判断。
- **每种报告、每个 Revision 仅一份** — 成功重跑会替换同类报告，不保留每次报告运行历史。
- **仅章节** — 确定性扫描和审稿目前要求 `manuscript.chapter`；全书、多章、人物与大纲审查尚未实现。
- **不自动提升偏好** — 候选在作者采纳前保持惰性；一次定稿绝不会偷偷改写“本书风格”。
- **不自动提升 Canon** — Story State 是作者确认的自由 Markdown；每个定稿章节 Revision 只保留一份惰性完整替换候选，不会静默改写 Canon，也不保留重复提取运行历史。
- **没有偏好检索或训练** — 已采纳指导仍是普通作者风格文本；偏好 RAG、排序、微调与跨书作者画像尚未实现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
