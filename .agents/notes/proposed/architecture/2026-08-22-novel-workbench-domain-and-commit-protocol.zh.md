# Agent Note: 小说工作台领域边界与可恢复提交协议

Status: proposed

[English](2026-08-22-novel-workbench-domain-and-commit-protocol.md) | 中文

## 问题

已发布的 `novel` Agent Preset 为单个 Session 提供小说创作 persona、skill、通用文件系统工具、从固定文件派生的上下文以及写后护栏，但没有定义小说项目、稳定资产身份、不可变 Revision、语义选区、可审阅变更或浏览器工作台。因此，通用 `read` / `grep` / `write` / `edit` 调用会把小说稿件当作互不相关的路径；一次写入成功后，护栏才能描述变更，而此时内容已经进入作者的当前文件。

小说工作台必须让作者与 Agent 寻址同一个可见对象，同时不能让浏览器状态、可变路径或对话文本成为权威。它必须保持 DSH 现有不变量：模型可见输入可从 Session 日志重建；一项能力具有 Service Definition / Service Provider / Consumer 三种角色；默认 `web` 与 `headless` 组合继续可用；新行为附着在扩展点上，而不是进入 agent loop。

小说内容是高价值用户数据，也可能在 DSH 外部被编辑。因此，设计必须明确人类可读项目文件与 SQLite 历史之间的权威边界、陈旧写入规则，以及文件系统发布与数据库事务之间不可避免空隙的崩溃协议。DSH 的通用领域 KV 层无法提供跨表事务、二级索引或迁移，`ctx.fs` 也不提供文件监听或跨进程事务。

## 提案

围绕新的 `ctx.novelRepository` seam 增加私有实验性 `novel-studio` 能力和 Profile。首条完整垂直链路仅支持每个 Workspace 根目录一个小说项目，以及一种资产类型 `manuscript.chapter`。系统识别 `novel.yaml`，通过稳定 Frontmatter id 寻址章节资产，渲染资产列表和正文编辑器，冻结语义选区，向 Agent 提供绑定 Revision 的精确上下文，只接受模型工具提出的 ChangeSet，并通过可恢复提交协议应用用户已接受的单资产 ChangeSet。

当前作者内容以项目文件为权威。`.novel/history.sqlite` 是不可变 Revision 快照、ChangeSet 和应用日志的权威。首版目录与搜索投影从项目文件和历史重建到内存；如果以后增加持久搜索索引，它使用独立、可丢弃的 `.novel/index.sqlite`，绝不与历史数据库混用。DSH Session 历史仍然是模型实际看到的精确冻结上下文的权威。仅浏览器使用的布局、标签页、光标和草稿视图状态保留在客户端状态中。

现有 `novel` Agent Preset 继续作为 Session 级写作能力，并提供 persona 和 skill 行为，但不拥有工作台领域。MVP 增加独立的包内 `novel-workbench` Preset，它使用 Novel 工具，并从正式资产根目录的能力中移除原始修改工具；研究和开发 Preset 可以保留通用文件系统与 shell 工具，但不会因此取得提交 Novel ChangeSet 的权限。

PR1、PR2、下文所述 PR3 MVP 和 PR4 Asset 类型内核已在功能栈中实现。本 Note 仍保持 proposed，因为其验收条件有意覆盖 MVP 延后的更多资产类型、失效事件、重启快照和编排能力。

本提案扩展现有 Profile、文件系统、Session 历史、Remote 和客户端展示决策，不取代其中任何一项。

## PR1 基础切片

PR1 以独立包建立最小而完整的 `ctx.novelRepository` 能力 seam：纯 Service Definition、本地 Service Provider、只读 Host Remote Consumer、挂载生成 Remote contribution 的 Client-only adapter，以及显式 Novel Studio 组合 bundle。编译 face 的拆分遵循普通包只进入一个 aggregate 的规则，不会再制造一个 `api/remotes` 特例。现有 Gateway 身份策略负责解析被寻址的 Agent；该 Consumer 不增加授权机制。它使用这个 Agent Session 的工作目录作为候选 Workspace 根目录，判断其中是否包含有效的版本一 Novel Project，并读取经过校验的项目描述；它不能枚举或修改资产。

