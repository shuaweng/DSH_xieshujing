# Agent-native Novel workbench MVP

English | [中文](novel-workbench.zh.md)

The experimental Novel workbench MVP gives a human author and an Agent the same stable semantic identity for reading and changing one manuscript chapter. It combines file-backed Assets, immutable SQLite Revisions, exact selections, durable Session context, proposal-only model tools, reviewable ChangeSets, and a dedicated browser workbench in an explicitly isolated Profile overlay. The governing authority and crash-recovery decisions live in the [Novel workbench Agent Note](../../.agents/notes/proposed/architecture/2026-08-22-novel-workbench-domain-and-commit-protocol.md).

## Project declaration

A Novel Project is a Workspace root containing a regular UTF-8 `novel.yaml`. The manifest is authoritative for project identity, format version, title, and named content roots; it is not an Asset manifest and does not enumerate authored files.

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
```

Schema version 1 requires `kind: novel-project`, integer `schema: 1`, non-empty `id` and `title` values, and a `contentRoots` mapping containing `manuscript`. The local provider rejects malformed or ambiguous YAML, invalid UTF-8, unsupported schemas, missing roots, dangling links, and canonical paths that escape the Project root.

## Asset and Revision authority

[`@deepseek-ai/dsh-experimental-novel-repository`](../../packages/experimental/novel-repository) defines the provider-neutral `ctx.novelRepository` seam. [`@deepseek-ai/dsh-experimental-novel-repository-local`](../../packages/experimental/novel-repository-local) scans bounded Markdown files below the declared `manuscript` root. A chapter becomes an Asset only when strict YAML Frontmatter declares `novel.schema: 1`, a stable `novel.id`, `novel.type: manuscript.chapter`, and a title.

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

Project files are authoritative for current authored content. `.novel/history.sqlite` retains exact immutable Revision bytes, Asset heads, ChangeSets, and apply journals; it does not replace the files as current truth. A rename preserves Asset identity, while changed external bytes create an `external-edit` Revision during reconciliation. User saves replace only the parsed body, preserve the exact Frontmatter prefix, and require both the displayed base Revision and filesystem version to remain current.

## Selection and Session context

Version one freezes a non-empty range as UTF-16 body offsets plus an exact quote hash and bounded prefix/suffix diagnostics. The selection binds to one retained Revision and never silently falls forward to mutable current content. The browser context barrier first saves a dirty draft, captures the resulting exact selection, then inserts a canonical `dsh-novel:` mention into the ordinary DSH Composer.

[`@deepseek-ai/dsh-experimental-novel-context`](../../packages/experimental/novel-context) resolves those mentions at `agent/pre-step`. It preserves the readable human message and appends one immutable `user/message` whose source kind is `novel-context`. The message contains deterministic, explicitly untrusted JSON for the exact retained Revision, so Session replay can reconstruct what the model saw. Reference count and aggregate UTF-8 bytes are bounded, and the first Novel context binds that Session to one Project.

## Proposal, review, and recovery

[`@deepseek-ai/dsh-experimental-tool-novel`](../../packages/experimental/tool-novel) exposes `novel_list`, `novel_get`, and `novel_propose_changes` in the package-owned Preset. Catalog discovery returns canonical exact-Revision references for the current Session project, exact reads resolve retained Revisions, and a proposal validates one quote-hashed `replace-text` operation and durably creates a ChangeSet without changing the authored file. The model has no apply tool and cannot claim publication.

The browser reads that ChangeSet into an inline Diff card. Accept or Reject is an explicit Session-owned Remote action. Apply records exact before/after bytes, hashes, authorization, and the intended result Revision as `applying` before filesystem publication. On reopen, an after-hash finalizes, a before-hash retries the guarded write, and any third hash becomes `conflicted` without overwriting the authored file.

## Profile isolation

[`@deepseek-ai/dsh-experimental-novel-studio`](../../packages/experimental/novel-studio) is a private overlay composed after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. It disables only the ordinary `ui-layout` root occupant and installs [`@deepseek-ai/dsh-experimental-novel-workbench`](../../packages/experimental/novel-workbench) instead. The Novel root retains native sidebar, conversation, details, settings, model-selection, tool-rendering, and overlay surfaces, then adds manuscript explorer and canvas slots.

The root places the Agent conversation on the left and the manuscript explorer plus canvas on the right. The default `web` and `headless` Profile templates include none of these experimental packages. The overlay owns its safe `novel-workbench` Preset, whose stable tool set excludes shell and generic filesystem mutation. This gives the MVP deep DSH integration without changing ordinary DSH operation.

Browser saves and ChangeSet applies resolve the addressed Session's sandbox policy and pass it through Repository reconciliation and publication. A Novel Project may therefore live outside the Host process working directory while remaining confined to the Session workspace boundary.

## Current limits

The MVP supports one `manuscript.chapter` editor, one active UTF-16 selection, and one `replace-text` operation in a single-Asset ChangeSet. Persistent block ids, outlines, characters, ideas, search, relations, filesystem watching, automatic rebase, multi-Asset transactions, richer editors, and multi-Agent orchestration remain deferred. Reconciliation happens on repository boundaries, and the supported writer model is one Host process.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
 * @returns current chapter rows in deterministic project-path order.
 */
abstract listAssets( project: NovelProjectSnapshot, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<readonly AssetSummary[]>

/**
 * Read either the reconciled current head or one retained immutable Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable authored asset identity.
 * @param revisionId - exact retained Revision; omission reconciles and returns the current file head.
 * @param signal - optional cancellation for filesystem and history work.
 * @param sandboxPolicy - optional per-call write policy used if current-head reconciliation must recover an apply journal.
 * @returns exact serialized bytes and parsed chapter values.
 * @throws {NovelRepositoryError} when the asset or Revision is absent or invalid.
 */
abstract readAsset( project: NovelProjectSnapshot, assetId: AssetId, revisionId?: RevisionId, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<AssetSnapshot>

/**
 * Guardedly publish a user-authored chapter body and retain its exact new Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param request - target, current base Revision, and full replacement body.
 * @param signal - optional cancellation before filesystem publication.
 * @param sandboxPolicy - optional per-call policy governing authored-file publication and recovery.
 * @returns the committed exact new head.
 * @throws {NovelRepositoryError} when the base is stale or the resulting asset is invalid.
 */
abstract saveChapterBody( project: NovelProjectSnapshot, request: SaveChapterBodyRequest, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<AssetSnapshot>

/**
 * Freeze one exact non-empty UTF-16 body range without rereading mutable latest content.
 * @param project - validated Project declaration returned by this provider.
 * @param request - retained Revision and body offsets to validate.
 * @param signal - optional cancellation for the history read.
 * @returns immutable selection identity, quote hash, and bounded diagnostics.
 */
abstract captureSelection( project: NovelProjectSnapshot, request: CaptureSelectionRequest, signal?: AbortSignal, ): Promise<SelectionRef>

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
 * List the reconciled chapter catalog for the addressed Session project.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param signal - caller cancellation.
 * @returns browser-safe current Asset descriptors.
 */
@Remote('assets') async assets(agent: Agent, signal: AbortSignal): Promise<NovelAssetDescriptor[]>

/**
 * Read one current or retained chapter body.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable chapter identity.
 * @param revisionId - exact retained Revision, or `null` for current.
 * @param signal - caller cancellation.
 * @returns a browser-safe Revision-bound chapter document.
 */
@Remote('asset') async asset( agent: Agent, assetId: AssetId, revisionId: RevisionId | null, signal: AbortSignal, ): Promise<NovelChapterDocument>

/**
 * Guardedly save an authored chapter body.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param request - stable target, base Revision, and complete replacement body.
 * @param signal - caller cancellation.
 * @returns the new browser-safe Revision-bound chapter document.
 */
@Remote('saveChapter') async saveChapter( agent: Agent, request: SaveNovelChapterRequest, signal: AbortSignal, ): Promise<NovelChapterDocument>

/**
 * Freeze one exact selection over a retained chapter Revision.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param request - exact Revision and UTF-16 body offsets.
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
