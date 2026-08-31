# WriteBookWhale Novel Project

English | [中文](novel.zh.md)

The WriteBookWhale subsystem adds a file-backed Novel Project domain without changing the generic Agent Loop. [`novel-repository`](../../packages/experimental/novel-repository/README.md) owns stable Project, Asset, Revision, Selection, and ChangeSet identities; [`novel-context`](../../packages/experimental/novel-context/README.md) compiles explicit, replayable model context; [`novel-analysis`](../../packages/experimental/novel-analysis/README.md) owns exact-Revision analysis and explicit finalization learning; and [`novel-repository-remote`](../../packages/experimental/novel-repository-remote/README.md) exposes browser-safe transport. The package READMEs own file formats, validation, limits, and composition.

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
 * Retain explicit finalization, then infer one inert preference candidate when evidence exists.
 * @param agent - addressed parent Agent and Session identity.
 * @param assetId - chapter Asset to finalize.
 * @param revisionId - exact chapter Revision selected by the author.
 * @param signal - caller cancellation.
 * @returns retained finalization plus optional preference and Story State candidates.
 */
async finalizeChapter( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal: AbortSignal, ): Promise<FinalizeChapterResult>

/**
 * Apply one reviewed candidate to the exact style Revision through ChangeSet publication.
 * @param agent - addressed Agent whose Session authorizes the decision.
 * @param candidateId - retained pending preference candidate.
 * @param signal - caller cancellation.
 * @returns the terminal candidate and resulting ChangeSet.
 */
async acceptPreference( agent: Agent, candidateId: PreferenceCandidateId, signal: AbortSignal, ): Promise<{ readonly candidate: NovelPreferenceCandidate; readonly changeSet: ChangeSet }>

/**
 * Retain explicit rejection without changing authored assets.
 * @param agent - addressed Agent whose Session records the decision.
 * @param candidateId - retained pending preference candidate.
 * @param signal - caller cancellation.
 * @returns the rejected terminal preference candidate.
 */
async rejectPreference( agent: Agent, candidateId: PreferenceCandidateId, signal: AbortSignal, ): Promise<NovelPreferenceCandidate>

/**
 * Apply one reviewed complete Story State replacement through ChangeSet publication.
 * @param agent - addressed Agent whose Session authorizes the decision.
 * @param candidateId - retained pending Story State candidate.
 * @param signal - caller cancellation.
 * @returns the terminal candidate and resulting ChangeSet.
 */
async acceptStoryState( agent: Agent, candidateId: StoryStateCandidateId, signal: AbortSignal, ): Promise<{ readonly candidate: NovelStoryStateCandidate; readonly changeSet: ChangeSet }>

/**
 * Retain explicit Story State rejection without changing authored assets.
 * @param agent - addressed Agent whose Session records the decision.
 * @param candidateId - retained pending Story State candidate.
 * @param signal - caller cancellation.
 * @returns the rejected terminal Story State candidate.
 */
async rejectStoryState( agent: Agent, candidateId: StoryStateCandidateId, signal: AbortSignal, ): Promise<NovelStoryStateCandidate>

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
 * @param workset - live follow identity and exact pinned references selected by the browser.
 * @param signal - optional cancellation before validation and append.
 * @returns the detached normalized value now in force.
 */
async replaceWorkset( agent: Agent, workset: NovelContextWorkset, signal?: AbortSignal, ): Promise<NovelContextWorksetV2>

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

/**
 * Compile one explicit Novel task into a bounded, exact and replayable context frame.
 * The caller chooses a policy; natural-language intent is never classified here.
 * @param agent - owning Agent whose workspace and optional workset bind the task.
 * @param request - explicit task policy, exact targets and workset opt-in.
 * @param signal - optional cancellation for repository and Skill work.
 * @returns one V3 Manifest plus the exact text that must enter the receiving Session.
 */