项目发现只通过 `ctx.fs` 读取根目录下的 `novel.yaml`。本地 Provider 默认将项目清单限制为 64 KiB；其 Config 可以指定另一个正的安全整数作为字节上限，但不能超过运行时最大 buffer 长度与最大字符串长度中的较小值。它执行严格 UTF-8 解码，拒绝所有 YAML 解析错误或 warning、alias 以及编码前或解码后的控制字符，校验版本一文档中不超过 32 个声明内容根，并通过 `ctx.fs` 解析标记文件和内容根目录，再使用 `ctx.fs.contains()` 检查包含关系。悬空或不是普通文件的标记无效。每个声明的内容根必须已作为目录存在；悬空链接、普通文件、缺失目录和 Workspace 根目录外的规范化目标都会被拒绝。Host Consumer 默认将以 UTF-8 编码的完整浏览器 descriptor JSON 限制为 256 KiB；其 Config 可以指定另一个正的安全整数作为字节上限，但不能超过运行时最大字符串长度。

受支持的显式 Novel Studio 组合会在 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 之后加载该切片。默认 `web` 与 `headless` 组合以及 `PROFILE_TEMPLATES` 保持不变；自定义 `cordis.yml` 仍可直接安装这些私有包。打开项目是只读操作：PR1 不创建 `.novel`，不初始化 SQLite，不扫描资产文件，不启动文件监听，不注册 Novel UI 或模型工具，也不实现 ChangeSet。

## PR2 资产与 Revision 切片

PR2 在同一能力 seam 上加入第一种作者资产 `manuscript.chapter`。本地 Provider 只递归扫描已声明 `manuscript` 根下的 Markdown 文件，执行可配置的目录深度、资产数量与精确字节边界，要求严格的第一版 `novel` Frontmatter，拒绝重复稳定 id 和扫描过程中变化的文件，并在路径重命名后保持 Asset 身份。文件仍是当前作者序列化内容的权威来源。

第一版持久 `.novel/history.sqlite` schema 保存完整的不可变 Revision 字节和协调后的当前 head。初次观察、受保护的浏览器保存与外部字节分歧分别记为 `initial-scan`、`user-edit` 和 `external-edit`；`agent-apply` 为 PR3 预留。未知、无版本、外来或损坏的数据库会明确失败，绝不会被重置。数据库使用私有文件、WAL、外键、`trusted_schema = OFF`、`synchronous = FULL`、DSH Novel application id 与 strict tables。

浏览器 Consumer 增加有边界的项目级资产列表、章节读取、仅正文的版本保护保存与选区冻结方法。正文保存保留精确解析出的 Frontmatter 前缀，校验生成后的完整文件，同时要求当前基础 Revision 与 Provider 内部 `FsVersion` 一致，并且只在文件系统发布成功后记录新 Revision。SelectionRef 在一个已保留 Revision 上按 Unicode code-point 边界冻结非空 UTF-16 范围；引用哈希、有边界的上下文和预览均从该不可变正文派生。PR2 不加入提示上下文、模型工具、ChangeSet 持久化或工作台布局。

## PR3 Agent 原生 MVP 切片

PR3 增加历史 Schema 版本二，其中包含持久单资产 ChangeSet 和 apply journal。面向模型的 `novel_list` 与 `novel_get` 提供有边界的目录发现和精确读取；`novel_propose_changes` 可以创建一个绑定精确 Revision 的 `replace-text` 提案，但不能应用它。应用与拒绝是只面向浏览器的 Remote 决策，并由被寻址 Session 授权。应用会在带保护文件发布前写入 journal，之后记录 `agent-apply` Revision，并在项目重开时通过比较精确 before、after 或第三种分歧 hash 恢复 `applying` 记录。

第一版 SelectionRef 策略仍是绑定 Revision 的正文 UTF-16 偏移、quote hash、可选有界 prefix 与 suffix，不使用持久 Block id。Client 通过 Repository 保存脏章节后再捕获选区，从而实现 Context Commit Barrier。它把包含规范 `dsh-novel:` URI 的可读 Markdown mention 放入普通 Composer。

`NovelContextResolver` 在 `agent/pre-step` 运行，从直接用户消息解析规范 mention，只解析已保留的精确 Revision，并返回可读直接消息以及紧随其后、来源类型为 `novel-context` 的不可变 `user/message`。该消息包含安全序列化的不可信创作资料，并由普通 Agent loop 追加，因此回放不会重新读取可变文件。一个 Session 绑定到第一个被引用 Project。

