# Agent 原生小说工作台 MVP

[English](novel-workbench.md) | 中文

实验性小说工作台让作者与 Agent 通过同一个稳定语义身份读取和修改类型化正文与大纲 Asset。它在显式隔离的 Profile overlay 中组合文件化 Asset、不可变 SQLite Revision、精确类型化选区、持久 Session 上下文、只提案的模型工具、可审阅 ChangeSet 与专用浏览器工作台。权威划分和崩溃恢复决策由[小说工作台 Agent Note（Agent 决策记录）](../../.agents/notes/proposed/architecture/2026-08-22-novel-workbench-domain-and-commit-protocol.zh.md)负责。

## 项目声明

Novel Project 是包含普通 UTF-8 `novel.yaml` 文件的 Workspace 根目录。该清单是项目标识、格式版本、标题、命名内容根目录以及可选精确类型 Asset 顺序的权威；除稳定 ID 顺序序列外，它不枚举作者文件。

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
  planning: planning
```

Schema 版本 1 要求 `kind: novel-project`、整数 `schema: 1`、非空 `id` 和 `title`，以及包含 `manuscript` 的 `contentRoots` mapping。`planning` 是可选项，但声明后必须解析到项目内部的既有目录。本地提供方拒绝格式错误或有歧义的 YAML、无效 UTF-8、不支持的 schema、缺失的已声明根目录、悬空链接，以及逃出 Project 根目录的规范路径。

## Asset 与 Revision 权威

[`@deepseek-ai/dsh-experimental-novel-repository`](../../packages/experimental/novel-repository) 定义与提供方无关的 `ctx.novelRepository` seam 和 effect 作用域内的 `ctx.novelAssetTypes` 注册表。[`@deepseek-ai/dsh-experimental-novel-repository-local`](../../packages/experimental/novel-repository-local) 只扫描已安装类型定义认领的根目录和扩展名。章节通过严格 Markdown Frontmatter 成为 Asset；[`@deepseek-ai/dsh-experimental-novel-asset-outline`](../../packages/experimental/novel-asset-outline) 独立贡献自由 Markdown 书纲/卷纲、章纲、项目级唯一的本书概述与本书风格，而不向共享 Repository 增加类型分支。

```markdown
---
novel:
  schema: 1
  id: chapter_001
  type: manuscript.chapter
  title: Chapter One
---

Authored manuscript body.
```

```markdown
---
novel:
  schema: 1
  id: outline_main
  type: planning.outline
  title: Main Outline
  level: book
---

# Act One