async compile( agent: Agent, request: NovelContextCompileRequest, signal?: AbortSignal, ): Promise<CompiledNovelContext>
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
 * Activate an existing directory as a Novel Project without overwriting authored files.
 * @param _root - Canonical directory that will become the project root.
 * @param _request - Minimal author input; the provider owns generated identity and layout.
 * @param _signal - Optional cancellation for provider I/O.
 * @param _sandboxPolicy - Optional per-call write policy for initialization publications.
 * @returns the initialized and rediscovered project snapshot.
 * @throws {NovelRepositoryError} when initialization is unsupported, invalid, or conflicts with existing paths.
 */
initializeProject( _root: FsTarget, _request: InitializeNovelProjectRequest, _signal?: AbortSignal, _sandboxPolicy?: SandboxExecutionPolicy, ): Promise<NovelProjectSnapshot>

/**
 * Read the project-owned Novel Preset Skill activation policy.
 * @param _project - validated Project declaration returned by this provider.
 * @param _signal - optional cancellation before provider I/O.
 * @returns the complete policy; providers return an empty disabled set when none was authored.
 */
readSkillSettings( _project: NovelProjectSnapshot, _signal?: AbortSignal, ): Promise<NovelSkillSettings>

/**
 * Atomically replace the project-owned Novel Preset Skill activation policy.
 * @param _project - validated Project declaration returned by this provider.
 * @param _settings - complete normalized replacement policy.
 * @param _signal - optional cancellation before provider I/O.
 * @param _sandboxPolicy - optional per-call policy governing the settings-file publication.
 * @returns the committed policy.
 */
replaceSkillSettings( _project: NovelProjectSnapshot, _settings: NovelSkillSettings, _signal?: AbortSignal, _sandboxPolicy?: SandboxExecutionPolicy, ): Promise<NovelSkillSettings>

/**
 * Rebuild the current authored catalog and reconcile exact file bytes into immutable Revisions.
 * @param project - validated Project declaration returned by this provider.
 * @param signal - optional cancellation for filesystem and history work.
 * @param sandboxPolicy - optional per-call write policy used if reconciliation must recover an apply journal.
 * @returns current typed Asset rows in authored manifest order with deterministic project-path fallback.
 */
