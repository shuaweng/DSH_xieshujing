# Agent-native Novel workbench MVP

English | [中文](novel-workbench.zh.md)

The experimental Novel workbench gives a human author and an Agent the same stable semantic identity for reading and changing typed manuscript and outline Assets. It combines file-backed Assets, immutable SQLite Revisions, exact type-defined selections, durable Session context, proposal-only model tools, reviewable ChangeSets, and a dedicated browser workbench in an explicitly isolated Profile overlay. The governing authority and crash-recovery decisions live in the [Novel workbench Agent Note](../../.agents/notes/proposed/architecture/2026-08-22-novel-workbench-domain-and-commit-protocol.md).

## Project declaration

A Novel Project is a Workspace root containing a regular UTF-8 `novel.yaml`. The manifest is authoritative for project identity, format version, title, and named content roots; it is not an Asset manifest and does not enumerate authored files.

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
  planning: planning
```

Schema version 1 requires `kind: novel-project`, integer `schema: 1`, non-empty `id` and `title` values, and a `contentRoots` mapping containing `manuscript`. `planning` is optional, but when declared it must resolve to an existing project-contained directory. The local provider rejects malformed or ambiguous YAML, invalid UTF-8, unsupported schemas, missing declared roots, dangling links, and canonical paths that escape the Project root.

## Asset and Revision authority

[`@deepseek-ai/dsh-experimental-novel-repository`](../../packages/experimental/novel-repository) defines the provider-neutral `ctx.novelRepository` seam and effect-scoped `ctx.novelAssetTypes` registry. [`@deepseek-ai/dsh-experimental-novel-repository-local`](../../packages/experimental/novel-repository-local) scans only roots and extensions claimed by installed type definitions. A chapter becomes an Asset through strict Markdown Frontmatter; [`@deepseek-ai/dsh-experimental-novel-asset-outline`](../../packages/experimental/novel-asset-outline) contributes freeform Markdown book/volume outlines, chapter plans, a project-singleton book brief, and a project-singleton style profile without adding type branches to the shared repository.

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

`book.brief` and `book.style-profile` use the same freeform Markdown body and exact text operations, have no semantic parent, and set the registry's generic `projectSingleton` contract. Repository scans and typed creation therefore reject a second Asset of either exact type without hard-coding their names. They live under the declared `planning` root while the explorer projects them into a logical Book group.

Project files are authoritative for current authored content. `.novel/history.sqlite` retains exact immutable Revision bytes, Asset heads, ChangeSets, and apply journals; it does not replace the files as current truth. A rename preserves Asset identity, while changed external bytes create an `external-edit` Revision during reconciliation. Every human save is materialized and reparsed by the exact type definition and requires both the displayed base Revision and filesystem version to remain current.

## Selection and Session context

Version one freezes a non-empty UTF-16 text range with a quote hash for every currently shipped freeform Asset type. Every selection binds to one retained Revision and never silently falls forward to mutable current content. The browser context barrier first saves a dirty typed draft, captures the resulting exact selection, then inserts a canonical `dsh-novel:` mention into the ordinary DSH Composer.

[`@deepseek-ai/dsh-experimental-novel-context`](../../packages/experimental/novel-context) resolves those mentions at `agent/pre-step`. It preserves the readable human message and appends one immutable `user/message` whose source kind is `novel-context`. The message contains deterministic, explicitly untrusted JSON for the exact retained Revision, so Session replay can reconstruct what the model saw. The first Novel context binds that Session to one Project.

The visible workset is coordination state rather than an always-on prompt bundle. Its version-two `follow` pointer stores the current Asset identity and resolves the saved head only when a turn is compiled; `pinned` references remain bound to exact Revisions. Ordinary turns materialize explicit Composer selections while representing follow and pinned items as compact coordinates.

Task workflows call the same Host-owned Context Compiler with a closed policy and exact target. Explicit Novel Skill metadata or fixed review/finalization entry points select policies for chapter writing, selection work, outline editing, chapter review, and preference learning; intent is never guessed from prose. Policies may add only deterministic typed relations such as the matching chapter outline, book brief, style profile, or outline relatives. Required authored text fails closed if it exceeds the budget, while optional material degrades to a coordinate. The resulting version-three Context Manifest records policy, reason, projection, exact Revision, content hashes, and model-visible byte counts under a deterministic id before entering the Session log.

## Proposal, review, and recovery

[`@deepseek-ai/dsh-experimental-tool-novel`](../../packages/experimental/tool-novel) exposes approval-gated `novel_initialize_project`, `novel_list`, `novel_search`, `novel_create`, `novel_get`, `novel_propose_changes`, and presentation-only `novel_present` in the package-owned Preset. Initialization and the browser empty state call the same Repository operation: it preserves existing files, creates the minimal content roots, and publishes `novel.yaml` last as the activation marker; a present invalid manifest or conflicting content-root path fails without replacement. Catalog discovery returns canonical exact-Revision references and registered creation contracts. A new chapter is one `novel_create` call containing its title and complete manuscript body; the Agent never requires a separately created empty container. If an empty chapter already exists, `insert-text` at UTF-16 offset zero creates a reviewable insertion ChangeSet, while non-empty rewrites use `replace-text`. Exact reads use each type's deterministic model projection and proposal instructions. Fixed workflows receive compiler-frozen related material, while exploratory reads remain explicit tool calls retained in Session history. A proposal uses the matching definition to validate an exact type-owned text operation before durably creating a ChangeSet without changing the authored file. `novel_present` only opens or closes the whole workbench through typed tool-result metadata. The model has no apply tool and cannot claim publication.

The browser reads that ChangeSet into an inline Diff card. Accept or Reject is an explicit Session-owned Remote action. Apply records exact before/after bytes, hashes, authorization, and the intended result Revision as `applying` before filesystem publication. On reopen, an after-hash finalizes, a before-hash retries the guarded write, and any third hash becomes `conflicted` without overwriting the authored file.

## Profile isolation

[`@deepseek-ai/dsh-experimental-novel-studio`](../../packages/experimental/novel-studio) is a private overlay composed after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. The shipped `ui-layout` remains the single root and layout-service owner and exposes a selector-routed `shell.workbench` chain. [`@deepseek-ai/dsh-experimental-novel-workbench`](../../packages/experimental/novel-workbench) contributes a pure `novel` surface to that chain, preserves native sidebar, conversation, details, settings, model-selection, tool-rendering, and overlay surfaces, and declares typed Asset explorer and canvas slots only beneath its elected surface.

Only a Session whose exact Agent preset is `novel-workbench` receives the Composer toggle beside access/plan controls and may elect the Novel surface. AppFrame then places Agent conversation on the left and Asset explorer plus canvas on the right; the author can close the whole workbench from the same toggle, and switching to another preset immediately restores the ordinary tracks. Typed `novel_present` results can request the same transition without parsing Agent prose. The default `web` and `headless` Profile templates include none of these experimental packages. The overlay's safe preset excludes shell and generic filesystem mutation.

Browser saves and ChangeSet applies resolve the addressed Session's sandbox policy and pass it through Repository reconciliation and publication. A Novel Project may therefore live outside the Host process working directory while remaining confined to the Session workspace boundary.

## Current limits

The current slice supports `manuscript.chapter`, `planning.outline`, `planning.chapter-outline`, `book.brief`, and `book.style-profile`, one active type-defined selection, one type-defined operation in a single-Asset ChangeSet, review-gated chapter finalization, and draft/final preference learning. Persistent manuscript block ids, characters, ideas, semantic retrieval, Story State, generated summaries, relations, filesystem watching, automatic rebase, multi-Asset transactions, richer views, and general multi-Agent orchestration remain deferred. The task-aware compiler intentionally uses only deterministic typed relations today, but its explicit policy request and versioned Manifest leave those future selectors behind one replaceable boundary. Reconciliation happens on repository boundaries, and the supported writer model is one Host process.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Agent](core.md)

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

Types: [Agent](core.md) · [ContentBlock](llm-streaming.md)

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

Types: [FsTarget](filesystem.md) · [SandboxExecutionPolicy](sandbox.md)

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

Types: [Agent](core.md)

Source: [`packages/experimental/novel-repository-remote/src/index.ts`](../../packages/experimental/novel-repository-remote/src/index.ts)

<a id="ctxnovelstudiopaths--novelstudiopaths"></a>

### `ctx.novelStudioPaths` — `NovelStudioPaths`

Absolute package-owned roots consumed by later Profile rows.

Source: [`packages/experimental/novel-studio/src/index.ts`](../../packages/experimental/novel-studio/src/index.ts)
<!-- END GENERATED cordis-surface -->