The protagonist reaches White Harbor.
```

`book.brief` 与 `book.style-profile` 使用同样的自由 Markdown 正文和精确文本 operation，没有语义父级，并声明注册表通用的 `projectSingleton` 契约。因此 Repository 扫描与类型化创建都会拒绝同一精确类型的第二份 Asset，而无需硬编码类型名称。它们物理上位于已声明的 `planning` 根，Explorer 则把它们投影到逻辑“本书”分组。

项目文件是当前作者内容的权威。`.novel/history.sqlite` 保存精确的不可变 Revision 字节、Asset head、ChangeSet 与 apply journal；它不会取代文件成为当前真相源。文件改名保留 Asset 身份，外部字节变化在 reconcile 时创建 `external-edit` Revision。每次人类保存都由精确类型定义物化并重新解析，而且要求画面上的 base Revision 与文件系统版本仍然为当前值。

## 选区与 Session 上下文

第一版为当前全部自由正文 Asset 类型冻结带 UTF-16 offset 与 quote hash 的非空文本范围。每个选区都绑定一个已保留 Revision，绝不静默前移到可变的最新内容。浏览器 context barrier 先保存脏的类型化草稿，再捕获新 Revision 上的精确选区，最后把规范 `dsh-novel:` mention 插入普通 DSH Composer。

[`@deepseek-ai/dsh-experimental-novel-context`](../../packages/experimental/novel-context) 在 `agent/pre-step` 解析这些 mention。它保留人类可读消息，并附加一个 source kind 为 `novel-context` 的不可变 `user/message`。该消息以确定性、明确不受信任的 JSON 保存精确 Revision，让 Session replay 能重建模型实际看到的内容。第一次 Novel context 会把该 Session 绑定到一个 Project。

可见 workset 是协调状态，而不是始终注入 Prompt 的内容包。版本二的 `follow` 指针只保存当前 Asset 身份，在编译一轮请求时才解析已保存 head；`pinned` 引用仍绑定精确 Revision。普通对话只实体化 Composer 中显式引用的选区，follow 与 pinned 项以紧凑坐标表示。

任务工作流以封闭 policy 与精确目标调用同一个 Host Context Compiler。显式 Novel Skill metadata 或固定审查/定稿入口分别选择章节写作、选区任务、大纲编辑、章节审查与偏好学习 policy，绝不从自然语言中猜测意图。Policy 只能增加章纲、本书概述、本书风格或大纲亲属等确定性的类型化关系。必需正文超出预算时关闭失败；可选材料则降级为坐标。最终版本三 Context Manifest 会在进入 Session Log 前，以确定性 ID 记录 policy、原因、projection、精确 Revision、内容 hash 与模型可见字节数。

## 提案、审阅与恢复

[`@deepseek-ai/dsh-experimental-tool-novel`](../../packages/experimental/tool-novel) 在包自带 Preset 中暴露需用户批准的 `novel_initialize_project`、`novel_list`、`novel_search`、`novel_create`、`novel_get`、显式只读 `novel_get_analysis`、`novel_propose_changes` 和纯展示工具 `novel_present`。持久分析报告不进入普通上下文或作者 Asset 发现目录；只有作者询问时，Agent 才按章节精确 Revision 读取。初始化工具与浏览器空状态调用同一个 Repository 操作：它保留已有文件、建立最小内容根，并最后发布 `novel.yaml` 作为激活标记；现有非法 manifest 或内容根路径冲突会失败，不会被替换。目录发现会返回规范精确 Revision 引用与已注册创建契约。新章节通过一次 `novel_create` 调用同时提交标题与完整正文；Agent 不要求另行建立空容器。若空章节已经存在，一个提案可以把 `update-title` 与 UTF-16 offset 0 的 `insert-text` 组合；改写非空文字则使用 `replace-text`。已注册类型只序列化一次标题与正文并生成一个 Revision。精确读取使用各类型的确定性模型投影与提案说明。固定工作流接收 Compiler 冻结的相关材料，探索式读取则继续作为 Session 历史中可见的显式工具调用。提案由匹配定义校验精确、归类型所有的操作，再持久创建 ChangeSet，但不改作者文件。`novel_present` 只通过类型化工具结果 metadata 打开或关闭整个工作台。模型没有 apply 工具，也不能宣称已经发布修改。

浏览器把 ChangeSet 读成行内 Diff 卡片。接受或拒绝都是显式、归 Session 所有的 Remote 操作。Apply 在接触文件前，把精确前后字节、hash、授权与预期结果 Revision 以 `applying` 状态写入 journal。项目重开时，after hash 会完成提交，before hash 会重试受保护写入，任何第三种 hash 都会变成 `conflicted`，且不覆盖作者文件。

## Profile 隔离

[`@deepseek-ai/dsh-experimental-novel-studio`](../../packages/experimental/novel-studio) 是私有 overlay，组合在 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 之后。原生 `ui-layout` 始终是唯一根与布局服务拥有者，并暴露按 selector 路由的 `shell.workbench` chain。[`@deepseek-ai/dsh-experimental-novel-workbench`](../../packages/experimental/novel-workbench) 只向该 chain 贡献纯 `novel` surface，保留原生侧栏、对话、详情、设置、模型选择、工具渲染与 overlay surface，并仅在它被选中时声明类型化 Asset explorer 与 canvas 插槽。

只有 Agent preset 精确为 `novel-workbench` 的 Session 才会在 access/plan 控件旁得到 Composer 开关，并可选中小说 surface。打开后，AppFrame 把 Agent 对话放在左侧，把 Asset 浏览器与画布放在右侧；作者可从同一开关收起整个工作台，切到其他 preset 也会立即恢复普通 tracks。类型化 `novel_present` 结果可请求同一切换，不解析 Agent 回复文字。默认 `web` 与 `headless` Profile 模板不包含这些实验性包；overlay 的安全 preset 不包含 shell 或通用文件系统修改能力。

浏览器保存与 ChangeSet 应用会解析被寻址 Session 的 sandbox policy，并把它传入 Repository 协调与发布。Novel Project 因此可以位于 Host 进程工作目录之外，同时仍被限制在 Session 工作区边界内。

## 当前限制

当前切片支持 `manuscript.chapter`、`planning.outline`、`planning.chapter-outline`、`book.brief` 与 `book.style-profile`、一个活动类型化选区、单 Asset ChangeSet 中的一项类型化操作、审查门控的章节定稿，以及草稿/终稿偏好学习。持久正文 block id、人物、灵感、语义检索、Story State、生成式摘要、关系、文件监听、自动 rebase、多 Asset 事务、更丰富的视图与通用多 Agent 编排仍暂缓。任务感知 Compiler 当前有意只使用确定性的类型关系，但它的显式 policy 请求与版本化 Manifest 已把这些未来选择器保留在一个可替换边界之后。Repository 只在调用边界 reconcile，支持的写入模型是单 Host 进程。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxnovelanalysis--novelanalysis"></a>

### `ctx.novelAnalysis` — `NovelAnalysis`

Host coordinator for exact-Revision scans and read-only chapter review.

```ts cordis-catalog
/**
 * Deterministically scan and persist one exact chapter Revision.
 * @param agent - owning Session used to locate and authorize the Novel Project.
 * @param assetId - exact manuscript chapter identity.
 * @param revisionId - retained Revision to scan.
 * @param signal - optional caller cancellation before persistence.
 * @returns the upserted exact-Revision report.
 */
