# Agent 原生小说工作台 MVP

[English](novel-workbench.md) | 中文

实验性小说工作台让作者与 Agent 通过同一个稳定语义身份读取和修改类型化正文与大纲 Asset。它在显式隔离的 Profile overlay 中组合文件化 Asset、不可变 SQLite Revision、精确类型化选区、持久 Session 上下文、只提案的模型工具、可审阅 ChangeSet 与专用浏览器工作台。权威划分和崩溃恢复决策由[小说工作台 Agent Note（Agent 决策记录）](../../.agents/notes/proposed/architecture/2026-08-22-novel-workbench-domain-and-commit-protocol.zh.md)负责。

## 项目声明

Novel Project 是包含普通 UTF-8 `novel.yaml` 文件的 Workspace 根目录。该清单是项目标识、格式版本、标题和命名内容根目录的权威；它不是 Asset 清单，也不枚举作者文件。

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

[`@deepseek-ai/dsh-experimental-novel-repository`](../../packages/experimental/novel-repository) 定义与提供方无关的 `ctx.novelRepository` seam 和 effect 作用域内的 `ctx.novelAssetTypes` 注册表。[`@deepseek-ai/dsh-experimental-novel-repository-local`](../../packages/experimental/novel-repository-local) 只扫描已安装类型定义认领的根目录和扩展名。章节通过严格 Markdown Frontmatter 成为 Asset；[`@deepseek-ai/dsh-experimental-novel-asset-outline`](../../packages/experimental/novel-asset-outline) 独立贡献严格 YAML `planning.outline` 解析与展示，不向共享 Repository 增加大纲分支。

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

```yaml
novel:
  schema: 1
  id: outline_main
  type: planning.outline
  title: Main Outline
nodes:
  - id: act-one
    title: Act One
    summary: The protagonist reaches White Harbor.
    children: []
```

项目文件是当前作者内容的权威。`.novel/history.sqlite` 保存精确的不可变 Revision 字节、Asset head、ChangeSet 与 apply journal；它不会取代文件成为当前真相源。文件改名保留 Asset 身份，外部字节变化在 reconcile 时创建 `external-edit` Revision。每次人类保存都由精确类型定义物化并重新解析，而且要求画面上的 base Revision 与文件系统版本仍然为当前值。

## 选区与 Session 上下文

第一版可以冻结带 UTF-16 offset 与 quote hash 的非空正文范围，也可以冻结带稳定 node id 与 node hash 的单个大纲节点。每个选区都绑定一个已保留 Revision，绝不静默前移到可变的最新内容。浏览器 context barrier 先保存脏的类型化草稿，再捕获新 Revision 上的精确选区，最后把规范 `dsh-novel:` mention 插入普通 DSH Composer。

[`@deepseek-ai/dsh-experimental-novel-context`](../../packages/experimental/novel-context) 在 `agent/pre-step` 解析这些 mention。它保留人类可读消息，并附加一个 source kind 为 `novel-context` 的不可变 `user/message`。该消息以确定性、明确不受信任的 JSON 保存精确 Revision，让 Session replay 能重建模型实际看到的内容。引用数量和 UTF-8 总字节数都有上限，而且第一次 Novel context 会把该 Session 绑定到一个 Project。

## 提案、审阅与恢复

[`@deepseek-ai/dsh-experimental-tool-novel`](../../packages/experimental/tool-novel) 在包自带 Preset 中暴露 `novel_list`、`novel_get` 与 `novel_propose_changes`。目录发现为所有已安装类型返回规范精确 Revision 引用；精确读取使用该类型的确定性模型投影与提案说明。提案由匹配定义校验一个正文 `replace-text` 或大纲 `update-outline-node`，再持久创建 ChangeSet，但不改作者文件。模型没有 apply 工具，也不能宣称已经发布修改。

浏览器把 ChangeSet 读成行内 Diff 卡片。接受或拒绝都是显式、归 Session 所有的 Remote 操作。Apply 在接触文件前，把精确前后字节、hash、授权与预期结果 Revision 以 `applying` 状态写入 journal。项目重开时，after hash 会完成提交，before hash 会重试受保护写入，任何第三种 hash 都会变成 `conflicted`，且不覆盖作者文件。

## Profile 隔离

[`@deepseek-ai/dsh-experimental-novel-studio`](../../packages/experimental/novel-studio) 是私有 overlay，组合在 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 之后。它只禁用普通 `ui-layout` 根占位者，改为安装 [`@deepseek-ai/dsh-experimental-novel-workbench`](../../packages/experimental/novel-workbench)。Novel 根仍保留原生侧栏、对话、详情、设置、模型选择、工具渲染和 overlay surface，并增加类型化 Asset explorer 与 canvas 插槽。

根布局把 Agent 对话放在左侧，把 Asset 浏览器与画布放在右侧。精确 Client Renderer contribution 分别提供正文阅读/编辑器或结构化大纲树与字段检查器。默认 `web` 与 `headless` Profile 模板不包含这些实验性包。overlay 还拥有安全的 `novel-workbench` Preset，其稳定工具集不包含 shell 或通用文件系统修改能力。

浏览器保存与 ChangeSet 应用会解析被寻址 Session 的 sandbox policy，并把它传入 Repository 协调与发布。Novel Project 因此可以位于 Host 进程工作目录之外，同时仍被限制在 Session 工作区边界内。

## 当前限制

当前切片支持 `manuscript.chapter` 与 `planning.outline`、一个活动类型化选区，以及单 Asset ChangeSet 中的一项类型化操作。大纲节点创建/删除/重排、持久正文 block id、人物、灵感、搜索、关系、文件监听、自动 rebase、多 Asset 事务、更丰富的视图与多 Agent 编排仍暂缓。Repository 只在调用边界 reconcile，支持的写入模型是单 Host 进程。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
 * Read one current or retained typed Asset document.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable Asset identity.
 * @param revisionId - exact retained Revision, or `null` for current.
 * @param signal - caller cancellation.
 * @returns a browser-safe Revision-bound typed Asset document.
 */
@Remote('asset') async asset( agent: Agent, assetId: AssetId, revisionId: RevisionId | null, signal: AbortSignal, ): Promise<NovelAssetDocument>

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
