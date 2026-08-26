# Agent Note：Asset 原生的小说新书启动与项目初始化

Status: implemented

[English](2026-08-26-novel-new-book-bootstrap-skill.md) | 中文

## Problem

旧版小说 Preset 的 `new-book-bootstrap` 方法很有价值：它能把原始设想推进为读者承诺、故事发动机、主角、开篇策略与明确创作红线。但它的持久化模型与小说工作台不兼容：它会直接写入一套固定的项目、风格、人物、账本、灵感和规划 Markdown 文件树，而工作台要求注册的 Asset 类型、精确 Revision、受控创建与可审阅 ChangeSet。直接复制会形成第二套项目模型，并教 Agent 绕过工作台。

项目初始化和创意开书也是两种不同操作。初始化会在 Novel 工具可以运行之前建立可信 `novel.yaml` 根目录与 Repository 目录；创意开书则是在已初始化项目内进行的模型引导工作。Skill 不能安全替代 Host 所有的初始化操作。

## Decision

小说工作台 Preset 提供一个包内所有的 `new-book-bootstrap` Skill。它保留旧方法中的预期锚点、少量真正不同的候选方向，以及明确的“已确认 / 候选 / 待定”归纳，同时避免长问卷，并优先根据作者已经给出的信息提出一版具体理解。

Skill 只把已确认结果映射到当前已经注册的工作台 Asset：项目唯一的 `book.brief`、经作者确认的 `book.style-profile`、自由格式的书纲与卷纲 `planning.outline`、绑定章节的 `planning.chapter-outline`，以及可选 `manuscript.chapter`。人物、地点、灵感、伏笔与开放问题在专属 Asset 类型落地前，先保存在概述或大纲的自由 Markdown 章节中。Skill 不发明未注册类型，也不重建旧版平行文件与账本体系。

创建过程采用渐进方式，而不是受固定脚手架门禁约束。默认有用的起点是概述、作者已经确认时的风格资产与一份书纲，但作者可以更早落稿或只创建更少 Asset。修改前，Agent 会报告准备创建的 Asset 集合并等待确认。它通过 `novel_list` 检查创建规则，通过 `novel_search` 与 `novel_get` 发现并复用既有 Asset，只用 `novel_create` 创建新 Asset，并只通过绑定精确 Revision 的 `novel_propose_changes` 提案修改既有 Asset。

内置 `manuscript.chapter` 类型负责直接创建章节标题与完整 Markdown 正文。Agent 与浏览器中的“新建章节”操作共用同一条通用 Repository 创建路径。作者要求把一篇新正文写进书里时，Agent 会在一次 `novel_create` 调用中创建完整章节，而不是要求作者先建立空容器。修改已有章节仍然必须提交绑定精确 Revision 的 ChangeSet 提案。

Skill 声明现有 `outline-edit` 上下文策略。该策略可以加入所引用大纲的确定父级与概述，而不会安装一份始终存在的开书上下文包。因此空白但已初始化的项目不会增加作者文本，已有项目则可以从精确的当前 Asset 继续开书。

项目初始化是一个由浏览器与 Agent 工具共用的 Repository 操作。它校验非空作品名与现有 Session 根目录，拒绝现有 `novel.yaml` 或非目录的 `manuscript`/`planning` 冲突，通过受 sandbox 约束的仅创建写入建立缺失的最小内容根，并最后发布 `novel.yaml` 作为激活标记。它永不删除或替换已有作者文件。浏览器把 manifest 缺失表示为中性的作品名表单，并在项目就绪前禁止 Asset/上下文调用。`novel_initialize_project` 只在用户明确要求且通过一次性批准后向模型暴露同一操作；已完成的工具卡会刷新已打开工作台。

Skill 判断作者何时明确要求开书，并可以调用 `novel_initialize_project`；它不自行写项目文件。初始化只建立项目身份与空内容根。创意确认与 Asset 创建随后继续通过 `novel_list`、`novel_create`、精确读取和 ChangeSet 提案完成。

## Alternatives considered

**原样挂载旧 Skill。** 否决，因为直接创建固定 Markdown 文件树会绕过注册 Asset 创建、单例检查、Revision 来源、ChangeSet 审阅与工作台渲染。

**先把所有旧模板都做成专属 Asset 类型。** 否决，因为人物、地点、灵感、账本与连续性 Schema 还不是已经确定的产品决策。使用现有概述与大纲中的自由 Markdown 可以保留创作自由，后续仍能迁移。

**让 Skill 或通用文件工具拼装项目文件。** 否决，因为提示方法无法强制仅创建发布、Session 根目录限制、批准审计或与 provider 无关的校验。Skill 改为选择 Host 所有的初始化工具。

**只允许浏览器初始化。** 否决，因为作者要求 Agent 在空目录开书时会形成死循环。两个入口现在共用一个修改实现，只有 Agent 入口需要交互批准。

**新增一份永久开书上下文策略。** 第一版否决。新项目几乎没有作者材料，已有大纲任务策略也已经具备有界的确定扩展。以后若出现新的类型化开书关系，仍可新增专用策略。

## Consequences

作者可以调用一个工作台原生方法，从设想推进到可用的全书指导与规划 Asset，无需自行了解 Asset Schema。Agent 保留旧 Preset 最有价值的创意引导，同时每份持久化结果都能在工作台中看见、版本化并由工具寻址。

作者也可以从正文分组创建一个可编辑的空章节，而 Agent 可以用一次操作把用户要求的新章节完整落库。两者只是同一份类型创建契约的不同呈现，并非浏览器与模型各自维护的实现。

空 Session 目录现在是可恢复的产品状态，而不是 Repository 错误：作者可以从工作台表单初始化，也可以批准 Agent 的初始化调用。已有非法 manifest 仍会显示错误，且永不会被静默覆盖。模型可见 Skill 目录与无密钥 loader 快照已经包含新方法，Novel 工具目录与提示则公布需批准的初始化路径。