async scanChapter( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal?: AbortSignal, ): Promise<NovelAnalysisReport>

/**
 * Run the fixed read-only chapter reviewer and persist valid structured output.
 * @param agent - owning root Agent and review provenance.
 * @param assetId - exact manuscript chapter identity.
 * @param revisionId - retained Revision to review.
 * @param signal - canonical cancellation for worker startup and execution.
 * @returns the upserted exact-Revision review.
 */
async reviewChapter( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal: AbortSignal, ): Promise<NovelAnalysisReport>

/**
 * Scan one proposal candidate and render bounded deferred model feedback.
 * @param base - exact ChangeSet base snapshot.
 * @param operations - type-validated operations already accepted for proposal.
 * @returns material warning, or `undefined` for non-chapters, small samples, or low risk.
 */
candidateWarning( base: AssetSnapshot, operations: readonly NovelOperation[], ): NovelCandidateAnalysisWarning | undefined
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/novel-analysis/src/index.ts`](../../packages/experimental/novel-analysis/src/index.ts)

<a id="ctxnovelassettypes--novelassettyperegistry"></a>

### `ctx.novelAssetTypes` — `NovelAssetTypeRegistry`

Effect-scoped Host registry of exact authored Asset type definitions.

```ts cordis-catalog
/**
 * Register one exact type for the calling plugin lifetime.
 * @param definition - parser, selection, model, and mutation behavior for one type.
 * @returns an idempotent disposer that removes this exact contribution.
 */
register(definition: NovelAssetTypeDefinition): () => void

/**
 * Resolve one required type definition.
 * @param type - exact authored `novel.type` declaration.
 * @returns the registered definition.
 * @throws {NovelRepositoryError} when the Project declares an unavailable type.
 */
get(type: string): NovelAssetTypeDefinition

/**
 * List definitions in deterministic type order for project scanning.
 * @returns a stable copy of current registrations.
 */