abstract listAssets( project: NovelProjectSnapshot, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<readonly AssetSummary[]>

/**
 * Persist the complete author-selected order for one Asset type without changing Asset Revisions.
 * @param project - validated Project declaration returned by this provider.
 * @param request - exact type and every current Asset id of that type in desired order.
 * @param signal - optional cancellation before manifest publication.
 * @param sandboxPolicy - optional per-call policy governing manifest publication.
 * @returns the current catalog sorted with the committed order.
 */
abstract reorderAssets( project: NovelProjectSnapshot, request: ReorderAssetsRequest, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<readonly AssetSummary[]>

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
 * Logically delete one current Asset and every semantic descendant.
 * Providers retain authored bytes and immutable history for recovery.
 * @param _project - validated Project declaration returned by this provider.
 * @param _request - exact Asset and observed base Revision.
 * @param _signal - optional cancellation before logical removal.
 * @param _sandboxPolicy - optional per-call policy governing filesystem publication.
 * @returns the removed identities and refreshed current Asset catalog.
 */
deleteAsset( _project: NovelProjectSnapshot, _request: DeleteAssetRequest, _signal?: AbortSignal, _sandboxPolicy?: SandboxExecutionPolicy, ): Promise<DeleteAssetResult>

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
 * Restore one retained Revision as a new guarded current head.
 * @param project - validated Project declaration returned by this provider.
 * @param request - current head, retained source, and confirming Session identity.
 * @param signal - optional cancellation before authored-file publication.
 * @param sandboxPolicy - optional per-call policy governing authored-file publication.
 * @returns the new head and bounded follow-up effects; historical reports remain attached to their original Revisions.
 */
abstract restoreAssetRevision( project: NovelProjectSnapshot, request: RestoreAssetRevisionRequest, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<RestoreAssetRevisionResult>

/**
 * Mark one exact chapter Revision final and retain its nearest Agent lineage.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable chapter Asset identity.
 * @param revisionId - exact Revision selected as final.
 * @param finalizedBySessionId - confirming Session identity.
 * @param signal - optional cancellation before durable publication.
 * @returns the retained finalization and generation lineage.
 */
finalizeRevision( project: NovelProjectSnapshot, assetId: AssetId, revisionId: RevisionId, finalizedBySessionId: import('@deepseek-ai/dsh-session/types').SessionId, signal?: AbortSignal, ): Promise<RevisionFinalization>

/**
 * List explicit finalization decisions for one Asset, newest first.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable chapter Asset identity.
 * @param signal - optional cancellation before history access.
 * @returns retained finalization decisions newest first.
 */
listRevisionFinalizations( project: NovelProjectSnapshot, assetId: AssetId, signal?: AbortSignal, ): Promise<readonly RevisionFinalization[]>

/**
 * Retain one inert, reviewable preference candidate.
 * @param project - validated Project declaration returned by this provider.
 * @param request - extracted preference evidence and exact target Revision.
 * @param signal - optional cancellation before durable publication.
 * @returns the retained pending preference candidate.
 */
putPreferenceCandidate( project: NovelProjectSnapshot, request: PutNovelPreferenceCandidateRequest, signal?: AbortSignal, ): Promise<NovelPreferenceCandidate>

/**
 * List retained preference candidates for one final Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable finalized chapter Asset identity.
 * @param finalRevisionId - exact final Revision identity.
 * @param signal - optional cancellation before history access.
 * @returns retained preference candidates for the exact final Revision.
 */
listPreferenceCandidates( project: NovelProjectSnapshot, assetId: AssetId, finalRevisionId: RevisionId, signal?: AbortSignal, ): Promise<readonly NovelPreferenceCandidate[]>

/**
 * Read one retained preference candidate.
 * @param project - validated Project declaration returned by this provider.
 * @param candidateId - stable preference candidate identity.
 * @param signal - optional cancellation before history access.
 * @returns the exact retained preference candidate.
 */
readPreferenceCandidate( project: NovelProjectSnapshot, candidateId: PreferenceCandidateId, signal?: AbortSignal, ): Promise<NovelPreferenceCandidate>

/**
 * Record the explicit terminal user decision and optional applied lineage.
 * @param project - validated Project declaration returned by this provider.
 * @param candidateId - stable preference candidate identity.
 * @param decision - explicit accepted or rejected terminal state.
 * @param decidedBySessionId - Session recording the author decision.
 * @param result - optional applied ChangeSet and result Revision lineage.
 * @param signal - optional cancellation before durable publication.
 * @returns the updated terminal preference candidate.
 */
decidePreferenceCandidate( project: NovelProjectSnapshot, candidateId: PreferenceCandidateId, decision: 'accepted' | 'rejected', decidedBySessionId: import('@deepseek-ai/dsh-session/types').SessionId, result?: { readonly changeSetId: ChangeSetId; readonly revisionId: RevisionId }, signal?: AbortSignal, ): Promise<NovelPreferenceCandidate>

/**
 * Retain one inert, reviewable Story State replacement candidate.
 * @param project - validated Project declaration returned by this provider.
 * @param request - extracted Story State replacement and evidence.
 * @param signal - optional cancellation before durable publication.
 * @returns the retained pending Story State candidate.
 */
putStoryStateCandidate( project: NovelProjectSnapshot, request: PutNovelStoryStateCandidateRequest, signal?: AbortSignal, ): Promise<NovelStoryStateCandidate>

/**
 * List Story State candidates attached to one finalized chapter Revision.
 * @param project - validated Project declaration returned by this provider.
 * @param assetId - stable finalized chapter Asset identity.
 * @param finalRevisionId - exact final Revision identity.
 * @param signal - optional cancellation before history access.
 * @returns retained Story State candidates for the exact final Revision.
 */
listStoryStateCandidates( project: NovelProjectSnapshot, assetId: AssetId, finalRevisionId: RevisionId, signal?: AbortSignal, ): Promise<readonly NovelStoryStateCandidate[]>

/**
 * Read one retained Story State candidate.
 * @param project - validated Project declaration returned by this provider.
 * @param candidateId - stable Story State candidate identity.
 * @param signal - optional cancellation before history access.
 * @returns the exact retained Story State candidate.
 */
readStoryStateCandidate( project: NovelProjectSnapshot, candidateId: StoryStateCandidateId, signal?: AbortSignal, ): Promise<NovelStoryStateCandidate>

/**
 * Record the explicit terminal Story State decision and optional applied lineage.
 * @param project - validated Project declaration returned by this provider.
 * @param candidateId - stable Story State candidate identity.
 * @param decision - explicit accepted or rejected terminal state.
 * @param decidedBySessionId - Session recording the author decision.
 * @param result - optional applied ChangeSet and result Revision lineage.
 * @param signal - optional cancellation before durable publication.
 * @returns the updated terminal Story State candidate.
 */
decideStoryStateCandidate( project: NovelProjectSnapshot, candidateId: StoryStateCandidateId, decision: 'accepted' | 'rejected', decidedBySessionId: import('@deepseek-ai/dsh-session/types').SessionId, result?: { readonly changeSetId: ChangeSetId; readonly revisionId: RevisionId }, signal?: AbortSignal, ): Promise<NovelStoryStateCandidate>

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

Types: [FsTarget](filesystem.md) · [SandboxExecutionPolicy](sandbox.md) · [SessionId](core.md)

Source: [`packages/experimental/novel-repository/src/index.ts`](../../packages/experimental/novel-repository/src/index.ts)

<a id="ctxnovelrepositoryclientready--novelrepositoryclientready"></a>

### `ctx.novelRepositoryClientReady` — `NovelRepositoryClientReady`

Host-side readiness marker for the browser adapter.

Client entries are added to the frozen Web boot manifest only after their Host loader row activates. Waiting on the Remote provider here turns that registration into a deterministic link in the Novel Studio startup chain.

Source: [`packages/experimental/novel-repository-client/src/index.ts`](../../packages/experimental/novel-repository-client/src/index.ts)

<a id="ctxnovelrepositoryremote--novelrepositoryremote"></a>

### `ctx.novelRepositoryRemote` — `NovelRepositoryRemote`

Project browser projection consuming the provider-neutral repository service.

```ts cordis-catalog
/**
 * List author-visible Skills contributed by the active Novel Preset.
 * @param agent - addressed Agent whose Session owns activation choices.
 * @param signal - caller cancellation.
 * @returns the current custom Skill catalog and per-Session enabled state.
 * @throws when the Skill registry is unavailable, incomplete, or exceeds the response bound.
 */
@Remote('skills') async skills(agent: Agent, signal: AbortSignal): Promise<NovelSkillSettingsDescriptor>

/**
 * Replace the disabled Novel Preset Skills for the addressed Session.
 * @param agent - addressed Agent whose Session receives the durable setting.
 * @param request - complete replacement of disabled Skill names.
 * @param signal - caller cancellation.
 * @returns the refreshed Skill catalog after persisting the setting.
 * @throws when the request names an unknown Skill or the catalog cannot be read.
 */
@Remote('replaceSkillSettings') async replaceSkillSettings( agent: Agent, request: ReplaceNovelSkillSettingsRequest, signal: AbortSignal, ): Promise<NovelSkillSettingsDescriptor>

/**
 * Discover a project at the addressed Agent's Session working directory.
 * @param agent - addressed Agent whose working directory bounds discovery.
 * @param signal - caller cancellation.
 * @returns browser-safe project values, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the Session has no working directory or discovery fails.
 */
@Remote('discover') async discover(agent: Agent, signal: AbortSignal): Promise<NovelProjectDescriptor | undefined>

/**
 * Activate the addressed Session working directory after an explicit UI action.
 * @param agent - addressed Agent whose exact Session directory becomes the project root.
 * @param request - author-visible project input.
 * @param signal - caller cancellation.
 * @returns the existing or newly initialized browser-safe project descriptor.
 * @throws {NovelRepositoryError} when the root, manifest, title, or default content roots are invalid.
 */
@Remote('initialize') async initialize( agent: Agent, request: InitializeNovelProjectRequest, signal: AbortSignal, ): Promise<NovelProjectDescriptor>

/**
 * List the reconciled Asset catalog for the addressed Session project.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param signal - caller cancellation.
 * @returns browser-safe current Asset descriptors.
 */
@Remote('assets') async assets(agent: Agent, signal: AbortSignal): Promise<NovelAssetDescriptor[]>

/**
 * Persist one complete type-specific Asset order through the project manifest.
 * @param agent - addressed Agent whose Session selects the project and write policy.
 * @param request - exact type and every current Asset id of that type in desired order.
 * @param signal - caller cancellation before publication.
 * @returns the current browser catalog sorted with the committed order.
 */
@Remote('reorderAssets') async reorderAssets( agent: Agent, request: ReorderNovelAssetsRequest, signal: AbortSignal, ): Promise<NovelAssetDescriptor[]>

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
 * Remove one user-selected current Asset while retaining authored history for recovery.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param request - exact Asset and observed base Revision.
 * @param signal - caller cancellation before logical removal.
 * @returns removed identities and the refreshed browser-safe Asset catalog.
 */
@Remote('deleteAsset') async deleteAsset( agent: Agent, request: DeleteNovelAssetRequest, signal: AbortSignal, ): Promise<DeleteNovelAssetDescriptor>

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
 * Restore retained authored bytes as a new guarded head after an explicit browser confirmation.
 * @param agent - addressed Agent whose Session supplies project root, actor identity, and write policy.
 * @param request - exact observed head and retained source Revision.
 * @param signal - caller cancellation before authored-file publication.
 * @returns the committed document and bounded follow-up effects.
 */
@Remote('restoreAsset') async restoreAsset( agent: Agent, request: RestoreNovelAssetRequest, signal: AbortSignal, ): Promise<RestoreNovelAssetDescriptor>

/**
 * List exact chapter Revisions explicitly marked final by the author.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable chapter Asset identity.
 * @param signal - caller cancellation.
 * @returns browser-safe finalization records newest first.
 */
@Remote('revisionFinalizations') async revisionFinalizations( agent: Agent, assetId: AssetId, signal: AbortSignal, ): Promise<NovelRevisionFinalizationDescriptor[]>

/**
 * List preference candidates attached to one exact final Revision.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable finalized chapter Asset identity.
 * @param finalRevisionId - exact final Revision identity.
 * @param signal - caller cancellation.
 * @returns browser-safe retained preference candidates.
 */
@Remote('preferenceCandidates') async preferenceCandidates( agent: Agent, assetId: AssetId, finalRevisionId: RevisionId, signal: AbortSignal, ): Promise<NovelPreferenceCandidateDescriptor[]>

/**
 * List Story State candidates attached to one exact final chapter Revision.
 * @param agent - addressed Agent whose Session selects the project root.
 * @param assetId - stable finalized chapter Asset identity.
 * @param finalRevisionId - exact final Revision identity.
 * @param signal - caller cancellation.
 * @returns browser-safe retained Story State candidates.
 */
@Remote('storyStateCandidates') async storyStateCandidates( agent: Agent, assetId: AssetId, finalRevisionId: RevisionId, signal: AbortSignal, ): Promise<NovelStoryStateCandidateDescriptor[]>

/**
 * Explicitly finalize the exact chapter Revision and optionally extract learning candidates.
 * @param agent - addressed Agent whose Session records the author decision.
 * @param assetId - stable chapter Asset identity.
 * @param revisionId - exact Revision selected as final.
 * @param signal - caller cancellation.
 * @returns browser-safe finalization plus optional learning candidates.
 */
@Remote('finalizeChapter') async finalizeChapter( agent: Agent, assetId: AssetId, revisionId: RevisionId, signal: AbortSignal, ): Promise<FinalizeNovelChapterDescriptor>

/**
 * Apply one reviewed preference candidate through the style ChangeSet protocol.
 * @param agent - addressed Agent whose Session records the author decision.
 * @param candidateId - stable pending preference candidate identity.
 * @param signal - caller cancellation.
 * @returns terminal candidate and browser-safe applied ChangeSet.
 */
@Remote('acceptPreference') async acceptPreference( agent: Agent, candidateId: PreferenceCandidateId, signal: AbortSignal, ): Promise<DecideNovelPreferenceDescriptor>

/**
 * Reject one pending preference candidate without changing authored assets.
 * @param agent - addressed Agent whose Session records the author decision.
 * @param candidateId - stable pending preference candidate identity.
 * @param signal - caller cancellation.
 * @returns browser-safe rejected preference candidate.
 */
@Remote('rejectPreference') async rejectPreference( agent: Agent, candidateId: PreferenceCandidateId, signal: AbortSignal, ): Promise<DecideNovelPreferenceDescriptor>

/**
 * Apply one reviewed Story State candidate through exact-Revision ChangeSet publication.
 * @param agent - addressed Agent whose Session records the author decision.
 * @param candidateId - stable pending Story State candidate identity.
 * @param signal - caller cancellation.
 * @returns terminal candidate and browser-safe applied ChangeSet.
 */
@Remote('acceptStoryState') async acceptStoryState( agent: Agent, candidateId: StoryStateCandidateId, signal: AbortSignal, ): Promise<DecideNovelStoryStateDescriptor>

/**
 * Reject one pending Story State candidate without changing authored assets.
 * @param agent - addressed Agent whose Session records the author decision.
 * @param candidateId - stable pending Story State candidate identity.
 * @param signal - caller cancellation.
 * @returns browser-safe rejected Story State candidate.
 */
@Remote('rejectStoryState') async rejectStoryState( agent: Agent, candidateId: StoryStateCandidateId, signal: AbortSignal, ): Promise<DecideNovelStoryStateDescriptor>

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

Package paths and Web boot readiness marker for Novel Studio.

Source: [`packages/experimental/novel-studio/src/index.ts`](../../packages/experimental/novel-studio/src/index.ts)

<a id="ctxnovelworkbenchready--novelworkbenchready"></a>

### `ctx.novelWorkbenchReady` — `NovelWorkbenchReady`

Host-side readiness marker for the browser workbench.

Its dependency ensures the repository adapter and all Host Novel services are ready before this final browser row announces the completed roster.

Source: [`packages/experimental/novel-workbench/src/index.ts`](../../packages/experimental/novel-workbench/src/index.ts)

<a id="novel-events"></a>

### `novel/*` events

<a id="novelskill-settings-changed--emit"></a>

#### `novel/skill-settings-changed` — emit

Emitted after one Novel Project publishes a replacement Skill activation policy.

```ts cordis-catalog
/**
 * Emitted after one Novel Project publishes a replacement Skill activation policy.
 * @param projectId - stable identity of the Novel Project whose policy changed.
 * @mode emit
 */
'novel/skill-settings-changed'(projectId: string): void
```

Source: [`packages/experimental/novel-repository/src/index.ts`](../../packages/experimental/novel-repository/src/index.ts)
<!-- END GENERATED cordis-surface -->
