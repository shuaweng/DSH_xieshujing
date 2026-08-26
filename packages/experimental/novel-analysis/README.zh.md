# @deepseek-ai/dsh-experimental-novel-analysis

[English](README.md) | 中文

## 用途

这个实验性 Host 服务拥有 Novel Studio 的精确 Revision 章节分析与显式定稿学习。它将确定性的中文网文风格扫描、固定只读审稿人和固定草稿/定稿偏好提取器结合，并且只通过 `ctx.novelRepository` 持久化通过校验的报告与待审候选。

## 行为

- `scanChapter()` 读取一个已保留的 `manuscript.chapter` Revision，无需模型即可运行有边界的确定性规则，并为该精确 Revision upsert 一份 `noai-scan` 报告。
- `reviewChapter()` 请求 Novel Context Compiler 的闭集 `chapter-review` 策略。编译器先把目标章节、确定关联的章纲/全书指导和当前工作集冻结进一份精确 V3 Manifest，再由服务启动一个全新 one-shot Subagent，使用只读 persona、`maxDepth: 1`、仅 `skill` 工具和严格的结构化输出 Schema。
- 审稿人加载包内 `chapter-review` Skill，并从情节、因果、人物、节奏、钩子和文风六个维度评分，问题必须绑定证据。作者材料被明确标为不可信内容，不能扩大 worker 权限。
- 只有 worker 正常完成并且服务校验全部字段和边界后，报告才会写入。因此失败的重跑会保留旧的成功 `(project, asset, revision, kind)` 报告；成功重跑只替换这一行。
- `candidateWarning()` 在内存中物化章节 ChangeSet 候选并运行同一确定性扫描。达到风险阈值时，它为调用方返回有边界的提示文字以加入当前模型 turn；它既不持久化报告，也不创建第二个 ChangeSet。
- `finalizeChapter()` 先保留用户对一个精确章节 Revision 的显式定稿决策，再寻找最近的 `agent-apply` 祖先；只有作者确实在该 Agent 草稿后继续修改，才启动全新的 one-shot 偏好 worker。其 `preference-learning` 上下文策略会冻结精确草稿、定稿 Revision 与当前精确“本书风格”；worker 只能返回带证据的严格惰性候选。
- `acceptPreference()` 通过普通 ChangeSet 应用与崩溃恢复协议，把作者审阅后的指导追加到精确风格 Revision；`rejectPreference()` 只记录终态，不改作者内容。保存、审稿、扫描和 Agent 工具路径都不会自动定稿。

## 模型体验

### 章节审稿与定稿学习 worker

#### 模型看到什么

只有专用审稿 Subagent 会看到为精确 Revision 章节及其确定关联 Asset 编译的 V3 Manifest；只有专用偏好 worker 会看到包含精确 Agent 草稿、精确用户定稿和当前精确“本书风格”的 Manifest。两者都使用固定只读 persona、仅 `skill` 工具与严格输出契约。只有章节提案越过配置阈值时，根 Agent 才会看到确定性的候选提示。

#### Token 影响

确定性 NOAI 扫描不消耗模型 token。一次用户请求的章节审稿会使用一个有边界的 Subagent 请求和按需加载的 `chapter-review` Skill 正文；满足学习条件的显式定稿会使用一个有边界的偏好 worker 请求，没有此前 Agent 草稿的定稿不消耗模型 token。候选提示最多向当前 turn 加入五条问题。

#### KV Cache 影响

分析器不会增加动态工具 Schema 或 system prefix 内容。冻结审稿材料属于子 Agent 请求；候选反馈作为提案工具结果之后、写入日志的 deferred context 进入当前 turn。

## 已知限制与延期工作

- **启发式而非作者身份检测** — NOAI 报告定位可修改的模板化语言候选；它既不能证明 AI 创作，也不能代替编辑判断。
- **每种报告、每个 Revision 仅一份** — 成功重跑会替换同类报告，不保留每次报告运行历史。
- **仅章节** — 确定性扫描和审稿目前要求 `manuscript.chapter`；全书、多章、人物与大纲审查尚未实现。
- **不自动提升偏好** — 候选在作者采纳前保持惰性；一次定稿绝不会偷偷改写“本书风格”。
- **没有偏好检索或训练** — 已采纳指导仍是普通作者风格文本；偏好 RAG、排序、微调与跨书作者画像尚未实现。