list(): readonly NovelAssetTypeDefinition[]
```

Source: [`packages/experimental/novel-repository/src/asset-types.ts`](../../packages/experimental/novel-repository/src/asset-types.ts)

<a id="ctxnovelcontextresolver--novelcontextresolver"></a>

### `ctx.novelContextResolver` — `NovelContextResolver`

Exact-read Consumer that freezes canonical references before a model step.

```ts cordis-catalog
/**
 * Replace the complete non-prose context workset for one live Session.
 * @param agent - owning Agent whose Session records the whole value.
 * @param workset - exact retained references selected by the browser.
 * @param signal - optional cancellation before validation and append.
 * @returns the detached normalized value now in force.
 */
async replaceWorkset( agent: Agent, workset: NovelContextWorkset, signal?: AbortSignal, ): Promise<NovelContextWorkset>

/**
 * Resolve exact retained Revisions for Novel tools and prompt preparation.
 * @param agent - owning Agent whose Session and working directory bound the request.
 * @param references - canonical exact Asset Revision references to resolve.
 * @param signal - optional cancellation for repository and filesystem work.
 * @returns the validated project plus exact retained reference snapshots.
 */
async resolveReferences( agent: Agent, references: readonly NovelReferenceInput[], signal?: AbortSignal, ): Promise<ResolvedNovelReferences>

/**
 * Prepare readable direct content plus one durable model-visible context message.
 * @param agent - owning Agent whose Session receives the frozen context.
 * @param content - human-authored direct message content to preserve.
 * @param references - exact Asset Revision references to append as untrusted context.
 * @param signal - optional cancellation for reference resolution.
 * @returns preserved direct content and, when referenced, one durable context message.
 */
async prepare( agent: Agent, content: readonly ContentBlock[], references: readonly NovelReferenceInput[], signal?: AbortSignal, ): Promise<PreparedNovelMessage>
```

Types: [Agent](core.zh.md) · [ContentBlock](llm-streaming.zh.md)

Source: [`packages/experimental/novel-context/src/index.ts`](../../packages/experimental/novel-context/src/index.ts)

<a id="ctxnovelrepository--novelrepository-abstract-seam"></a>

### `ctx.novelRepository` — `NovelRepository` (abstract seam)

Provider-neutral access to validated Novel Project declarations.

```ts cordis-catalog
/**
 * Discover and validate the Novel Project rooted at one filesystem target.
 * @param root - Canonical candidate project directory from the active filesystem provider.
 * @param signal - Optional cancellation for all provider I/O.
 * @returns the validated project, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the root or present manifest is invalid or unsupported.
 */
abstract discoverProject(root: FsTarget, signal?: AbortSignal): Promise<NovelProjectSnapshot | undefined>

/**
 * Rebuild the current authored catalog and reconcile exact file bytes into immutable Revisions.
 * @param project - validated Project declaration returned by this provider.
 * @param signal - optional cancellation for filesystem and history work.
 * @param sandboxPolicy - optional per-call write policy used if reconciliation must recover an apply journal.
 * @returns current typed Asset rows in deterministic project-path order.
 */
