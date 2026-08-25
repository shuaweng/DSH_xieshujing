# @deepseek-ai/dsh-experimental-novel-analysis

[English](README.md) | 中文

## 用途

这个实验性 Host 服务拥有 Novel Studio 的精确 Revision 章节分析。它将确定性的中文网文风格扫描与固定只读 Subagent 审稿结合，并且只通过 `ctx.novelRepository` 持久化通过校验的报告。

## 行为

- `scanChapter()` 读取一个已保留的 `manuscript.chapter` Revision，无需模型即可运行有边界的确定性规则，并为该精确 Revision upsert 一份 `noai-scan` 报告。
- `reviewChapter()` 冻结目标章节，以及有边界的章纲、本书概述、本书风格和当前工作集引用。它启动一个全新 one-shot Subagent，使用只读 persona、`maxDepth: 1`、仅 `skill` 工具和严格的结构化输出 Schema。
- 审稿人加载包内 `chapter-review` Skill，并从情节、因果、人物、节奏、钩子和文风六个维度评分，问题必须绑定证据。作者材料被明确标为不可信内容，不能扩大 worker 权限。
- 只有 worker 正常完成并且服务校验全部字段和边界后，报告才会写入。因此失败的重跑会保留旧的成功 `(project, asset, revision, kind)` 报告；成功重跑只替换这一行。
- `candidateWarning()` 在内存中物化章节 ChangeSet 候选并运行同一确定性扫描。达到风险阈值时，它为调用方返回有边界的提示文字以加入当前模型 turn；它既不持久化报告，也不创建第二个 ChangeSet。
- 分析绝不应用、保存、定稿或以其他方式修改作者 Asset。

## 模型体验

### 章节审稿 worker

#### 模型看到什么

只有专用审稿 Subagent 会看到冻结的精确 Revision 章节和有边界的相关 Asset、固定只读 persona、`skill` 工具与严格报告契约。只有章节提案越过配置阈值时，根 Agent 才会看到确定性的候选提示。

#### Token 影响

确定性 NOAI 扫描不消耗模型 token。一次用户请求的章节审稿会使用一个有边界的 Subagent 请求和按需加载的 `chapter-review` Skill 正文。候选提示最多向当前 turn 加入五条问题。

#### KV Cache 影响

分析器不会增加动态工具 Schema 或 system prefix 内容。冻结审稿材料属于子 Agent 请求；候选反馈作为提案工具结果之后、写入日志的 deferred context 进入当前 turn。

## 已知限制与延期工作

- **启发式而非作者身份检测** — NOAI 报告定位可修改的模板化语言候选；它既不能证明 AI 创作，也不能代替编辑判断。
- **每种报告、每个 Revision 仅一份** — 成功重跑会替换同类报告，不保留每次报告运行历史。
- **仅章节** — 确定性扫描和审稿目前要求 `manuscript.chapter`；全书、多章、人物与大纲审查尚未实现。
- **没有定稿学习** — 标记 Revision 定稿以及从草稿/定稿 Diff 学习文风偏好属于 PR11。