显式 Novel Studio overlay 只在该组合中禁用普通 `ui-layout` 根占位者。`novel-workbench` 成为唯一根占位者，并声明原生 DSH 侧栏、对话、详情、overlay、章节浏览器和正文画布插槽。已发布 `web` 与 `headless` 组合不包含这些包。浏览器 MVP 把 Agent 对话放在左侧，把浏览器与正文画布放在右侧，并渲染一个章节编辑器、可见 Context Tray，以及带接受和拒绝动作的持久 ChangeSet Diff 卡片。

PR3 不添加文件 watcher 或浏览器失效事件流。Repository 调用会协调外部文件，接受 ChangeSet 后会显式重新获取工作台数据。Block id、自动保存节奏、搜索、更多资产类型、多资产变更、自动合并、已发布 CLI Profile template 和多 Agent 编排均暂缓。

## PR4 资产类型内核切片

PR4 用两个随 effect 生命周期管理的 Registry，替换分散在本地 Repository、上下文解析器、Remote 投影和浏览器画布中的章节专用分派。Host `ctx.novelAssetTypes` 拥有名称唯一的资产定义；Client `ctx.novelAssetRenderers` 拥有名称唯一的编辑器与 Diff Renderer。重复注册在加载时失败，dispose 会移除精确贡献；作者资产缺少所需 Host 或 Client 贡献时明确失败，不回退到通用 JSON 或文本编辑器。

每个 Host 定义声明 Frontmatter 类型、可接受的内容根与扩展名、解析后的内容值、模型投影、选区校验、作者保存物化、持久操作解码和完整 ChangeSet 物化。Repository 继续拥有文件 containment、字节上限、Revision 父链、带守卫发布、ChangeSet 授权与崩溃恢复；类型定义绝不执行文件系统或 SQLite I/O。历史 Schema 版本三随每个 ChangeSet 记录目标资产类型，因此重放会通过同一个已注册定义校验持久操作，而不是根据可变当前文件猜测。

浏览器 Remote 为 Asset 内容、保存请求、selector 和 ChangeSet operation 暴露同一个有边界、无损的 JSON 信封。Host 与 Client 注册表拥有精确类型语义，因此新增类型不会扩展生成的 Remote 方法集合。根工作台按文档声明类型选择 Renderer，并把保存、Context Commit Barrier、Agent 引用插入与审阅授权保留在共享画布中。首个 `manuscript.chapter` Host 定义和 Client Renderer 保持 PR3 的文本编辑器、UTF-16 选区与 `replace-text` 行为。后续资产包可以增加 Host 定义与 Client Renderer，无需修改本地 Repository、通用 Novel 工具、Remote Gateway 或工作台根布局。

PR4 不增加另一种作者资产。`planning.outline` 将作为首个验证：注册 API 能支持结构化内容值、节点选区、类型化操作和非文本 Diff，而无需扩大共享 Service。

## 范围与不变量

- `ProjectId`、`AssetId`、`RevisionId`、`SelectionRefId` 和 `ChangeSetId` 都是不透明品牌 id。路径、标题、顺序或数据库行号绝不成为身份。
- 每个 Workspace 根目录最多包含一个版本一小说项目，由根目录的 `novel.yaml` 声明。每个作者资产占用一个文件。系列、多 Book Workspace 和跨项目引用均推迟处理。
- Frontmatter 中的 `novel.type` 是语义权威。扩展名选择解析器，目录只提供组织建议；目录和文件名都不能覆盖已声明类型。
- 当前作者内容字节与作者维护元数据只有一个权威：资产文件。当前内容不会被复制成一份可独立编辑的 SQLite head。
- 每个 Revision 都不可变，并保存精确 UTF-8 序列化文件快照及其内容哈希、父 Revision、来源和资产身份。实时 `FsVersion` 是 compare-and-swap 守卫，不是持久 Revision id。
- 每项源于模型的正式资产修改都从绑定一个基础 Revision 的类型化 ChangeSet 开始。版本一最多应用一个 Asset，绝不会把操作静默重定位到较新的 Revision。
- 每个模型可见 Novel 上下文块都作为带身份、不可变的 `user/message` 追加。可变最新文件、单独哈希、Session Projection 或客户端缓存都不能用于重建请求。
- 所有资产路径都必须解析到已配置项目根目录之下，并通过 `ctx.fs.contains()` 检查。已配置的 `cwd` 不视为 containment。
- 浏览器推送只携带 id 和 Revision 失效通知，不携带完整正文。重连或遇到未知事件时，客户端重新获取权威状态。
- 版本一支持每个项目一个 DSH Host 写入者，不承诺跨进程 exactly-once、远程后端一致性或外部并发写入无损。