abstract listAssets( project: NovelProjectSnapshot, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<readonly AssetSummary[]>

/**
 * Search current typed Assets without exposing paths as identity.
 * @param project - validated Project declaration returned by this provider.
 * @param request - bounded text query, optional type allowlist, and result cap.
 * @param signal - optional cancellation for scan and typed model-text extraction.
 * @param sandboxPolicy - optional write policy if catalog reconciliation must recover a journal.
 * @returns deterministically ranked exact current Revision results.
 */
abstract searchAssets( project: NovelProjectSnapshot, request: SearchAssetsRequest, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<readonly AssetSearchResult[]>

/**
 * Create one new typed authored Asset at a provider-owned safe path.
 * @param project - validated Project declaration returned by this provider.
 * @param request - semantic type, title, optional parent, typed content, and actor.
 * @param signal - optional cancellation before filesystem publication.
 * @param sandboxPolicy - optional per-call policy governing file creation.
 * @returns the committed initial Revision of the new Asset.
 */
abstract createAsset( project: NovelProjectSnapshot, request: CreateAssetRequest, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<AssetSnapshot>

/**
 * Read either the reconciled current head or one retained immutable Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable authored asset identity.
 * @param revisionId - exact retained Revision; omission reconciles and returns the current file head.
 * @param signal - optional cancellation for filesystem and history work.
 * @param sandboxPolicy - optional per-call write policy used if current-head reconciliation must recover an apply journal.
 * @returns exact serialized bytes and parsed typed Asset values.
 * @throws {NovelRepositoryError} when the asset or Revision is absent or invalid.
 */
abstract readAsset( project: NovelProjectSnapshot, assetId: AssetId, revisionId?: RevisionId, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<AssetSnapshot>

/**
 * List metadata for every retained Revision of one Asset, newest first.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable authored Asset identity.
 * @param signal - optional cancellation before history access.
 * @returns exact immutable Revision summaries without serialized prose bytes.
 */
abstract listAssetRevisions( project: NovelProjectSnapshot, assetId: AssetId, signal?: AbortSignal, ): Promise<readonly AssetRevisionSummary[]>

/**
 * List generated reports attached to one exact retained Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable authored Asset identity.
 * @param revisionId - exact retained Revision identity.
 * @param signal - optional cancellation before history access.
 * @returns reports in stable report-kind order.
 */
abstract listAnalysisReports( project: NovelProjectSnapshot, assetId: AssetId, revisionId: RevisionId, signal?: AbortSignal, ): Promise<readonly NovelAnalysisReport[]>

/**
 * Atomically replace the successful report for one Revision and report kind.
 * @param project - validated Project declaration returned by this provider.
 * @param request - exact Revision, kind, analyzer identity, provenance, and JSON result.
 * @param signal - optional cancellation before durable publication.
 * @returns the validated persisted report.
 */
abstract putAnalysisReport( project: NovelProjectSnapshot, request: PutNovelAnalysisReportRequest, signal?: AbortSignal, ): Promise<NovelAnalysisReport>

/**
 * Guardedly publish user-authored typed content and retain its exact new Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param request - target, current base Revision, and full typed replacement content.
 * @param signal - optional cancellation before filesystem publication.
 * @param sandboxPolicy - optional per-call policy governing authored-file publication and recovery.
 * @returns the committed exact new head.
 * @throws {NovelRepositoryError} when the base is stale or the resulting asset is invalid.
 */
abstract saveAssetContent( project: NovelProjectSnapshot, request: SaveAssetContentRequest, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<AssetSnapshot>

/**
 * Freeze one exact type-defined selection without rereading mutable latest content.
 * @param project - validated Project declaration returned by this provider.
 * @param request - retained Revision and type-defined selection input to validate.
 * @param signal - optional cancellation for the history read.
 * @returns immutable type-defined selection identity and bounded diagnostics.
 */
abstract captureSelection<Input extends NovelSelectionInput>( project: NovelProjectSnapshot, request: CaptureSelectionRequest<Input>, signal?: AbortSignal, ): Promise<SelectionRef<Input>>

/**
 * Retain one validated proposal without publishing it to authored files.
 * @param project - validated Project declaration returned by this provider.
 * @param request - exact base Revision, typed operation, actor, and review summary.
 * @param signal - optional cancellation before durable proposal retention.
 * @returns the durable proposal-only ChangeSet.
 */
abstract proposeChangeSet( project: NovelProjectSnapshot, request: ProposeChangeSetRequest, signal?: AbortSignal, ): Promise<ChangeSet>

/**
 * Read one durable proposal or terminal ChangeSet.
 * @param project - validated Project declaration returned by this provider.
 * @param changeSetId - durable ChangeSet identity within the Project.
 * @param signal - optional cancellation for history access.
 * @returns the validated durable ChangeSet.
 */
abstract readChangeSet( project: NovelProjectSnapshot, changeSetId: ChangeSetId, signal?: AbortSignal, ): Promise<ChangeSet>

/**
 * Apply one authorized proposal through the crash-recoverable publication protocol.
 * @param project - validated Project declaration returned by this provider.
 * @param changeSetId - durable proposal identity within the Project.
 * @param authorization - explicit Session identity accepting the proposal.
 * @param signal - optional cancellation before authored-file publication begins.
 * @param sandboxPolicy - optional per-call policy governing authored-file publication and recovery.
 * @returns the applied, conflicted, or already terminal ChangeSet.
 */
abstract applyChangeSet( project: NovelProjectSnapshot, changeSetId: ChangeSetId, authorization: ChangeSetAuthorization, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<ChangeSet>

/**
 * Reject one authorized proposal without changing authored files.
 * @param project - validated Project declaration returned by this provider.
 * @param changeSetId - durable proposal identity within the Project.
 * @param authorization - explicit Session identity rejecting the proposal.
 * @param signal - optional cancellation before durable rejection.
 * @returns the rejected or already terminal ChangeSet.
 */
abstract rejectChangeSet( project: NovelProjectSnapshot, changeSetId: ChangeSetId, authorization: ChangeSetAuthorization, signal?: AbortSignal, ): Promise<ChangeSet>
```

Types: [FsTarget](filesystem.zh.md) · [SandboxExecutionPolicy](sandbox.zh.md)

Source: [`packages/experimental/novel-repository/src/index.ts`](../../packages/experimental/novel-repository/src/index.ts)

<a id="ctxnovelrepositoryremote--novelrepositoryremote"></a>

### `ctx.novelRepositoryRemote` — `NovelRepositoryRemote`

Project browser projection consuming the provider-neutral repository service.

```ts cordis-catalog
/**
 * Discover a project at the addressed Agent's Session working directory.
 * @param agent - addressed Agent whose working directory bounds discovery.
 * @param signal - caller cancellation.
 * @returns browser-safe project values, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the Session has no working directory or discovery fails.
 */
@Remote('discover') async discover(agent: Agent, signal: AbortSignal): Promise<NovelProjectDescriptor | undefined>

/**
 * List the reconciled Asset catalog for the addressed Session project.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param signal - caller cancellation.
 * @returns browser-safe current Asset descriptors.
 */
@Remote('assets') async assets(agent: Agent, signal: AbortSignal): Promise<NovelAssetDescriptor[]>

/**
 * Search current typed Assets and return exact current Revision references.
 * @param agent Addressed Agent whose Session selects the Novel Project.
 * @param request Bounded lexical query, optional exact types, and optional result limit.
 * @param signal Caller cancellation while reconciling and searching the catalog.
 * @returns Browser-safe matches bound to current exact Revisions.
 */
@Remote('search') async search( agent: Agent, request: SearchNovelAssetsRequest, signal: AbortSignal, ): Promise<NovelAssetSearchResult[]>

/**
 * Replace the Session-owned non-prose Novel context workset.
 * @param agent Addressed Agent whose Session owns the workset event.
 * @param workset Complete next follow-and-pinned reference value.
 * @param signal Caller cancellation while validating and appending the update.
 * @returns The validated whole workset retained by the Session.
 */
@Remote('replaceContextWorkset') async replaceContextWorkset( agent: Agent, workset: NovelContextWorksetDescriptor, signal: AbortSignal, ): Promise<NovelContextWorksetDescriptor>

/**
 * Create one new typed Asset below its registered project content root.
 * @param agent - addressed Agent whose Session selects the project root and write policy.
 * @param request - semantic type, title, optional parent, and typed content.
 * @param signal - caller cancellation before publication.
 * @returns the browser-safe initial Revision.
 */
@Remote('createAsset') async createAsset( agent: Agent, request: CreateNovelAssetRequest, signal: AbortSignal, ): Promise<NovelAssetDocument>

/**
 * Read one current or retained typed Asset document.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable Asset identity.
 * @param revisionId - exact retained Revision, or `null` for current.
 * @param signal - caller cancellation.
 * @returns a browser-safe Revision-bound typed Asset document.
 */
@Remote('asset') async asset( agent: Agent, assetId: AssetId, revisionId: RevisionId | null, signal: AbortSignal, ): Promise<NovelAssetDocument>

/**
 * List metadata for every retained Revision of one Asset, newest first.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable Asset identity.
 * @param signal - caller cancellation.
 * @returns browser-safe Revision summaries without prose bytes.
 */
@Remote('revisions') async revisions( agent: Agent, assetId: AssetId, signal: AbortSignal, ): Promise<NovelAssetRevisionDescriptor[]>

/**
 * List generated reports for one exact retained Revision.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable Asset identity.
 * @param revisionId - exact retained Revision identity.
 * @param signal - caller cancellation.
 * @returns browser-safe Revision-bound reports.
 */
@Remote('analysisReports') async analysisReports( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal: AbortSignal, ): Promise<NovelAnalysisReportDescriptor[]>

/**
 * Run the deterministic NOAI scanner over one exact chapter Revision.
 * @param agent - addressed Agent and report provenance.
 * @param assetId - exact chapter identity.
 * @param revisionId - retained Revision to scan.
 * @param signal - caller cancellation before persistence.
 * @returns the upserted browser-safe report.
 */
@Remote('scanNoAi') async scanNoAi( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal: AbortSignal, ): Promise<NovelAnalysisReportDescriptor>

/**
 * Run the fixed read-only Subagent reviewer over one exact chapter Revision.
 * @param agent - addressed root Agent and report provenance.
 * @param assetId - exact chapter identity.
 * @param revisionId - retained Revision to review.
 * @param signal - canonical worker cancellation.
 * @returns the upserted browser-safe report.
 */
@Remote('reviewChapter') async reviewChapter( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal: AbortSignal, ): Promise<NovelAnalysisReportDescriptor>

/**
 * Guardedly save one complete authored typed content value.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param request - stable target, base Revision, and complete typed content.
 * @param signal - caller cancellation.
 * @returns the new browser-safe Revision-bound Asset document.
 */
@Remote('saveAsset') async saveAsset( agent: Agent, request: SaveNovelAssetRequest, signal: AbortSignal, ): Promise<NovelAssetDocument>

/**
 * Freeze one exact type-defined selection over a retained Revision.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param request - exact Revision and type-defined selection input.
 * @param signal - caller cancellation.
 * @returns a durable browser-safe SelectionRef.
 */
@Remote('captureSelection') async captureSelection( agent: Agent, request: CaptureNovelSelectionRequest, signal: AbortSignal, ): Promise<NovelSelectionDescriptor>

/**
 * Read one durable ChangeSet for browser review.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param changeSetId - durable ChangeSet identity to review.
 * @param signal - caller cancellation.
 * @returns a browser-safe ChangeSet descriptor.
 */
@Remote('changeSet') async changeSet(agent: Agent, changeSetId: ChangeSetId, signal: AbortSignal): Promise<NovelChangeSetDescriptor>

/**
 * Explicitly accept one Session-owned ChangeSet.
 * @param agent - addressed Agent authorizing publication through its Session identity.
 * @param changeSetId - durable proposal identity to apply.
 * @param signal - caller cancellation before publication begins.
 * @returns the browser-safe terminal or applying result.
 */
@Remote('applyChangeSet') async applyChangeSet(agent: Agent, changeSetId: ChangeSetId, signal: AbortSignal): Promise<NovelChangeSetDescriptor>

/**
 * Explicitly reject one Session-owned ChangeSet.
 * @param agent - addressed Agent authorizing rejection through its Session identity.
 * @param changeSetId - durable proposal identity to reject.
 * @param signal - caller cancellation before durable rejection.
 * @returns the browser-safe rejected or already terminal result.
 */
@Remote('rejectChangeSet') async rejectChangeSet(agent: Agent, changeSetId: ChangeSetId, signal: AbortSignal): Promise<NovelChangeSetDescriptor>
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/novel-repository-remote/src/index.ts`](../../packages/experimental/novel-repository-remote/src/index.ts)

<a id="ctxnovelstudiopaths--novelstudiopaths"></a>

### `ctx.novelStudioPaths` — `NovelStudioPaths`

Absolute package-owned roots consumed by later Profile rows.

Source: [`packages/experimental/novel-studio/src/index.ts`](../../packages/experimental/novel-studio/src/index.ts)
<!-- END GENERATED cordis-surface -->