## 权威矩阵

| 数据 | 权威 | 派生或缓存形式 | 恢复规则 |
| --- | --- | --- | --- |
| 项目身份、格式版本、内容根目录 | `novel.yaml` | Workspace 识别结果 | 重新读取文件；配置损坏时快速失败 |
| 当前类型化 Asset 内容与作者元数据 | 资产 Markdown/YAML 文件和 Frontmatter | 已解析 `AssetSnapshot` | 重新读取精确字节；绝不从索引重建当前作者内容 |
| 资产路径查找与类型目录 | 项目扫描 | 内存目录；未来 `.novel/index.sqlite` | 删除并重建；重复 id 阻止修改 |
| 不可变 Revision 历史 | `.novel/history.sqlite` | 读取缓存 | 显式迁移或拒绝读写打开；绝不自动重置 |
| ChangeSet 与应用授权 | `.novel/history.sqlite` | 工具结果元数据和浏览器缓存 | 按 `ChangeSetId` 重新获取；幂等回放状态转换 |
| 进行中的文件/数据库提交 | `.novel/history.sqlite` 中的应用日志 | 实时操作句柄 | 打开项目时核对精确 before/after 哈希 |
| 精确模型可见 Novel 上下文 | DSH `user/message` 事件 | Context Tray 和 transcript 行 | 回放已记录内容；绝不重读可变最新资产 |
| 当前标签页、光标、面板尺寸、未提交视图状态 | 客户端运行时 | 可选本地 UI 持久化 | 可以丢弃，不改变作者内容 |

## 项目与资产格式

`novel.yaml` 是项目标记和带版本的格式声明，不是第二份资产 manifest（元数据清单）。它不枚举每个资产文件。

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
```

版本一章节资产使用带最小 YAML Frontmatter 的 UTF-8 Markdown。Revision id、文件版本、字数、推断提及、最近打开状态和 Agent 执行事实都不进入 Frontmatter。

```markdown
---
novel:
  schema: 1
  id: asset_chapter_12
  type: manuscript.chapter
  title: Chapter 12
  status: drafting
---

The rain had already hidden the harbor lights.
```

移动或重命名文件不会改变 Asset，因为 Frontmatter id 保持稳定。重复 id、不支持的 schema、损坏的 Frontmatter、位于已声明根目录之外的路径，或逃出项目范围的符号链接都会产生显式诊断，并阻止对受影响项目的正式修改。Repository 在尝试修复时不会重写损坏文件。

`.novel/history.sqlite` 从第一个实现版本开始拥有自己的 schema 版本和有序迁移。遇到较新的、不受支持的历史 schema 时，系统以只读模式打开或显式失败；绝不能把它当作派生索引删除。WAL 和伴随文件遵循 SQLite 生命周期，并排除在资产扫描之外。项目模板建议 Git 忽略 SQLite 运行时文件，因为二进制合并不受支持；复制完整项目目录仍会携带本地历史。

## 领域身份与版本值

Service Definition 拥有词汇；本地 Service Provider 拥有解析、containment、SQLite 和文件系统发布；工具、上下文解析、Remote 方法和浏览器 UI 是 Consumer。

```ts ignore-check
type ContentHash = `sha256:${string}`

interface Asset {
  readonly id: AssetId
  readonly projectId: ProjectId
  readonly type: NovelAssetType
  readonly projectRelativePath: string
}

interface AssetSnapshot {
  readonly asset: Asset
  readonly revisionId: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly content: NovelAssetContent
}

interface AssetRevision {
  readonly id: RevisionId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly parentRevisionId?: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly origin: 'initial-scan' | 'user-edit' | 'agent-apply' | 'external-edit'
  readonly createdAt: string
}

interface SelectionRef {
  readonly version: 1
  readonly id: SelectionRefId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: NovelSelector
  readonly preview?: string
}

interface TextRangeSelector {
  readonly kind: 'text-range'
  readonly startUtf16: number
  readonly endUtf16: number
  readonly quoteHash: ContentHash
  readonly prefix?: string
  readonly suffix?: string
}

interface ChangeSet {
  readonly id: ChangeSetId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly assetType: NovelAssetType
  readonly baseRevisionId: RevisionId
  readonly operations: readonly NovelOperation[]
  readonly actor:
    | { readonly kind: 'agent'; readonly sessionId: SessionId }
    | { readonly kind: 'user'; readonly sessionId?: SessionId }
  readonly summary: string
  readonly status: 'proposed' | 'applying' | 'applied' | 'rejected' | 'conflicted'
}
```

`Asset` 是当前扫描得到的目录值：路径属于可变的组织数据，而品牌化 id 在重命名后仍保持身份。`AssetSnapshot` 是绑定一个已保留 Revision 的不可变解析读取模型；`frontmatter` 与类型化 `content` 都从 `serializedUtf8` 派生，绝不是独立权威。Repository 会先把当前文件字节核对为 Revision，再暴露绑定 Revision 的 snapshot。提供方本地 `FsVersion` 只保留在用于带守卫发布的内部实时观察中；它既不持久化，也不跨 Remote 发送。

Revision id 是与内容无关的不透明身份。版本一把每个内容哈希和引文哈希编码为 `sha256:` 加恰好 64 位小写十六进制字符，输入是相应字段命名的精确 UTF-8 字节，因此日志比较在重启和不同实现之间保持稳定。系统保留完整序列化快照，因为正确性和还原能力比增量压缩更重要。保留策略、压缩、导出和去重需要后续决策，并明确用户数据策略。

ChangeSet 操作按资产类型区分，由该类型注册的适配器验证。初始 `manuscript.chapter` 操作替换一个精确正文范围。ChangeSet 进入 `applying` 前，Repository 会生成并验证完整候选 after 字节；模型不能提交任意 SQL、把文件路径当作权威，或提交未验证的 JSON Patch。

## 选区引用

版本一文本范围使用一个不可变 Revision 的精确 Markdown 正文上的 UTF-16 code-unit offset。编辑器必须拒绝位于 surrogate pair 内部的边界。`quoteHash` 验证选中文本，`prefix`、`suffix` 和 `preview` 只用于诊断与展示，绝不授权模糊重定位。

Composer 提交指向脏编辑器内容的引用前，浏览器通过 Novel Remote 调用 Repository flush 作者草稿。flush 使用带守卫的文件系统修改写入用户当前资产，记录 `user-edit` Revision，并返回绑定 Revision 的 `SelectionRef`。flush 失败时不会发送提示词。

允许读取旧的不可变 SelectionRef，并在界面中明确标记为旧 Revision。只有该 Revision 仍是当前已核对 head 时，才能应用基于它的 ChangeSet。存在更新 head 时返回 `conflicted`；版本一不执行模糊匹配、自动 rebase 或三方合并。永久段落或块 id 推迟到独立决策，以定义外部编辑器复制、删除和修复语义。

## 上下文准入与 Session 历史

Composer 把显式资产和选区 chip 序列化为直接用户消息中的规范、带版本 `dsh-novel:` 引用，并继续调用普通 `session.prompt`。版本一不增加 `novel.prompt`，也不把 `agent.inject()` 与 follow-up 配对。

`NovelContextResolver` 沿用现有 Session reference 模式。在 `agent/pre-step` 中，当前直接消息被领取后，它解析并移除规范引用，验证每个引用都属于同一个 Project 且指向保留的不可变 Revision，执行可配置的数量与字节/token 预算，并返回可读直接消息，随后紧跟一条冻结 Novel 上下文消息。agent loop 在同一个 Step 中把两条消息都追加为 `user/message` 事件。

上下文消息具有可合并扩展的 source，例如 `{ kind: 'novel-context', form: 'catalog', version: 1, projectId, references }`。其内容包含向模型展示的精确、提供方无关文本，而不只是 id 或哈希。它把作者内容框定为不可信参考材料，使用 tag-safe、确定性的 JSON 序列化，并且绝不允许正文关闭指令分隔符。Revision 缺失、跨项目引用、选择器损坏和预算超限都会在模型请求前失败；Resolver 绝不会替换为最新文件。

Session 中第一条被接受的 `novel-context` 消息派生出其 Novel Project 绑定。后续 Novel 上下文必须属于同一 Project。普通 Session 保持未绑定状态，默认 Web UI 即使不加载 Novel 工作台也能渲染通用上下文行。Session Projection 后续只能暴露小型派生绑定或固定 id 状态，绝不携带资产正文或 Revision 快照。

## ChangeSet 应用与崩溃恢复

提出 ChangeSet 会持久化记录，但不会修改资产文件。应用操作需要用户通过 Novel Remote 明确执行。版本一使用以下可恢复单资产提交：

1. 加载已提出的 ChangeSet、基础 Revision、当前资产字节与当前 `FsVersion`；非 `proposed` 或未授权状态会被拒绝。
2. 验证当前字节与基础 Revision 相同，且每个类型化操作都指向该 Revision；生成并验证完整 after 字节。
3. 在一次 SQLite 事务中，把 ChangeSet 设为 `applying`，并在日志中持久化精确 before/after 哈希、after 字节、目标身份和应用授权。
4. 在 Repository 的每项目写入队列中，使用 `ctx.fs.writeText(..., { kind: 'replaceIfVersion', version })` 发布 after 字节。
5. 在一次 SQLite 事务中，插入不可变 `agent-apply` Revision，更新已核对 head 投影，清除日志项，并把 ChangeSet 设为 `applied`。

系统不会把该操作描述为跨介质原子事务。项目打开和显式刷新会在接受新写入前核对每个 `applying` 日志项：

- 如果文件哈希等于记录的 after 哈希，则无需重写文件，直接完成 Revision 和 `applied` 状态。
- 如果文件哈希等于记录的 before 哈希，则重试已经授权的带守卫发布，然后完成提交。
- 如果文件哈希与两者都不相等，则保留两份快照，并把 ChangeSet 标记为 `conflicted`；绝不自动写入。

发布前出现 `FS_STALE_VERSION` 时，Repository 也会把状态设为 `conflicted`，并把观察到的当前字节记录为 `external-edit` 或 `user-edit` Revision。`apply`、`reject`、恢复和回放按 `ChangeSetId` 保持幂等；重复请求会报告持久终态。只有 `proposed` 状态可以拒绝，且拒绝不会删除 Revision 或 ChangeSet 证据。

## Profile 与包隔离

开发首先使用私有 `@deepseek-ai/dsh-experimental-*` 包和显式初始化的 `novel-studio` Profile。发布包不依赖实验包。在增加已发布 Profile 模板前，需要把完整能力提升到产品角色包组。

该 Profile 组合 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 和 Novel bundle。默认 `web` 与 `headless` Profile 不加载 Repository、Novel 工具、Novel Remote 或 Novel UI，但可以继续列出现有 Session 级 `novel` Agent Preset。

源码 checkout 的开发路径会把 Web App 与 Novel bundle 安装到这个显式 Profile 中，并让 Novel 层位于最后。单独使用 Cordis `--patch` 不是有效安装路径：patch 能插入配置行，却不会把这些配置行命名的包加入 Profile 模块解析闭包。本地 `link:` 开发还要直接链接私有 Novel 运行时包，因为 pnpm 不会安装目录链接背后的 workspace 依赖。

CLI 会把自带 Preset 根追加在 Profile 组合贡献的全部根之后，而不会替换 bundle 自有根；否则 Profile 可以选择一个 bundle 自有默认 Preset，Session 创建器却无法解析它。

首个技术切片可以在现有对话界面中注册 Novel view，并在输入 dock 中注册 Context Tray。这只是测试支架，不是最终产品布局。在把垂直链路称作小说工作台前，`novel-studio` 会用该 Profile 唯一的 root occupant 替换 `ui-layout`，在已声明的左侧 `conversation` slot 中保留现有 Conversation 组件，并在其右侧增加项目级 `novel.explorer` 与 `novel.canvas` slot。切换 Session 不会卸载已打开的正文画布。

版本一不增加通用 Router 或 Workbench 注册表。这些抽象需要第二个具体工作台 Consumer。工作台选择属于 Profile，Agent persona 与工具组合属于 Session Preset。

## 模型工具与浏览器展示

首批模型 Consumer 是 `novel_list`、`novel_get` 和 `novel_propose_changes`。`novel_list` 发现当前 Session Project，返回带规范精确 Revision 引用的当前类型化 Asset 元数据，但不返回作者内容。`novel_get` 读取已验证 Asset 或 Selection 引用，并返回精确的已注册模型投影以及该类型的提案说明。`novel_propose_changes` 接收绑定 Revision、由类型定义的 JSON operation 信封；已注册 Host 定义会校验并补全必要的完整性数据，再由 Repository 记录 ChangeSet。工具返回稳定 ChangeSet id，但不能应用提案。

ChangeSet id 和目标概述存入可 JSON 序列化的工具 `meta`。Novel 客户端为 `novel_propose_changes` 注册带键 `tool.call.toolview` 配置项，在回放时渲染持久提案，并调用 Novel Remote 方法来显示、应用或拒绝。缺少客户端插件时，普通通用工具行仍作为可读回退。浏览器失效事件包含项目、资产、Revision 或 ChangeSet id，并显式进入 Remote event allowlist；客户端收到事件或重连后重新获取。

安全 Novel Preset 会移除用于正式资产的原始模型侧 `write` 和 `edit`。研究和开发 Preset 可以暴露 `read`、`grep`、shell 或原始修改工具，但 Repository 权限、陈旧检查和 ChangeSet 应用绝不依赖 `toolFilter` 或提示词策略。外部或高权限原始写入会在下一次核对边界显示为文件分歧。

感知 Session 的 Remote Consumer 会用被寻址 Agent Session 解析 `ctx.sandboxPolicy`，并把逐调用策略传入资产目录协调、当前 head 读取、作者保存与 ChangeSet 应用。本地 Repository 会把该策略继续传给每次文件系统发布和 apply journal 恢复写入。Host 进程工作目录只作为无 Agent 调用的 fallback；它不得拒绝或放宽位于其他位置的 Session 工作区。

## 推迟工作

- 其他资产类型，包括大纲、人物、灵感、场景、时间线、关系和视图定义；PR4 提供注册路径，但不增加额外类型。
- 持久可丢弃搜索索引、全文搜索、语义搜索、推断提及和反向关系。`novel_list` 只是有边界的目录发现，不满足这些搜索能力。
- 文件监听、远程文件系统一致性、多个并发 Host 写入者、协作和 CRDT 位置。
- 永久块 id、模糊重定位、三方合并、多资产 ChangeSet、分支和跨项目引用。
- 系列与每 Workspace 多 Book、发布适配器、导入导出和历史保留控制。
- Role Profile、Task 与 Blackboard 领域、`novel_delegate`、自动工作流和多 Agent 协作。
- 由 Default、Code、Novel 或未来工作台共享的通用 Router 或 Workbench 注册表。

## 与现有决策的关系

本提案使用 [Profile 插件 bundle 取代固定界面 overlay](../../implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)中的 Profile bundle 作为隔离单元，并遵循[文件系统能力 seam](../../implemented/architecture/2026-06-17-filesystem-capability-seam.zh.md)中的 Service Definition / Service Provider / Consumer 划分。它通过[文件上下文 event gate](../../implemented/architecture/2026-06-26-file-context-as-event-gate.zh.md)使用带守卫的 `ctx.fs` 修改，但不把通用文件系统工具视为 Novel 权威。

冻结 Novel 上下文遵循[可重建请求](../../implemented/architecture/2026-07-05-reconstructable-requests.zh.md)和[带身份的不可变消息值](../../implemented/architecture/2026-07-28-identified-immutable-message-values.zh.md)。浏览器调用使用 [Typert Remote 方法调用](../../implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)，ChangeSet 行则遵循[客户端工具展示所有权](../../implemented/architecture/2026-08-08-client-tool-presentation-ownership.zh.md)。

通用[领域 KV 存储提案](2026-07-24-domain-kv-storage-and-workspace.zh.md)仍然适合轻量注册信息和小型元数据。Novel 历史有意使用独立数据库，因为它需要通用记录层未承诺的迁移、事务、有序状态转换、不可变快照和索引查询。

## 考虑过的替代方案

**让 SQLite 成为当前正文权威，再导出 Markdown。** 这会得到单一事务数据库，却削弱外部编辑器、Git 和纯文件可移植性，而这些都是明确产品要求。因此，文件继续作为当前作者内容的权威。

**把 Revision 和 ChangeSet 记录存入 `storageDomain`。** 它的记录 KV 约定没有跨表事务、二级索引或迁移协议。包装它会增加第二层事务逻辑，却无法删除 Novel 自己的恢复代码，因此 Novel Repository 直接拥有 SQLite schema。

**让 Agent 使用通用 `write` / `edit`，事后重建 diff。** 写后护栏介入太晚，无法把修改绑定到基础 Revision，也无法让未经接受的正文不进入作者文件。因此，正式模型修改通过 ChangeSet 进入。

**立即为每一章添加隐藏段落 id。** 永久 id 有利于后续重定位，但会在当前 Revision 选区需要它之前引入复制、删除和外部编辑器修复语义。版本一引用保持 Revision 绑定，未来 selector kind 可以兼容地增加块身份。

**增加调用 `agent.inject()` 后再调用 `followup()` 的 `novel.prompt`。** 两个 inbox 位置不是一个语义对，注入上下文可能被另一个 Step 领取。在直接提示词被领取后，于 `agent/pre-step` 解析引用，既沿用现有 DSH 扩展模式，也会记录一批精确请求。

**替换默认 Web root，或先构建通用 Workbench 注册表。** 全局替换会让无关 DSH Session 依赖 Novel UI，而注册表当前只有一个新 Consumer。独立 Profile 立即隔离产品，并把通用化推迟到出现证据之后。

**在首个切片实现多资产事务与多 Agent 编排。** 两者都会在语义编辑闭环得到验证前成倍增加恢复和所有权状态。版本一先建立单资产持久边界，后续编排再消费它。

## 验收标准

- 提议的实现包含完整 `ctx.novelRepository` 能力 seam，具有可独立测试的 Service Definition、本地 Service Provider 与 Consumer；每项注册在 HMR 和插件卸载时都能正确 dispose。
- 真实 Profile 组合测试证明 `web` 与 `headless` 不加载 Novel Repository、Remote、工作台 UI 或 Novel 工具，而 `novel-studio` 加载预期精确 roster，且不替换现有 Session 级 Preset 约定。
- 项目扫描可以识别一个 `manuscript.chapter`，在重命名后保留身份，拒绝重复 id 与逃逸路径，报告损坏 Frontmatter 而不重写，并从文件重建全部派生目录值。
- Revision 测试证明精确 UTF-8 快照保留、父级连续性、内容哈希相等性、显式 schema 迁移或拒绝，以及不会自动重置 `.novel/history.sqlite`。
- Selection 测试覆盖中文、emoji、CRLF 输入、surrogate pair 边界、脏草稿 flush、旧 Revision 展示、quote hash 不匹配，以及不使用模糊重定位的快速失败陈旧应用。
- Context 测试证明规范引用只解析到保留的不可变 Revision，跨项目和超限上下文在模型调用前失败，精确安全序列化内容进入 `user/message`，并且回放、resume、fork 和 compaction 绝不重读可变最新文件。
- ChangeSet 测试证明提出提案不会修改文件，未授权或陈旧应用无法发布，apply/reject/retry 保持幂等，并且在日志提交前、文件发布前、文件发布后和最终 SQLite 提交前注入崩溃时，状态都会收敛到已记录结果。
- 与用户或外部修改竞争的带守卫写入会保留更新文件，记录分歧，并让 Agent 提案保持 `conflicted`；任何测试都不允许 last-writer-wins 覆盖。
- 浏览器测试证明资产与 ChangeSet 失效通知会重新获取权威状态，重连不需要事件回放，带键工具展示会从持久 `meta` 恢复卡片，并且缺少 Novel 展示时回退到通用工具行。
- 无密钥可运行应用快照覆盖技术 Novel view 和最终 `novel-studio` root 组合，包括选中范围、披露的冻结上下文、ChangeSet 卡片、diff 审阅、接受、陈旧冲突和重启恢复。默认 Web 快照除独立且有意的 Preset roster 事实外保持不变。
- 在提案移动到 `implemented` 前，文档会记录磁盘格式、迁移策略、单写入者限制、安全框定、token 影响、KV Cache 影响和运维恢复流程。

## 风险

文件与 SQLite 无法共享一个原子事务。应用日志让提交可恢复并可收敛，但每条新写入路径都必须维持既定顺序和哈希检查；绕过 Repository 会重新引入歧义。

单 Host 写入者限制无法阻止外部编辑器或第二进程在观察与发布之间写入。`FsVersion` 可以保护一个提供方内部的最终发布，核对也会保留分歧字节，但版本一不承诺跨进程协调。

完整 Revision 快照会随长篇小说快速增长。过早使用增量存储会让恢复与损坏修复更复杂，因此版本一接受空间成本，把可度量的保留策略推迟。

UTF-16 正文 offset 与浏览器和 TypeScript 运行时一致，但需要显式处理换行和 surrogate。未来任何非 JavaScript 客户端必须实现同一个 selector 版本，不能重新解释 offset。

Novel 文件是不可信模型上下文。错误框定可能让引用正文或资料变成指令，过量自动上下文也可能耗尽请求预算。Resolver 必须在大小超限时快速失败，执行确定性转义，并披露每个包含的 Revision。

独立 Profile 会重复部分 shell 组合，也会推迟应用内无缝切换。为了保持默认 DSH 稳定，并避免推测性的全局 Workbench 抽象，本提案接受这一成本。
