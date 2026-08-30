/**
 * Local-filesystem Novel Repository provider. Project files remain current
 * authored truth; `.novel/history.sqlite` retains immutable Revisions.
 * @module @deepseek-ai/dsh-experimental-novel-repository-local
 */

import { constants as bufferConstants } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FsError, type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import NovelRepository, {
  ChangeSetId,
  AssetId,
  NovelRepositoryError,
  PreferenceCandidateId,
  StoryStateCandidateId,
  ProjectId,
  RevisionId,
  SelectionRefId,
  type Asset,
  type AssetRevision,
  type AssetRevisionSummary,
  type AssetSnapshot,
  type AssetSearchResult,
  type AssetSummary,
  type CaptureSelectionRequest,
  type ChangeSet,
  type ChangeSetAuthorization,
  type CreateAssetRequest,
  type DeleteAssetRequest,
  type DeleteAssetResult,
  type InitializeNovelProjectRequest,
  type NovelProjectSnapshot,
  type NovelAnalysisReport,
  type NovelGenerationLineage,
  type NovelPreferenceCandidate,
  type NovelStoryStateCandidate,
  type PutNovelPreferenceCandidateRequest,
  type PutNovelStoryStateCandidateRequest,
  type RevisionFinalization,
  type NovelSelectionInput,
  type ProposeChangeSetRequest,
  type PutNovelAnalysisReportRequest,
  type RevisionId as RevisionIdValue,
  type RevisionOrigin,
  type ReorderAssetsRequest,
  type RestoreAssetRevisionRequest,
  type RestoreAssetRevisionResult,
  type SaveAssetContentRequest,
  type SearchAssetsRequest,
  type SelectionRef,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type { ParsedNovelAsset } from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import {
  contentHash,
  declaredAssetType,
  manuscriptChapterTypeDefinition,
} from './content.ts'
import { hitApplyFault } from './apply-fault.ts'
import { NovelHistory, openHistory, validateGenerationLineage, type ApplyJournal } from './history.ts'
import { parseProjectManifest, serializeProjectManifest } from './manifest.ts'

const PROJECT_MANIFEST = 'novel.yaml'
const HISTORY_PATH = '.novel/history.sqlite'
const DEFAULT_MANIFEST_MAX_BYTES = 64 * 1024
const DEFAULT_ASSET_MAX_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_ASSETS = 10_000
const DEFAULT_SCAN_MAX_DEPTH = 64
const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_SELECTION_CONTEXT_CHARS = 32
const DEFAULT_SELECTION_PREVIEW_CHARS = 160
const DEFAULT_ANALYSIS_REPORT_MAX_BYTES = 1024 * 1024
const MAX_SEARCH_QUERY_CHARS = 200
const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT = 50
const SEARCH_EXCERPT_CHARS = 180
const MAX_BUFFER_BYTES = Math.min(bufferConstants.MAX_LENGTH, bufferConstants.MAX_STRING_LENGTH)

/** Local provider bounds and SQLite lock policy. */
export interface Config {
  /** Inclusive byte limit for the complete `novel.yaml`; defaults to 64 KiB. */
  manifestMaxBytes?: number
  /** Inclusive byte limit for one complete Asset file; defaults to 4 MiB. */
  assetMaxBytes?: number
  /** Maximum Assets accepted from one scan; defaults to 10,000. */
  maxAssets?: number
  /** Maximum directory nesting below any registered content root; defaults to 64. */
  scanMaxDepth?: number
  /** Maximum SQLite lock wait; defaults to five seconds. */
  busyTimeoutMs?: number
  /** Prefix and suffix UTF-16 units retained on a SelectionRef; defaults to 32. */
  selectionContextChars?: number
  /** Maximum UTF-16 units retained in selection preview; defaults to 160. */
  selectionPreviewChars?: number
  /** Inclusive JSON byte limit for one generated analysis report; defaults to 1 MiB. */
  analysisReportMaxBytes?: number
}

interface ResolvedConfig {
  manifestMaxBytes: number
  assetMaxBytes: number
  maxAssets: number
  scanMaxDepth: number
  busyTimeoutMs: number
  selectionContextChars: number
  selectionPreviewChars: number
  analysisReportMaxBytes: number
}

interface ObservedAsset {
  readonly target: FsTarget
  readonly version: FsVersion
  readonly parsed: ParsedNovelAsset
  readonly snapshot: AssetSnapshot
  readonly summary: AssetSummary
}

interface ScannedAssetFile {
  readonly target: FsTarget
  readonly version: FsVersion
  readonly projectRelativePath: string
  readonly parsed: ParsedNovelAsset
  readonly bytes: Uint8Array
}

interface ProjectState {
  readonly projectId: ProjectId
  readonly rootKey: string
  readonly history: NovelHistory
  tail: Promise<void>
  catalog: Map<AssetId, ObservedAsset>
}

/** Local provider for project discovery, chapter assets, and immutable history. */
export class LocalNovelRepository extends NovelRepository {
  static inject = ['fs', 'novelAssetTypes']
  static Config: z<Config> = z.object({
    manifestMaxBytes: z.number().default(DEFAULT_MANIFEST_MAX_BYTES),
    assetMaxBytes: z.number().default(DEFAULT_ASSET_MAX_BYTES),
    maxAssets: z.number().default(DEFAULT_MAX_ASSETS),
    scanMaxDepth: z.number().default(DEFAULT_SCAN_MAX_DEPTH),
    busyTimeoutMs: z.number().default(DEFAULT_BUSY_TIMEOUT_MS),
    selectionContextChars: z.number().default(DEFAULT_SELECTION_CONTEXT_CHARS),
    selectionPreviewChars: z.number().default(DEFAULT_SELECTION_PREVIEW_CHARS),
    analysisReportMaxBytes: z.number().default(DEFAULT_ANALYSIS_REPORT_MAX_BYTES),
  })

  /** Validated provider bounds. */
  readonly config: Readonly<ResolvedConfig>

  /** Inclusive byte limit for the complete project manifest. */
  get manifestMaxBytes(): number {
    return this.config.manifestMaxBytes
  }

  private readonly states = new Map<string, Promise<ProjectState>>()
  private readonly projectRoots = new Map<ProjectId, string>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.config = resolveConfig(config)
    ctx.novelAssetTypes.register(manuscriptChapterTypeDefinition)
    ctx.effect(() => async () => { await this.close() }, 'novelRepositoryLocal.close')
  }

  override async discoverProject(root: FsTarget, signal?: AbortSignal): Promise<NovelProjectSnapshot | undefined> {
    const rootInfo = await this.ctx.fs.stat(root, signal)
    if (rootInfo?.type !== 'directory') {
      throw new NovelRepositoryError(
        `novel repository: project root "${root.displayPath}" is not a directory`,
        'NOVEL_PROJECT_ROOT_INVALID',
      )
    }

    const cwd = this.ctx.fs.processPath(root)
    const resolveOptions = signal === undefined ? { cwd } : { cwd, signal }
    const markerInfo = await this.ctx.fs.lstat(PROJECT_MANIFEST, { cwd }, signal)
    if (markerInfo === undefined) return undefined
    const manifest = await this.ctx.fs.resolve(PROJECT_MANIFEST, resolveOptions)
    if (!this.ctx.fs.contains(root, manifest)) {
      throw new NovelRepositoryError(
        `novel repository: project manifest "${manifest.displayPath}" escapes the project root`,
        'NOVEL_PROJECT_PATH_ESCAPE',
      )
    }
    const manifestInfo = await this.ctx.fs.stat(manifest, signal)
    if (manifestInfo?.type !== 'file') {
      throw new NovelRepositoryError(
        `novel repository: project manifest "${manifest.displayPath}" is not a regular file`,
        'NOVEL_PROJECT_MANIFEST_INVALID',
      )
    }

    const bytes = await this.readBounded(
      manifest,
      this.config.manifestMaxBytes,
      'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
      signal,
    )
    if (bytes.includes(0)) {
      throw new NovelRepositoryError(
        `novel repository: project manifest "${manifest.displayPath}" contains a NUL byte`,
        'NOVEL_PROJECT_MANIFEST_INVALID',
      )
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (error: unknown) {
      throw new NovelRepositoryError(
        `novel repository: project manifest "${manifest.displayPath}" is not valid UTF-8`,
        'NOVEL_PROJECT_MANIFEST_INVALID',
        { cause: error },
      )
    }
    const parsed = parseProjectManifest(text, manifest.displayPath)

    const contentRoots: Record<string, FsTarget> = {}
    for (const [name, path] of Object.entries(parsed.contentRoots)) {
      const target = await this.ctx.fs.resolve(path, resolveOptions)
      if (!this.ctx.fs.contains(root, target)) {
        throw new NovelRepositoryError(
          `novel repository: content root ${JSON.stringify(name)} escapes the project root`,
          'NOVEL_PROJECT_PATH_ESCAPE',
        )
      }
      const targetInfo = await this.ctx.fs.stat(target, signal)
      if (targetInfo?.type !== 'directory') {
        throw new NovelRepositoryError(
          `novel repository: content root ${JSON.stringify(name)} is not an existing directory`,
          'NOVEL_PROJECT_MANIFEST_INVALID',
        )
      }
      contentRoots[name] = target
    }
    this.rememberProject(parsed.id, root)
    return {
      schema: 1,
      id: parsed.id,
      title: parsed.title,
      root: { ...root },
      manifest: { ...manifest },
      contentRoots,
      assetOrder: parsed.assetOrder,
      deletedAssetIds: parsed.deletedAssetIds,
    }
  }

  override async initializeProject(
    root: FsTarget,
    request: InitializeNovelProjectRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<NovelProjectSnapshot> {
    const rootInfo = await this.ctx.fs.stat(root, signal)
    if (rootInfo?.type !== 'directory') {
      throw new NovelRepositoryError(
        `novel repository: project root "${root.displayPath}" is not a directory`,
        'NOVEL_PROJECT_ROOT_INVALID',
      )
    }
    const title = request.title.trim()
    if (title.length === 0 || /[\u0000-\u001F\u007F]/u.test(title)) {
      throw new NovelRepositoryError(
        'novel repository: project title must contain visible text without control characters',
        'NOVEL_PROJECT_INITIALIZATION_INVALID',
      )
    }

    const cwd = this.ctx.fs.processPath(root)
    const resolveOptions = signal === undefined ? { cwd } : { cwd, signal }
    const markerInfo = await this.ctx.fs.lstat(PROJECT_MANIFEST, { cwd }, signal)
    if (markerInfo !== undefined) {
      throw new NovelRepositoryError(
        `novel repository: project manifest already exists at "${join(cwd, PROJECT_MANIFEST)}"`,
        'NOVEL_PROJECT_ALREADY_INITIALIZED',
      )
    }

    // The filesystem service intentionally exposes atomic file publication but
    // not an unguarded mkdir capability. A hidden create-only marker safely
    // materializes each provider-owned root through the same sandboxed seam.
    for (const path of ['manuscript', 'planning'] as const) {
      const pathInfo = await this.ctx.fs.lstat(path, { cwd }, signal)
      if (pathInfo !== undefined && pathInfo.type !== 'directory') {
        throw new NovelRepositoryError(
          `novel repository: cannot initialize because content root "${path}" is not a directory`,
          'NOVEL_PROJECT_CONTENT_ROOT_CONFLICT',
        )
      }
      if (pathInfo === undefined) {
        const keep = await this.ctx.fs.resolve(`${path}/.gitkeep`, resolveOptions)
        if (!this.ctx.fs.contains(root, keep)) {
          throw new NovelRepositoryError(
            `novel repository: content root "${path}" escapes the project root`,
            'NOVEL_PROJECT_PATH_ESCAPE',
          )
        }
        await this.ctx.fs.writeText(keep, '', { kind: 'createIfAbsent' }, signal, sandboxPolicy)
      }
    }

    // Publish the manifest last: it is the activation commit marker. A crash
    // before this point leaves only harmless empty roots and a retry is safe.
    const manifest = await this.ctx.fs.resolve(PROJECT_MANIFEST, resolveOptions)
    if (!this.ctx.fs.contains(root, manifest)) {
      throw new NovelRepositoryError(
        `novel repository: project manifest "${manifest.displayPath}" escapes the project root`,
        'NOVEL_PROJECT_PATH_ESCAPE',
      )
    }
    const text = serializeProjectManifest({
      schema: 1,
      id: ProjectId(`project-${randomUUID()}`),
      title,
      contentRoots: { manuscript: 'manuscript', planning: 'planning' },
      assetOrder: {},
      deletedAssetIds: [],
    })
    if (new TextEncoder().encode(text).byteLength > this.config.manifestMaxBytes) {
      throw new NovelRepositoryError(
        `novel repository: generated project manifest exceeds ${this.config.manifestMaxBytes} bytes`,
        'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
      )
    }
    await this.ctx.fs.writeText(manifest, text, { kind: 'createIfAbsent' }, signal, sandboxPolicy)
    const initialized = await this.discoverProject(root, signal)
    if (initialized === undefined) {
      throw new NovelRepositoryError(
        'novel repository: initialized project could not be rediscovered',
        'NOVEL_PROJECT_INITIALIZATION_INVALID',
      )
    }
    return initialized
  }

  override async listAssets(
    project: NovelProjectSnapshot,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<readonly AssetSummary[]> {
    return await this.withProject(project, async (state) => {
      const catalog = await this.scan(project, state, signal, sandboxPolicy, true)
      const manifestBytes = await this.readBounded(
        project.manifest,
        this.config.manifestMaxBytes,
        'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
        signal,
      )
      const manifest = parseProjectManifest(new TextDecoder().decode(manifestBytes), project.manifest.displayPath)
      if (manifest.id !== project.id) {
        throw new NovelRepositoryError('novel repository: project identity changed while listing Assets', 'NOVEL_PROJECT_ID_CONFLICT')
      }
      return orderedSummaries(catalog, manifest.assetOrder)
    })
  }

  override async reorderAssets(
    project: NovelProjectSnapshot,
    request: ReorderAssetsRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<readonly AssetSummary[]> {
    return await this.withProject(project, async (state) => {
      const catalog = await this.scan(project, state, signal, sandboxPolicy)
      this.ctx.novelAssetTypes.get(request.type)
      const current = [...catalog.values()]
        .filter(value => sameAssetType(value.summary.asset.type, request.type))
        .map(value => value.summary.asset.id)
      const received = [...request.orderedAssetIds]
      if (received.length !== current.length || new Set(received).size !== received.length) {
        throw new NovelRepositoryError(
          'novel repository: reordered Asset ids must contain every current Asset of the requested type exactly once',
          'NOVEL_ASSET_INVALID',
        )
      }
      const currentSet = new Set(current)
      if (received.some(id => !currentSet.has(id))) {
        throw new NovelRepositoryError(
          'novel repository: reordered Asset ids must contain every current Asset of the requested type exactly once',
          'NOVEL_ASSET_INVALID',
        )
      }

      const before = await this.ctx.fs.stat(project.manifest, signal)
      if (before?.type !== 'file') {
        throw new NovelRepositoryError('novel repository: project manifest changed during reorder', 'NOVEL_PROJECT_MANIFEST_INVALID')
      }
      const manifestBytes = await this.readBounded(
        project.manifest,
        this.config.manifestMaxBytes,
        'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
        signal,
      )
      const after = await this.ctx.fs.stat(project.manifest, signal)
      if (after?.type !== 'file' || after.version !== before.version) {
        throw new NovelRepositoryError('novel repository: project manifest changed during reorder', 'NOVEL_PROJECT_MANIFEST_INVALID')
      }
      const parsed = parseProjectManifest(new TextDecoder().decode(manifestBytes), project.manifest.displayPath)
      if (parsed.id !== project.id) {
        throw new NovelRepositoryError('novel repository: project identity changed during reorder', 'NOVEL_PROJECT_ID_CONFLICT')
      }
      const assetOrder = { ...parsed.assetOrder, [request.type]: received }
      const text = serializeProjectManifest({ ...parsed, assetOrder })
      if (new TextEncoder().encode(text).byteLength > this.config.manifestMaxBytes) {
        throw new NovelRepositoryError(
          `novel repository: reordered project manifest exceeds ${this.config.manifestMaxBytes} bytes`,
          'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
        )
      }
      try {
        await this.ctx.fs.writeText(
          project.manifest,
          text,
          { kind: 'replaceIfVersion', version: after.version },
          signal,
          sandboxPolicy,
        )
      } catch (error: unknown) {
        if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
        throw new NovelRepositoryError(
          'novel repository: project manifest changed during reorder',
          'NOVEL_PROJECT_MANIFEST_INVALID',
          { cause: error },
        )
      }
      return orderedSummaries(catalog, assetOrder)
    })
  }

  override async searchAssets(
    project: NovelProjectSnapshot,
    request: SearchAssetsRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<readonly AssetSearchResult[]> {
    const query = request.query.trim()
    if (query.length === 0 || query.length > MAX_SEARCH_QUERY_CHARS) {
      throw new NovelRepositoryError(
        `novel repository: search query must contain 1-${MAX_SEARCH_QUERY_CHARS} characters`,
        'NOVEL_SEARCH_INVALID',
      )
    }
    const limit = request.limit ?? DEFAULT_SEARCH_LIMIT
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw new NovelRepositoryError(
        `novel repository: search limit must be an integer between 1 and ${MAX_SEARCH_LIMIT}`,
        'NOVEL_SEARCH_INVALID',
      )
    }
    const types = request.types === undefined ? undefined : new Set(request.types)
    return await this.withProject(project, async (state) => {
      const catalog = await this.scan(project, state, signal, sandboxPolicy, true)
      const lowered = query.toLocaleLowerCase()
      const results: AssetSearchResult[] = []
      for (const observed of catalog.values()) {
        signal?.throwIfAborted()
        if (types !== undefined && !types.has(observed.summary.asset.type)) continue
        const title = observed.summary.title
        const titleLower = title.toLocaleLowerCase()
        const modelText = this.ctx.novelAssetTypes.get(observed.summary.asset.type).modelText(observed.snapshot)
        const normalizedModelText = modelText.replace(/\s+/gu, ' ').trim()
        const bodyLower = normalizedModelText.toLocaleLowerCase()
        const titleIndex = titleLower.indexOf(lowered)
        const bodyIndex = bodyLower.indexOf(lowered)
        if (titleIndex < 0 && bodyIndex < 0) continue
        const score = titleLower === lowered ? 1_000
          : titleIndex === 0 ? 850
            : titleIndex > 0 ? 700
              : Math.max(100, 500 - Math.min(bodyIndex, 400))
        results.push({
          summary: cloneSummary(observed.summary),
          excerpt: searchExcerpt(normalizedModelText, bodyIndex < 0 ? 0 : bodyIndex, lowered.length),
          score,
        })
      }
      return results
        .sort((left, right) => right.score - left.score
          || left.summary.title.localeCompare(right.summary.title)
          || left.summary.asset.id.localeCompare(right.summary.asset.id))
        .slice(0, limit)
    })
  }

  override async readAsset(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId?: RevisionIdValue,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<AssetSnapshot> {
    return await this.withProject(project, async (state) => {
      signal?.throwIfAborted()
      if (revisionId === undefined) {
        const asset = (await this.scan(project, state, signal, sandboxPolicy, true)).get(assetId)
        if (asset === undefined) throw assetNotFound(assetId)
        return cloneSnapshot(asset.snapshot)
      }
      return this.snapshotFromHistory(project, state, assetId, revisionId)
    })
  }

  override async listAssetRevisions(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    signal?: AbortSignal,
  ): Promise<readonly AssetRevisionSummary[]> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const revisions = state.history.revisions(project.id, assetId)
      if (revisions.length === 0) throw assetNotFound(assetId)
      return revisions.map(revision => ({ ...revision }))
    })
  }

  override async restoreAssetRevision(
    project: NovelProjectSnapshot,
    request: RestoreAssetRevisionRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<RestoreAssetRevisionResult> {
    return await this.withProject(project, async (state) => {
      signal?.throwIfAborted()
      const catalog = await this.scan(project, state, signal, sandboxPolicy)
      const current = catalog.get(request.assetId)
      if (current === undefined) throw assetNotFound(request.assetId)
      if (current.snapshot.revisionId !== request.baseRevisionId) throw staleRevision(request.baseRevisionId)
      if (request.sourceRevisionId === request.baseRevisionId) {
        throw new NovelRepositoryError(
          'novel repository: restore source is already the current Revision',
          'NOVEL_REVISION_STALE',
        )
      }
      const source = state.history.revision(request.sourceRevisionId)
      if (source === undefined || source.revision.projectId !== project.id
        || source.revision.assetId !== request.assetId) {
        throw new NovelRepositoryError(
          `novel repository: Revision ${JSON.stringify(request.sourceRevisionId)} was not retained for asset ${JSON.stringify(request.assetId)}`,
          'NOVEL_REVISION_NOT_FOUND',
        )
      }
      if (contentHash(source.revision.serializedUtf8) !== source.revision.contentHash) {
        throw new NovelRepositoryError('novel repository: retained restore source is corrupt', 'NOVEL_HISTORY_CORRUPT')
      }
      const declaredType = declaredAssetType(
        source.revision.serializedUtf8,
        current.summary.asset.projectRelativePath,
      )
      const definition = this.ctx.novelAssetTypes.get(declaredType)
      const parsed = definition.parse(source.revision.serializedUtf8, current.summary.asset.projectRelativePath)
      if (parsed.id !== request.assetId || !sameAssetType(parsed.type, current.snapshot.asset.type)) {
        throw new NovelRepositoryError(
          'novel repository: restored bytes change the current asset identity or type',
          'NOVEL_ASSET_INVALID',
        )
      }
      const revision = restoredRevision(
        project.id,
        request.assetId,
        request.baseRevisionId,
        request.sourceRevisionId,
        request.restoredBySessionId,
        source.revision.serializedUtf8,
      )
      const candidate = observedAsset(
        project,
        current.summary.asset.projectRelativePath,
        current.target,
        current.version,
        parsed,
        revision,
      )
      const nextCatalog = new Map(catalog)
      nextCatalog.set(request.assetId, candidate)
      validateCatalogRelationships(nextCatalog, this.ctx.novelAssetTypes)

      let outcome
      try {
        outcome = await this.ctx.fs.writeText(
          current.target,
          new TextDecoder().decode(source.revision.serializedUtf8),
          { kind: 'replaceIfVersion', version: current.version },
          signal,
          sandboxPolicy,
        )
      } catch (error: unknown) {
        if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
        await this.scan(project, state, signal, sandboxPolicy)
        throw staleRevision(request.baseRevisionId, error)
      }

      const conflictedChangeSetCount = state.history.commitRestoredRevision(
        revision,
        current.summary.asset.projectRelativePath,
      )
      const observed = observedAsset(
        project,
        current.summary.asset.projectRelativePath,
        current.target,
        outcome.version,
        parsed,
        revision,
      )
      state.catalog.set(request.assetId, observed)
      return {
        snapshot: cloneSnapshot(observed.snapshot),
        conflictedChangeSetCount,
        storyStateReviewRecommended: sameAssetType(observed.snapshot.asset.type, 'manuscript.chapter')
          && [...state.catalog.values()].some(asset => sameAssetType(asset.parsed.type, 'book.story-state')),
      }
    })
  }

  override async finalizeRevision(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId: RevisionIdValue,
    finalizedBySessionId: RevisionFinalization['finalizedBySessionId'],
    signal?: AbortSignal,
  ): Promise<RevisionFinalization> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const snapshot = this.snapshotFromHistory(project, state, assetId, revisionId)
      if (!sameAssetType(snapshot.asset.type, 'manuscript.chapter')) {
        throw new NovelRepositoryError(
          'novel repository: only manuscript.chapter Revisions can be finalized',
          'NOVEL_FINALIZATION_INVALID',
        )
      }
      const existing = state.history.finalization(project.id, assetId, revisionId)
      if (existing !== undefined) return existing
      let cursor: RevisionIdValue | undefined = revisionId
      let sourceRevisionId: RevisionIdValue | undefined
      let sourceChangeSet: ChangeSet | undefined
      while (cursor !== undefined) {
        const retained: AssetRevision | undefined = state.history.revision(cursor)?.revision
        if (retained === undefined || retained.projectId !== project.id || retained.assetId !== assetId) break
        if (retained.origin === 'agent-apply') {
          sourceRevisionId = retained.id
          sourceChangeSet = state.history.changeSetByResultRevision(retained.id)
          break
        }
        cursor = retained.parentRevisionId
      }
      return state.history.putFinalization({
        projectId: project.id,
        assetId,
        revisionId,
        finalizedAt: new Date().toISOString(),
        finalizedBySessionId,
        ...(sourceRevisionId === undefined ? {} : { sourceRevisionId }),
        ...(sourceChangeSet === undefined ? {} : { sourceChangeSetId: sourceChangeSet.id }),
        ...(sourceChangeSet?.actor.kind === 'agent' ? { sourceSessionId: sourceChangeSet.actor.sessionId } : {}),
      })
    })
  }

  override async listRevisionFinalizations(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    signal?: AbortSignal,
  ): Promise<readonly RevisionFinalization[]> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      if (state.history.revisions(project.id, assetId).length === 0) throw assetNotFound(assetId)
      return state.history.finalizations(project.id, assetId).map(value => ({ ...value }))
    })
  }

  override async putPreferenceCandidate(
    project: NovelProjectSnapshot,
    request: PutNovelPreferenceCandidateRequest,
    signal?: AbortSignal,
  ): Promise<NovelPreferenceCandidate> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      this.snapshotFromHistory(project, state, request.assetId, request.sourceRevisionId)
      this.snapshotFromHistory(project, state, request.assetId, request.finalRevisionId)
      const style = this.snapshotFromHistory(project, state, request.targetStyleAssetId, request.targetStyleRevisionId)
      if (!sameAssetType(style.asset.type, 'book.style-profile')) {
        throw new NovelRepositoryError('novel repository: preference target is not book.style-profile', 'NOVEL_PREFERENCE_CANDIDATE_INVALID')
      }
      validatePreferenceCandidateInput(request, this.config.analysisReportMaxBytes)
      return structuredClone(state.history.putPreferenceCandidate({
        id: PreferenceCandidateId(`preference_${randomUUID()}`),
        projectId: project.id,
        ...request,
        status: 'pending',
      }))
    })
  }

  override async listPreferenceCandidates(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    finalRevisionId: RevisionIdValue,
    signal?: AbortSignal,
  ): Promise<readonly NovelPreferenceCandidate[]> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      this.snapshotFromHistory(project, state, assetId, finalRevisionId)
      return state.history.preferenceCandidates(project.id, assetId, finalRevisionId).map(value => structuredClone(value))
    })
  }

  override async readPreferenceCandidate(
    project: NovelProjectSnapshot,
    candidateId: PreferenceCandidateId,
    signal?: AbortSignal,
  ): Promise<NovelPreferenceCandidate> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const value = state.history.preferenceCandidate(candidateId)
      if (value === undefined || value.projectId !== project.id) {
        throw new NovelRepositoryError('novel repository: preference candidate not found', 'NOVEL_PREFERENCE_CANDIDATE_NOT_FOUND')
      }
      return structuredClone(value)
    })
  }

  override async decidePreferenceCandidate(
    project: NovelProjectSnapshot,
    candidateId: PreferenceCandidateId,
    decision: 'accepted' | 'rejected',
    decidedBySessionId: RevisionFinalization['finalizedBySessionId'],
    result?: { readonly changeSetId: ChangeSetId; readonly revisionId: RevisionIdValue },
    signal?: AbortSignal,
  ): Promise<NovelPreferenceCandidate> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const current = state.history.preferenceCandidate(candidateId)
      if (current === undefined || current.projectId !== project.id) {
        throw new NovelRepositoryError('novel repository: preference candidate not found', 'NOVEL_PREFERENCE_CANDIDATE_NOT_FOUND')
      }
      if (decision === 'accepted' && result === undefined) {
        throw new NovelRepositoryError('novel repository: accepted preference requires applied ChangeSet lineage', 'NOVEL_PREFERENCE_CANDIDATE_INVALID')
      }
      const decided = state.history.decidePreferenceCandidate(
        candidateId, decision, new Date().toISOString(), decidedBySessionId, result,
      )
      if (decided === undefined) throw new NovelRepositoryError('novel repository: preference candidate not found', 'NOVEL_PREFERENCE_CANDIDATE_NOT_FOUND')
      return structuredClone(decided)
    })
  }

  override async putStoryStateCandidate(
    project: NovelProjectSnapshot,
    request: PutNovelStoryStateCandidateRequest,
    signal?: AbortSignal,
  ): Promise<NovelStoryStateCandidate> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const chapter = this.snapshotFromHistory(project, state, request.assetId, request.finalRevisionId)
      if (!sameAssetType(chapter.asset.type, 'manuscript.chapter')) {
        throw new NovelRepositoryError('novel repository: Story State source is not manuscript.chapter', 'NOVEL_STORY_STATE_CANDIDATE_INVALID')
      }
      const target = this.snapshotFromHistory(
        project, state, request.targetStoryStateAssetId, request.targetStoryStateRevisionId,
      )
      if (!sameAssetType(target.asset.type, 'book.story-state')) {
        throw new NovelRepositoryError('novel repository: Story State target is not book.story-state', 'NOVEL_STORY_STATE_CANDIDATE_INVALID')
      }
      validateStoryStateCandidateInput(request, this.config.analysisReportMaxBytes)
      return structuredClone(state.history.putStoryStateCandidate({
        id: StoryStateCandidateId(`story_state_${randomUUID()}`),
        projectId: project.id,
        ...request,
        status: 'pending',
      }))
    })
  }

  override async listStoryStateCandidates(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    finalRevisionId: RevisionIdValue,
    signal?: AbortSignal,
  ): Promise<readonly NovelStoryStateCandidate[]> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      this.snapshotFromHistory(project, state, assetId, finalRevisionId)
      return state.history.storyStateCandidates(project.id, assetId, finalRevisionId)
        .map(value => structuredClone(value))
    })
  }

  override async readStoryStateCandidate(
    project: NovelProjectSnapshot,
    candidateId: StoryStateCandidateId,
    signal?: AbortSignal,
  ): Promise<NovelStoryStateCandidate> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const value = state.history.storyStateCandidate(candidateId)
      if (value === undefined || value.projectId !== project.id) {
        throw new NovelRepositoryError('novel repository: Story State candidate not found', 'NOVEL_STORY_STATE_CANDIDATE_NOT_FOUND')
      }
      return structuredClone(value)
    })
  }

  override async decideStoryStateCandidate(
    project: NovelProjectSnapshot,
    candidateId: StoryStateCandidateId,
    decision: 'accepted' | 'rejected',
    decidedBySessionId: RevisionFinalization['finalizedBySessionId'],
    result?: { readonly changeSetId: ChangeSetId; readonly revisionId: RevisionIdValue },
    signal?: AbortSignal,
  ): Promise<NovelStoryStateCandidate> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const current = state.history.storyStateCandidate(candidateId)
      if (current === undefined || current.projectId !== project.id) {
        throw new NovelRepositoryError('novel repository: Story State candidate not found', 'NOVEL_STORY_STATE_CANDIDATE_NOT_FOUND')
      }
      if (decision === 'accepted' && result === undefined) {
        throw new NovelRepositoryError(
          'novel repository: accepted Story State requires applied ChangeSet lineage',
          'NOVEL_STORY_STATE_CANDIDATE_INVALID',
        )
      }
      const decided = state.history.decideStoryStateCandidate(
        candidateId, decision, new Date().toISOString(), decidedBySessionId, result,
      )
      if (decided === undefined) {
        throw new NovelRepositoryError('novel repository: Story State candidate not found', 'NOVEL_STORY_STATE_CANDIDATE_NOT_FOUND')
      }
      return structuredClone(decided)
    })
  }

  override async listAnalysisReports(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId: RevisionIdValue,
    signal?: AbortSignal,
  ): Promise<readonly NovelAnalysisReport[]> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      this.snapshotFromHistory(project, state, assetId, revisionId)
      return state.history.analysisReports(project.id, assetId, revisionId)
        .map(report => structuredClone(report))
    })
  }

  override async putAnalysisReport(
    project: NovelProjectSnapshot,
    request: PutNovelAnalysisReportRequest,
    signal?: AbortSignal,
  ): Promise<NovelAnalysisReport> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      this.snapshotFromHistory(project, state, request.assetId, request.revisionId)
      const analyzerVersion = request.analyzerVersion.trim()
      if (analyzerVersion.length === 0 || analyzerVersion.length > 100 || analyzerVersion !== request.analyzerVersion) {
        throw new NovelRepositoryError('novel repository: analysis analyzer version is invalid', 'NOVEL_ASSET_INVALID')
      }
      if (!Number.isFinite(Date.parse(request.generatedAt))) {
        throw new NovelRepositoryError('novel repository: analysis generation time is invalid', 'NOVEL_ASSET_INVALID')
      }
      const dataText = JSON.stringify(request.data)
      if (new TextEncoder().encode(dataText).byteLength > this.config.analysisReportMaxBytes) {
        throw new NovelRepositoryError(
          `novel repository: analysis report exceeds ${this.config.analysisReportMaxBytes} bytes`,
          'NOVEL_ASSET_TOO_LARGE',
        )
      }
      const report: NovelAnalysisReport = {
        projectId: project.id,
        assetId: request.assetId,
        revisionId: request.revisionId,
        kind: request.kind,
        analyzerVersion,
        generatedAt: request.generatedAt,
        data: structuredClone(request.data),
        ...(request.sourceSessionId === undefined ? {} : { sourceSessionId: request.sourceSessionId }),
        ...(request.workerSessionId === undefined ? {} : { workerSessionId: request.workerSessionId }),
      }
      state.history.putAnalysisReport(report)
      return structuredClone(report)
    })
  }

  override async createAsset(
    project: NovelProjectSnapshot,
    request: CreateAssetRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<AssetSnapshot> {
    return await this.withProject(project, async (state) => {
      const catalog = await this.scan(project, state, signal, sandboxPolicy)
      if (catalog.size >= this.config.maxAssets) {
        throw new NovelRepositoryError(
          `novel repository: project contains at least ${this.config.maxAssets} authored assets`,
          'NOVEL_ASSET_INVALID',
        )
      }
      const definition = this.ctx.novelAssetTypes.get(request.type)
      if (definition.create === undefined) {
        throw new NovelRepositoryError(
          `novel repository: Asset type ${JSON.stringify(definition.type)} does not support direct creation`,
          'NOVEL_ASSET_INVALID',
        )
      }
      const contentRoot = project.contentRoots[definition.contentRoot]
      if (contentRoot === undefined) {
        throw new NovelRepositoryError(
          `novel repository: project does not declare content root ${JSON.stringify(definition.contentRoot)} for Asset type ${JSON.stringify(definition.type)}`,
          'NOVEL_PROJECT_MANIFEST_INVALID',
        )
      }
      const id = AssetId(`asset_${randomUUID()}`)
      const extension = definition.extensions[0]
      if (extension === undefined) throw new NovelRepositoryError('novel repository: Asset type has no file extension', 'NOVEL_ASSET_INVALID')
      const target = await this.ctx.fs.resolve(`${id}${extension}`, {
        cwd: this.ctx.fs.processPath(contentRoot),
        ...(signal === undefined ? {} : { signal }),
      })
      if (!this.ctx.fs.contains(contentRoot, target) || !this.ctx.fs.contains(project.root, target)) {
        throw new NovelRepositoryError('novel repository: generated Asset path escapes its content root', 'NOVEL_PROJECT_PATH_ESCAPE')
      }
      const projectRelativePath = relativeProjectPath(project, target, this.ctx.fs.processPath.bind(this.ctx.fs))
      const materialized = definition.create({
        id,
        title: request.title,
        ...(request.parentId === undefined ? {} : { parentId: request.parentId }),
        content: request.content,
      }, projectRelativePath)
      if (materialized.serializedUtf8.byteLength > this.config.assetMaxBytes) {
        throw new NovelRepositoryError(
          `novel repository: asset exceeds ${this.config.assetMaxBytes} bytes`,
          'NOVEL_ASSET_TOO_LARGE',
        )
      }
      if (materialized.parsed.id !== id || !sameAssetType(materialized.parsed.type, definition.type)
        || materialized.parsed.parentId !== request.parentId) {
        throw new NovelRepositoryError('novel repository: Asset creator changed identity, type, or parent', 'NOVEL_ASSET_INVALID')
      }
      validateProjectSingleton(materialized.parsed, definition, catalog)
      validateParentRelationship(materialized.parsed, definition, catalog)
      const generation = generationForActor(request.generation, request.actor, 'NOVEL_ASSET_INVALID')
      const outcome = await this.ctx.fs.writeText(
        target,
        new TextDecoder().decode(materialized.serializedUtf8),
        { kind: 'createIfAbsent' },
        signal,
        sandboxPolicy,
      )
      const revision = newRevision(
        project.id,
        id,
        undefined,
        materialized.serializedUtf8,
        request.actor.kind === 'agent' ? 'agent-apply' : 'user-edit',
        generation,
      )
      state.history.commitRevision(revision, projectRelativePath)
      const observed = observedAsset(project, projectRelativePath, target, outcome.version, materialized.parsed, revision)
      state.catalog.set(id, observed)
      return cloneSnapshot(observed.snapshot)
    })
  }

  override async deleteAsset(
    project: NovelProjectSnapshot,
    request: DeleteAssetRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<DeleteAssetResult> {
    return await this.withProject(project, async (state) => {
      const catalog = await this.scan(project, state, signal, sandboxPolicy, true)
      const current = catalog.get(request.assetId)
      if (current === undefined) throw assetNotFound(request.assetId)
      if (current.snapshot.revisionId !== request.baseRevisionId) throw staleRevision(request.baseRevisionId)

      const deleted = new Set<AssetId>([request.assetId])
      let grew = true
      while (grew) {
        grew = false
        for (const observed of catalog.values()) {
          if (observed.parsed.parentId !== undefined && deleted.has(observed.parsed.parentId)
            && !deleted.has(observed.parsed.id)) {
            deleted.add(observed.parsed.id)
            grew = true
          }
        }
      }

      const before = await this.ctx.fs.stat(project.manifest, signal)
      if (before?.type !== 'file') throw new NovelRepositoryError(
        'novel repository: project manifest changed during Asset deletion',
        'NOVEL_PROJECT_MANIFEST_INVALID',
      )
      const manifestBytes = await this.readBounded(
        project.manifest,
        this.config.manifestMaxBytes,
        'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
        signal,
      )
      const after = await this.ctx.fs.stat(project.manifest, signal)
      if (after?.type !== 'file' || after.version !== before.version) throw new NovelRepositoryError(
        'novel repository: project manifest changed during Asset deletion',
        'NOVEL_PROJECT_MANIFEST_INVALID',
      )
      const parsed = parseProjectManifest(new TextDecoder().decode(manifestBytes), project.manifest.displayPath)
      if (parsed.id !== project.id) throw new NovelRepositoryError(
        'novel repository: project identity changed during Asset deletion',
        'NOVEL_PROJECT_ID_CONFLICT',
      )
      const deletedAssetIds = [...new Set([...parsed.deletedAssetIds, ...deleted])]
      const assetOrder = Object.fromEntries(Object.entries(parsed.assetOrder)
        .map(([type, ids]) => [type, ids.filter(id => !deleted.has(id))]))
      const text = serializeProjectManifest({ ...parsed, assetOrder, deletedAssetIds })
      if (new TextEncoder().encode(text).byteLength > this.config.manifestMaxBytes) throw new NovelRepositoryError(
        `novel repository: deleted-Asset manifest exceeds ${this.config.manifestMaxBytes} bytes`,
        'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
      )
      try {
        await this.ctx.fs.writeText(
          project.manifest,
          text,
          { kind: 'replaceIfVersion', version: after.version },
          signal,
          sandboxPolicy,
        )
      } catch (error: unknown) {
        if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
        throw new NovelRepositoryError(
          'novel repository: project manifest changed during Asset deletion',
          'NOVEL_PROJECT_MANIFEST_INVALID',
          { cause: error },
        )
      }
      for (const id of deleted) state.catalog.delete(id)
      state.history.conflictProposedChangeSets(project.id, [...deleted])
      return {
        deletedAssetIds: [...deleted],
        assets: orderedSummaries(state.catalog, assetOrder),
      }
    })
  }

  override async saveAssetContent(
    project: NovelProjectSnapshot,
    request: SaveAssetContentRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<AssetSnapshot> {
    return await this.withProject(project, async (state) => {
      const current = (await this.scan(project, state, signal, sandboxPolicy)).get(request.assetId)
      if (current === undefined) throw assetNotFound(request.assetId)
      if (current.snapshot.revisionId !== request.baseRevisionId) throw staleRevision(request.baseRevisionId)
      const definition = this.ctx.novelAssetTypes.get(current.snapshot.asset.type)
      const materialized = definition.serializeContent(current.snapshot, request.content, request.title)
      const bytes = materialized.serializedUtf8
      if (bytes.byteLength > this.config.assetMaxBytes) {
        throw new NovelRepositoryError(
          `novel repository: asset exceeds ${this.config.assetMaxBytes} bytes`,
          'NOVEL_ASSET_TOO_LARGE',
        )
      }
      if (materialized.parsed.id !== request.assetId
        || !sameAssetType(materialized.parsed.type, current.snapshot.asset.type)) {
        throw new NovelRepositoryError('novel repository: authored save changed the asset identity or type', 'NOVEL_ASSET_INVALID')
      }
      // The browser keeps keystrokes in a local draft. This Host-side guard also makes
      // repeated semantic save barriers idempotent instead of manufacturing empty history.
      if (contentHash(bytes) === current.snapshot.contentHash) return cloneSnapshot(current.snapshot)
      const serializedText = new TextDecoder().decode(bytes)
      let outcome
      try {
        outcome = await this.ctx.fs.writeText(
          current.target,
          serializedText,
          { kind: 'replaceIfVersion', version: current.version },
          signal,
          sandboxPolicy,
        )
      } catch (error: unknown) {
        if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
        await this.scan(project, state, signal, sandboxPolicy)
        throw staleRevision(request.baseRevisionId, error)
      }
      const revision = newRevision(
        project.id,
        request.assetId,
        request.baseRevisionId,
        bytes,
        'user-edit',
      )
      state.history.commitRevision(revision, current.summary.asset.projectRelativePath)
      const observed = observedAsset(
        project,
        current.summary.asset.projectRelativePath,
        current.target,
        outcome.version,
        materialized.parsed,
        revision,
      )
      state.catalog.set(request.assetId, observed)
      return cloneSnapshot(observed.snapshot)
    })
  }

  override async captureSelection<Input extends NovelSelectionInput>(
    project: NovelProjectSnapshot,
    request: CaptureSelectionRequest<Input>,
    signal?: AbortSignal,
  ): Promise<SelectionRef<Input>> {
    const selection = await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const snapshot = this.snapshotFromHistory(project, state, request.assetId, request.revisionId)
      const captured = this.ctx.novelAssetTypes.get(snapshot.asset.type).captureSelection(
        snapshot,
        request.selector,
        {
          contextUnits: this.config.selectionContextChars,
          previewUnits: this.config.selectionPreviewChars,
        },
      )
      return {
        version: 1,
        id: SelectionRefId(`selection_${randomUUID()}`),
        projectId: project.id,
        assetId: request.assetId,
        revisionId: request.revisionId,
        selector: structuredClone(captured.selector),
        ...(captured.preview === undefined ? {} : { preview: captured.preview }),
      }
    })
    return selection as SelectionRef<Input>
  }

  override async proposeChangeSet(
    project: NovelProjectSnapshot,
    request: ProposeChangeSetRequest,
    signal?: AbortSignal,
  ): Promise<ChangeSet> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const base = this.snapshotFromHistory(project, state, request.assetId, request.baseRevisionId)
      const definition = this.ctx.novelAssetTypes.get(base.asset.type)
      const candidate = definition.materializeOperations(base, request.operations)
      if (candidate.serializedUtf8.byteLength > this.config.assetMaxBytes) {
        throw invalidChangeSet(`result exceeds ${this.config.assetMaxBytes} bytes`)
      }
      const summary = request.summary.trim()
      if (summary.length === 0 || summary.length > 500 || request.summary !== summary) {
        throw invalidChangeSet('summary must be 1 to 500 characters without surrounding whitespace')
      }
      const generation = generationForActor(request.generation, request.actor)
      const changeSet: ChangeSet = {
        id: ChangeSetId(`changeset_${randomUUID()}`),
        projectId: project.id,
        assetId: request.assetId,
        assetType: base.asset.type,
        baseRevisionId: request.baseRevisionId,
        operations: structuredClone(request.operations),
        actor: { ...request.actor },
        summary,
        status: 'proposed',
        ...(generation === undefined ? {} : { generation }),
      }
      state.history.proposeChangeSet(changeSet)
      return cloneChangeSet(changeSet)
    })
  }

  override async readChangeSet(
    project: NovelProjectSnapshot,
    changeSetId: ChangeSetId,
    signal?: AbortSignal,
  ): Promise<ChangeSet> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      return cloneChangeSet(this.changeSetForProject(state, project.id, changeSetId))
    })
  }

  override async applyChangeSet(
    project: NovelProjectSnapshot,
    changeSetId: ChangeSetId,
    authorization: ChangeSetAuthorization,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<ChangeSet> {
    return await this.withProject(project, async (state) => {
      signal?.throwIfAborted()
      await this.scan(project, state, signal, sandboxPolicy)
      let changeSet = this.changeSetForProject(state, project.id, changeSetId)
      authorizeChangeSet(changeSet, authorization)
      if (changeSet.status !== 'proposed') return cloneChangeSet(changeSet)

      const current = state.catalog.get(changeSet.assetId)
      if (current === undefined) {
        changeSet = state.history.conflictApply(changeSet.id)
        return cloneChangeSet(changeSet)
      }
      if (current.snapshot.revisionId !== changeSet.baseRevisionId) {
        changeSet = state.history.conflictApply(changeSet.id)
        return cloneChangeSet(changeSet)
      }
      if (!sameAssetType(current.snapshot.asset.type, changeSet.assetType)) {
        throw new NovelRepositoryError('novel repository: ChangeSet asset type does not match the current asset', 'NOVEL_HISTORY_CORRUPT')
      }
      const materialized = this.ctx.novelAssetTypes.get(changeSet.assetType)
        .materializeOperations(current.snapshot, changeSet.operations)
      if (materialized.serializedUtf8.byteLength > this.config.assetMaxBytes) {
        throw invalidChangeSet(`result exceeds ${this.config.assetMaxBytes} bytes`)
      }
      const resultRevisionId = RevisionId(`revision_${randomUUID()}`)
      const createdAt = new Date().toISOString()
      const journal: ApplyJournal = {
        changeSetId,
        authorizedSessionId: authorization.sessionId,
        projectRelativePath: current.summary.asset.projectRelativePath,
        beforeHash: current.snapshot.contentHash,
        afterHash: contentHash(materialized.serializedUtf8),
        afterUtf8: materialized.serializedUtf8,
        resultRevisionId,
        createdAt,
      }
      state.history.startApply(changeSetId, journal)
      hitApplyFault(this.ctx.root, 'after-journal')

      let outcome
      try {
        outcome = await this.ctx.fs.writeText(
          current.target,
          new TextDecoder().decode(materialized.serializedUtf8),
          { kind: 'replaceIfVersion', version: current.version },
          signal,
          sandboxPolicy,
        )
      } catch (error: unknown) {
        if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
        changeSet = state.history.conflictApply(changeSet.id)
        await this.scan(project, state, undefined, sandboxPolicy)
        return cloneChangeSet(changeSet)
      }
      hitApplyFault(this.ctx.root, 'after-file')

      const revision = preparedRevision(
        resultRevisionId,
        project.id,
        changeSet.assetId,
        changeSet.baseRevisionId,
        materialized.serializedUtf8,
        createdAt,
        changeSet.generation,
      )
      changeSet = state.history.finalizeApply(changeSet.id, revision, journal.projectRelativePath)
      const observed = observedAsset(
        project,
        journal.projectRelativePath,
        current.target,
        outcome.version,
        materialized.parsed,
        revision,
      )
      state.catalog.set(changeSet.assetId, observed)
      return cloneChangeSet(changeSet)
    })
  }

  override async rejectChangeSet(
    project: NovelProjectSnapshot,
    changeSetId: ChangeSetId,
    authorization: ChangeSetAuthorization,
    signal?: AbortSignal,
  ): Promise<ChangeSet> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const current = this.changeSetForProject(state, project.id, changeSetId)
      authorizeChangeSet(current, authorization)
      if (current.status === 'applying') throw invalidChangeSet('an applying ChangeSet cannot be rejected')
      state.history.rejectChangeSet(changeSetId)
      return cloneChangeSet(this.changeSetForProject(state, project.id, changeSetId))
    })
  }

  private async scan(
    project: NovelProjectSnapshot,
    state: ProjectState,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
    allowSingletonConflicts = false,
  ): Promise<Map<AssetId, ObservedAsset>> {
    const currentManifest = parseProjectManifest(
      new TextDecoder().decode(await this.readBounded(
        project.manifest,
        this.config.manifestMaxBytes,
        'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
        signal,
      )),
      project.manifest.displayPath,
    )
    if (currentManifest.id !== project.id) throw new NovelRepositoryError(
      'novel repository: project identity changed during Asset scan',
      'NOVEL_PROJECT_ID_CONFLICT',
    )
    let files = await this.scanFiles(project, signal)
    if (state.history.applyJournals().length > 0) {
      const wrote = await this.recoverApplying(project, state, files, sandboxPolicy)
      if (wrote) files = await this.scanFiles(project, signal)
    }
    const catalog = new Map<AssetId, ObservedAsset>()
    const deletedAssetIds = new Set(currentManifest.deletedAssetIds)
    const seenAssetIds = new Set<AssetId>()
    for (const file of files) {
      if (seenAssetIds.has(file.parsed.id)) {
        throw new NovelRepositoryError(
          `novel repository: duplicate asset id ${JSON.stringify(file.parsed.id)}`,
          'NOVEL_ASSET_DUPLICATE_ID',
        )
      }
      seenAssetIds.add(file.parsed.id)
      if (deletedAssetIds.has(file.parsed.id)) continue
      const head = state.history.head(project.id, file.parsed.id)
      let revision: AssetRevision
      if (head === undefined) {
        revision = newRevision(project.id, file.parsed.id, undefined, file.bytes, 'initial-scan')
        state.history.commitRevision(revision, file.projectRelativePath)
      } else {
        const retained = state.history.revision(RevisionId(head.revision_id))
        if (
          retained === undefined
          || retained.revision.projectId !== project.id
          || retained.revision.assetId !== file.parsed.id
          || contentHash(retained.revision.serializedUtf8) !== retained.revision.contentHash
        ) {
          throw new NovelRepositoryError('novel repository: current history head is missing or corrupt', 'NOVEL_HISTORY_CORRUPT')
        }
        if (retained.revision.contentHash === contentHash(file.bytes)) {
          revision = retained.revision
          if (head.project_relative_path !== file.projectRelativePath) {
            state.history.updateHeadPath(project.id, file.parsed.id, revision.id, file.projectRelativePath)
          }
        } else {
          revision = newRevision(project.id, file.parsed.id, retained.revision.id, file.bytes, 'external-edit')
          state.history.commitRevision(revision, file.projectRelativePath)
        }
      }
      catalog.set(file.parsed.id, observedAsset(
        project,
        file.projectRelativePath,
        file.target,
        file.version,
        file.parsed,
        revision,
      ))
    }
    validateCatalogRelationships(catalog, this.ctx.novelAssetTypes, allowSingletonConflicts)
    state.catalog = catalog
    return catalog
  }

  private async scanFiles(project: NovelProjectSnapshot, signal?: AbortSignal): Promise<ScannedAssetFile[]> {
    const definitions = this.ctx.novelAssetTypes.list()
    if (definitions.length === 0) {
      throw new NovelRepositoryError('novel repository: no Asset type definitions are registered', 'NOVEL_ASSET_INVALID')
    }
    const extensions = new Set(definitions.flatMap(definition => definition.extensions))
    const rootNames = [...new Set(definitions.map(definition => definition.contentRoot))].sort()
    for (const definition of definitions) {
      if (definition.requiredContentRoot === true && project.contentRoots[definition.contentRoot] === undefined) {
        throw new NovelRepositoryError(
          `novel repository: project does not declare required content root ${JSON.stringify(definition.contentRoot)} for Asset type ${JSON.stringify(definition.type)}`,
          'NOVEL_PROJECT_MANIFEST_INVALID',
        )
      }
    }
    const directories = new Set<string>()
    const files = new Map<string, string>()
    const result: ScannedAssetFile[] = []
    const visit = async (directory: FsTarget, depth: number): Promise<void> => {
      signal?.throwIfAborted()
      if (depth > this.config.scanMaxDepth) {
        throw new NovelRepositoryError(
          `novel repository: authored content tree exceeds depth ${this.config.scanMaxDepth}`,
          'NOVEL_ASSET_INVALID',
        )
      }
      /* v8 ignore next -- canonical directory targets can repeat only through a provider alias/cycle. */
      if (directories.has(directory.targetKey)) return
      directories.add(directory.targetKey)
      for (const entry of await this.ctx.fs.listDir(directory, signal)) {
        if (!this.ctx.fs.contains(project.root, entry.target)) {
          throw new NovelRepositoryError(
            `novel repository: authored entry "${entry.target.displayPath}" escapes the project root`,
            'NOVEL_PROJECT_PATH_ESCAPE',
          )
        }
        if (entry.type === 'directory') {
          await visit(entry.target, depth + 1)
          continue
        }
        const lowerName = entry.name.toLocaleLowerCase()
        if (entry.type !== 'file' || ![...extensions].some(extension => lowerName.endsWith(extension))) continue
        const projectRelativePath = relativeProjectPath(project, entry.target, this.ctx.fs.processPath.bind(this.ctx.fs))
        const priorPath = files.get(entry.target.targetKey)
        /* v8 ignore next -- canonical FsTargets derive one canonical project-relative path. */
        if (priorPath !== undefined && priorPath !== projectRelativePath) {
          throw new NovelRepositoryError(
            `novel repository: one Asset file appears through both "${priorPath}" and "${projectRelativePath}"`,
            'NOVEL_ASSET_INVALID',
          )
        }
        files.set(entry.target.targetKey, projectRelativePath)
        if (result.length >= this.config.maxAssets) {
          throw new NovelRepositoryError(
            `novel repository: project contains more than ${this.config.maxAssets} authored assets`,
            'NOVEL_ASSET_INVALID',
          )
        }
        const before = await this.ctx.fs.stat(entry.target, signal)
        if (before?.type !== 'file') throw changedDuringScan(projectRelativePath)
        const bytes = await this.readBounded(entry.target, this.config.assetMaxBytes, 'NOVEL_ASSET_TOO_LARGE', signal)
        const after = await this.ctx.fs.stat(entry.target, signal)
        if (after?.type !== 'file' || before.version !== after.version) throw changedDuringScan(projectRelativePath)
        const declaredType = declaredAssetType(bytes, projectRelativePath)
        const definition = this.ctx.novelAssetTypes.get(declaredType)
        if (!definition.extensions.some(extension => lowerName.endsWith(extension))) {
          throw new NovelRepositoryError(
            `novel repository: Asset type ${JSON.stringify(declaredType)} does not accept file ${JSON.stringify(projectRelativePath)}`,
            'NOVEL_ASSET_INVALID',
          )
        }
        const parsed = definition.parse(bytes, projectRelativePath)
        if (!sameAssetType(parsed.type, definition.type)) {
          throw new NovelRepositoryError('novel repository: Asset parser returned a mismatched type', 'NOVEL_ASSET_INVALID')
        }
        result.push({
          target: entry.target,
          version: after.version,
          projectRelativePath,
          parsed,
          bytes,
        })
      }
    }
    for (const rootName of rootNames) {
      const root = project.contentRoots[rootName]
      if (root !== undefined) await visit(root, 0)
    }
    return result
  }

  private snapshotFromHistory(
    project: NovelProjectSnapshot,
    state: ProjectState,
    assetId: AssetId,
    revisionId: RevisionIdValue,
  ): AssetSnapshot {
    const retained = state.history.revision(revisionId)
    if (retained === undefined || retained.revision.projectId !== project.id || retained.revision.assetId !== assetId) {
      throw new NovelRepositoryError(
        `novel repository: Revision ${JSON.stringify(revisionId)} was not retained for asset ${JSON.stringify(assetId)}`,
        'NOVEL_REVISION_NOT_FOUND',
      )
    }
    if (contentHash(retained.revision.serializedUtf8) !== retained.revision.contentHash) {
      throw new NovelRepositoryError('novel repository: retained Revision content hash does not match its bytes', 'NOVEL_HISTORY_CORRUPT')
    }
    const declaredType = declaredAssetType(retained.revision.serializedUtf8, retained.projectRelativePath)
    const parsed = this.ctx.novelAssetTypes.get(declaredType).parse(
      retained.revision.serializedUtf8,
      retained.projectRelativePath,
    )
    if (parsed.id !== assetId) {
      throw new NovelRepositoryError('novel repository: retained Revision Frontmatter identity is corrupt', 'NOVEL_HISTORY_CORRUPT')
    }
    return snapshot(project, retained.projectRelativePath, parsed, retained.revision)
  }

  private changeSetForProject(
    state: ProjectState,
    projectId: ProjectId,
    changeSetId: ChangeSetId,
  ): ChangeSet {
    const changeSet = state.history.changeSet(changeSetId)
    if (changeSet === undefined || changeSet.projectId !== projectId) {
      throw new NovelRepositoryError(
        `novel repository: ChangeSet ${JSON.stringify(changeSetId)} was not found in this project`,
        'NOVEL_CHANGESET_NOT_FOUND',
      )
    }
    return changeSet
  }

  private async recoverApplying(
    project: NovelProjectSnapshot,
    state: ProjectState,
    files: readonly ScannedAssetFile[],
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<boolean> {
    let wrote = false
    for (const journal of state.history.applyJournals()) {
      const changeSet = this.changeSetForProject(state, project.id, journal.changeSetId)
      if (changeSet.status !== 'applying') {
        throw new NovelRepositoryError(
          'novel repository: apply journal exists without an applying ChangeSet',
          'NOVEL_HISTORY_CORRUPT',
        )
      }
      const file = files.find(candidate => candidate.parsed.id === changeSet.assetId)
      if (file === undefined || file.projectRelativePath !== journal.projectRelativePath) {
        state.history.conflictApply(changeSet.id)
        continue
      }
      const currentHash = contentHash(file.bytes)
      if (currentHash !== journal.afterHash && currentHash !== journal.beforeHash) {
        state.history.conflictApply(changeSet.id)
        continue
      }
      const declaredType = declaredAssetType(journal.afterUtf8, journal.projectRelativePath)
      const parsed = this.ctx.novelAssetTypes.get(declaredType).parse(journal.afterUtf8, journal.projectRelativePath)
      if (
        parsed.id !== changeSet.assetId
        || !sameAssetType(parsed.type, changeSet.assetType)
        || contentHash(journal.afterUtf8) !== journal.afterHash
      ) {
        throw new NovelRepositoryError('novel repository: apply journal payload is corrupt', 'NOVEL_HISTORY_CORRUPT')
      }
      if (currentHash === journal.beforeHash) {
        try {
          await this.ctx.fs.writeText(
            file.target,
            new TextDecoder().decode(journal.afterUtf8),
            { kind: 'replaceIfVersion', version: file.version },
            undefined,
            sandboxPolicy,
          )
          wrote = true
        } catch (error: unknown) {
          if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
          state.history.conflictApply(changeSet.id)
          continue
        }
      }
      const revision = preparedRevision(
        journal.resultRevisionId,
        project.id,
        changeSet.assetId,
        changeSet.baseRevisionId,
        journal.afterUtf8,
        journal.createdAt,
        changeSet.generation,
      )
      state.history.finalizeApply(changeSet.id, revision, journal.projectRelativePath)
    }
    return wrote
  }

  private async readBounded(
    target: FsTarget,
    maxBytes: number,
    code: 'NOVEL_PROJECT_MANIFEST_TOO_LARGE' | 'NOVEL_ASSET_TOO_LARGE',
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    try {
      return await this.ctx.fs.readBytes(target, signal, maxBytes)
    } catch (error: unknown) {
      if (!(error instanceof FsError) || error.code !== 'FS_TOO_LARGE') throw error
      throw new NovelRepositoryError(
        `novel repository: file "${target.displayPath}" exceeds ${maxBytes} bytes`,
        code,
        { cause: error },
      )
    }
  }

  private rememberProject(projectId: ProjectId, root: FsTarget): void {
    const rootKey = String(root.targetKey)
    const knownRoot = this.projectRoots.get(projectId)
    if (knownRoot !== undefined && knownRoot !== rootKey) {
      throw new NovelRepositoryError(
        `novel repository: project id ${JSON.stringify(projectId)} is already open from another root`,
        'NOVEL_PROJECT_ID_CONFLICT',
      )
    }
    this.projectRoots.set(projectId, rootKey)
  }

  private async stateFor(project: NovelProjectSnapshot): Promise<ProjectState> {
    this.rememberProject(project.id, project.root)
    const rootKey = String(project.root.targetKey)
    const existing = this.states.get(rootKey)
    if (existing !== undefined) {
      const state = await existing
      if (state.projectId !== project.id) {
        throw new NovelRepositoryError('novel repository: project root identity changed while open', 'NOVEL_PROJECT_ID_CONFLICT')
      }
      return state
    }
    const opening = (async (): Promise<ProjectState> => ({
      projectId: project.id,
      rootKey,
      history: await openHistory(
        join(this.ctx.fs.processPath(project.root), HISTORY_PATH),
        this.config.busyTimeoutMs,
        (assetType, value) => this.ctx.novelAssetTypes.get(assetType).decodeOperations(value),
      ),
      tail: Promise.resolve(),
      catalog: new Map(),
    }))()
    this.states.set(rootKey, opening)
    try {
      return await opening
    } catch (error: unknown) {
      this.states.delete(rootKey)
      throw error
    }
  }

  private async withProject<T>(
    project: NovelProjectSnapshot,
    operation: (state: ProjectState) => T | Promise<T>,
  ): Promise<T> {
    const state = await this.stateFor(project)
    /* v8 ignore next -- state.tail is normalized to fulfillment after every queued operation. */
    const run = state.tail.then(() => operation(state), () => operation(state))
    state.tail = run.then(() => undefined, () => undefined)
    return await run
  }

  private async close(): Promise<void> {
    const states = await Promise.allSettled(this.states.values())
    for (const settled of states) {
      /* v8 ignore next -- failed openings are removed from this.states before disposal. */
      if (settled.status !== 'fulfilled') continue
      await settled.value.tail
      settled.value.history.close()
    }
    this.states.clear()
    this.projectRoots.clear()
  }
}

function resolveConfig(config: Config): ResolvedConfig {
  const resolved: ResolvedConfig = {
    manifestMaxBytes: config.manifestMaxBytes ?? DEFAULT_MANIFEST_MAX_BYTES,
    assetMaxBytes: config.assetMaxBytes ?? DEFAULT_ASSET_MAX_BYTES,
    maxAssets: config.maxAssets ?? DEFAULT_MAX_ASSETS,
    scanMaxDepth: config.scanMaxDepth ?? DEFAULT_SCAN_MAX_DEPTH,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    selectionContextChars: config.selectionContextChars ?? DEFAULT_SELECTION_CONTEXT_CHARS,
    selectionPreviewChars: config.selectionPreviewChars ?? DEFAULT_SELECTION_PREVIEW_CHARS,
    analysisReportMaxBytes: config.analysisReportMaxBytes ?? DEFAULT_ANALYSIS_REPORT_MAX_BYTES,
  }
  for (const [name, value] of Object.entries(resolved)) {
    const upper = name === 'manifestMaxBytes' || name === 'assetMaxBytes' || name === 'analysisReportMaxBytes'
      ? MAX_BUFFER_BYTES
      : Number.MAX_SAFE_INTEGER
    if (!Number.isSafeInteger(value) || value < 1 || value > upper) {
      throw new Error(`novel-repository-local: ${name} must be an integer between 1 and ${upper}`)
    }
  }
  return resolved
}

function relativeProjectPath(
  project: NovelProjectSnapshot,
  target: FsTarget,
  processPath: (target: FsTarget) => string,
): string {
  const path = relative(processPath(project.root), processPath(target))
  /* v8 ignore next 3 -- scanned entries already passed ctx.fs.contains; retain a path-layer backstop. */
  if (path === '' || path === '..' || path.startsWith(`..${sep}`)) {
    throw new NovelRepositoryError('novel repository: asset path escapes the project root', 'NOVEL_PROJECT_PATH_ESCAPE')
  }
  return path.split(sep).join('/')
}

function newRevision(
  projectId: ProjectId,
  assetId: AssetId,
  parentRevisionId: RevisionIdValue | undefined,
  serializedUtf8: Uint8Array,
  origin: RevisionOrigin,
  generation?: NovelGenerationLineage,
): AssetRevision {
  return {
    id: RevisionId(`revision_${randomUUID()}`),
    projectId,
    assetId,
    ...(parentRevisionId === undefined ? {} : { parentRevisionId }),
    serializedUtf8: new Uint8Array(serializedUtf8),
    contentHash: contentHash(serializedUtf8),
    origin,
    createdAt: new Date().toISOString(),
    ...(generation === undefined ? {} : { generation }),
  }
}

function preparedRevision(
  id: RevisionIdValue,
  projectId: ProjectId,
  assetId: AssetId,
  parentRevisionId: RevisionIdValue,
  serializedUtf8: Uint8Array,
  createdAt: string,
  generation?: NovelGenerationLineage,
): AssetRevision {
  return {
    id,
    projectId,
    assetId,
    parentRevisionId,
    serializedUtf8: new Uint8Array(serializedUtf8),
    contentHash: contentHash(serializedUtf8),
    origin: 'agent-apply',
    createdAt,
    ...(generation === undefined ? {} : { generation }),
  }
}

function generationForActor(
  value: NovelGenerationLineage | undefined,
  actor: CreateAssetRequest['actor'] | ProposeChangeSetRequest['actor'],
  invalidCode: 'NOVEL_ASSET_INVALID' | 'NOVEL_CHANGESET_INVALID' = 'NOVEL_CHANGESET_INVALID',
): NovelGenerationLineage | undefined {
  if (value === undefined) return undefined
  if (actor.kind !== 'agent') {
    throw new NovelRepositoryError(
      'novel repository: generation lineage is only valid for an Agent action',
      invalidCode,
    )
  }
  let generation: NovelGenerationLineage
  try {
    generation = validateGenerationLineage(value)
  } catch (error) {
    throw new NovelRepositoryError('novel repository: generation lineage is invalid', invalidCode, { cause: error })
  }
  if (generation.sessionId !== actor.sessionId) {
    throw new NovelRepositoryError(
      'novel repository: generation lineage Session does not match the Agent actor',
      invalidCode,
    )
  }
  return generation
}

function restoredRevision(
  projectId: ProjectId,
  assetId: AssetId,
  parentRevisionId: RevisionIdValue,
  restoredFromRevisionId: RevisionIdValue,
  restoredBySessionId: RestoreAssetRevisionRequest['restoredBySessionId'],
  serializedUtf8: Uint8Array,
): AssetRevision {
  if (restoredBySessionId.length === 0 || restoredBySessionId.length > 200
    || restoredBySessionId !== restoredBySessionId.trim()) {
    throw new NovelRepositoryError('novel repository: restore Session is invalid', 'NOVEL_ASSET_INVALID')
  }
  return {
    id: RevisionId(`revision_${randomUUID()}`),
    projectId,
    assetId,
    parentRevisionId,
    serializedUtf8: new Uint8Array(serializedUtf8),
    contentHash: contentHash(serializedUtf8),
    origin: 'user-edit',
    createdAt: new Date().toISOString(),
    restoredFromRevisionId,
    restoredBySessionId,
  }
}

function snapshot(
  project: NovelProjectSnapshot,
  projectRelativePath: string,
  parsed: ParsedNovelAsset,
  revision: AssetRevision,
): AssetSnapshot {
  const asset: Asset = {
    id: parsed.id,
    projectId: project.id,
    type: parsed.type,
    ...(parsed.parentId === undefined ? {} : { parentId: parsed.parentId }),
    projectRelativePath,
  }
  return {
    asset,
    revisionId: revision.id,
    serializedUtf8: new Uint8Array(revision.serializedUtf8),
    contentHash: revision.contentHash,
    frontmatter: structuredClone(parsed.frontmatter),
    content: structuredClone(parsed.content),
  }
}

function observedAsset(
  project: NovelProjectSnapshot,
  projectRelativePath: string,
  target: FsTarget,
  version: FsVersion,
  parsed: ParsedNovelAsset,
  revision: AssetRevision,
): ObservedAsset {
  const current = snapshot(project, projectRelativePath, parsed, revision)
  return {
    target: { ...target },
    version,
    parsed,
    snapshot: current,
    summary: {
      asset: current.asset,
      revisionId: current.revisionId,
      contentHash: current.contentHash,
      title: parsed.title,
    },
  }
}

function orderedSummaries(
  catalog: ReadonlyMap<AssetId, ObservedAsset>,
  assetOrder: Readonly<Record<string, readonly AssetId[]>>,
): readonly AssetSummary[] {
  const indexes = new Map<string, ReadonlyMap<AssetId, number>>()
  for (const [type, ids] of Object.entries(assetOrder)) {
    indexes.set(type, new Map(ids.map((id, index) => [id, index])))
  }
  return [...catalog.values()]
    .sort((left, right) => {
      const leftAsset = left.summary.asset
      const rightAsset = right.summary.asset
      if (sameAssetType(leftAsset.type, rightAsset.type)) {
        const typeIndexes = indexes.get(leftAsset.type)
        const leftIndex = typeIndexes?.get(leftAsset.id)
        const rightIndex = typeIndexes?.get(rightAsset.id)
        if (leftIndex !== undefined || rightIndex !== undefined) {
          if (leftIndex === undefined) return 1
          if (rightIndex === undefined) return -1
          if (leftIndex !== rightIndex) return leftIndex - rightIndex
        }
      }
      return leftAsset.projectRelativePath.localeCompare(rightAsset.projectRelativePath)
    })
    .map(value => cloneSummary(value.summary))
}

function cloneSnapshot(value: AssetSnapshot): AssetSnapshot {
  return {
    ...value,
    asset: { ...value.asset },
    serializedUtf8: new Uint8Array(value.serializedUtf8),
    frontmatter: structuredClone(value.frontmatter),
    content: structuredClone(value.content),
  }
}

function cloneSummary(value: AssetSummary): AssetSummary {
  return { ...value, asset: { ...value.asset } }
}

function cloneChangeSet(value: ChangeSet): ChangeSet {
  return {
    ...value,
    actor: { ...value.actor },
    operations: structuredClone(value.operations),
    ...(value.generation === undefined ? {} : {
      generation: {
        ...value.generation,
        ...(value.generation.contextPolicies === undefined
          ? {}
          : { contextPolicies: [...value.generation.contextPolicies] }),
      },
    }),
  }
}

/** Keep runtime-contributed type equality explicit even while one built-in type inhabits the compile-time map. */
function sameAssetType(left: unknown, right: unknown): boolean {
  return typeof left === 'string' && typeof right === 'string' && left === right
}

function authorizeChangeSet(value: ChangeSet, authorization: ChangeSetAuthorization): void {
  const owningSession = value.actor.sessionId
  if (owningSession !== undefined && owningSession !== authorization.sessionId) {
    throw new NovelRepositoryError(
      'novel repository: ChangeSet belongs to another Session',
      'NOVEL_CHANGESET_UNAUTHORIZED',
    )
  }
}

function invalidChangeSet(detail: string): NovelRepositoryError {
  return new NovelRepositoryError(`novel repository: invalid ChangeSet: ${detail}`, 'NOVEL_CHANGESET_INVALID')
}

function validateCatalogRelationships(
  catalog: ReadonlyMap<AssetId, ObservedAsset>,
  registry: Context['novelAssetTypes'],
  allowSingletonConflicts = false,
): void {
  for (const observed of catalog.values()) {
    const definition = registry.get(observed.parsed.type)
    if (!allowSingletonConflicts) validateProjectSingleton(observed.parsed, definition, catalog)
    validateParentRelationship(observed.parsed, definition, catalog, allowSingletonConflicts)
  }
}

function validateProjectSingleton(
  parsed: ParsedNovelAsset,
  definition: ReturnType<Context['novelAssetTypes']['get']>,
  catalog: ReadonlyMap<AssetId, ObservedAsset>,
): void {
  if (definition.projectSingleton !== true
    && !(definition.rootSingleton === true && parsed.parentId === undefined)) return
  for (const candidate of catalog.values()) {
    if (candidate.parsed.id !== parsed.id && sameAssetType(candidate.parsed.type, parsed.type)
      && (definition.projectSingleton === true || candidate.parsed.parentId === undefined)) {
      throw new NovelRepositoryError(
        `novel repository: project has multiple ${JSON.stringify(parsed.type)} Assets`,
        'NOVEL_ASSET_INVALID',
      )
    }
  }
}

function validateParentRelationship(
  parsed: ParsedNovelAsset,
  definition: ReturnType<Context['novelAssetTypes']['get']>,
  catalog: ReadonlyMap<AssetId, ObservedAsset>,
  allowSingletonConflicts = false,
): void {
  const relation = definition.parent
  if (parsed.parentId === undefined) {
    if (relation?.required === true) {
      throw new NovelRepositoryError(
        `novel repository: Asset ${JSON.stringify(parsed.id)} requires a semantic parent`,
        'NOVEL_ASSET_INVALID',
      )
    }
    return
  }
  if (relation === undefined) {
    throw new NovelRepositoryError(
      `novel repository: Asset type ${JSON.stringify(parsed.type)} does not permit a semantic parent`,
      'NOVEL_ASSET_INVALID',
    )
  }
  const parent = catalog.get(parsed.parentId)
  if (parent === undefined) {
    throw new NovelRepositoryError(
      `novel repository: parent Asset ${JSON.stringify(parsed.parentId)} was not found for ${JSON.stringify(parsed.id)}`,
      'NOVEL_ASSET_INVALID',
    )
  }
  if (!relation.allowedTypes.some(type => sameAssetType(type, parent.parsed.type))) {
    throw new NovelRepositoryError(
      `novel repository: parent Asset ${JSON.stringify(parsed.parentId)} has incompatible type ${JSON.stringify(parent.parsed.type)}`,
      'NOVEL_ASSET_INVALID',
    )
  }
  if (relation.singleton === true && !allowSingletonConflicts) {
    for (const sibling of catalog.values()) {
      if (sibling.parsed.id !== parsed.id && sibling.parsed.parentId === parsed.parentId
        && sameAssetType(sibling.parsed.type, parsed.type)) {
        throw new NovelRepositoryError(
          `novel repository: parent Asset ${JSON.stringify(parsed.parentId)} has multiple ${JSON.stringify(parsed.type)} children`,
          'NOVEL_ASSET_INVALID',
        )
      }
    }
  }
  if (relation.maxDepth !== undefined) {
    let cursor: ParsedNovelAsset | undefined = parsed
    const visited = new Set<AssetId>([parsed.id])
    let depth = 0
    while (cursor.parentId !== undefined) {
      if (visited.has(cursor.parentId)) {
        throw new NovelRepositoryError('novel repository: Asset parent relationship contains a cycle', 'NOVEL_ASSET_INVALID')
      }
      visited.add(cursor.parentId)
      depth += 1
      if (depth > relation.maxDepth) {
        throw new NovelRepositoryError(
          `novel repository: Asset ${JSON.stringify(parsed.id)} exceeds parent depth ${relation.maxDepth}`,
          'NOVEL_ASSET_INVALID',
        )
      }
      cursor = catalog.get(cursor.parentId)?.parsed
      if (cursor === undefined) break
    }
  }
}

function assetNotFound(assetId: AssetId): NovelRepositoryError {
  return new NovelRepositoryError(
    `novel repository: asset ${JSON.stringify(assetId)} is not in the current project catalog`,
    'NOVEL_ASSET_NOT_FOUND',
  )
}

function searchExcerpt(text: string, matchIndex: number, queryLength: number): string {
  const normalized = text.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= SEARCH_EXCERPT_CHARS) return normalized
  const safeIndex = Math.max(0, Math.min(matchIndex, normalized.length))
  const lead = Math.floor((SEARCH_EXCERPT_CHARS - Math.min(queryLength, SEARCH_EXCERPT_CHARS)) / 2)
  const start = Math.max(0, Math.min(safeIndex - lead, normalized.length - SEARCH_EXCERPT_CHARS))
  const excerpt = normalized.slice(start, start + SEARCH_EXCERPT_CHARS)
  return `${start > 0 ? '…' : ''}${excerpt}${start + SEARCH_EXCERPT_CHARS < normalized.length ? '…' : ''}`
}

function validatePreferenceCandidateInput(
  request: PutNovelPreferenceCandidateRequest,
  maxBytes: number,
): void {
  if (request.sourceRevisionId === request.finalRevisionId) {
    throw new NovelRepositoryError('novel repository: preference source and final Revision must differ', 'NOVEL_PREFERENCE_CANDIDATE_INVALID')
  }
  if (request.extractorVersion.length === 0 || request.extractorVersion.length > 100
    || request.extractorVersion !== request.extractorVersion.trim()
    || !Number.isFinite(Date.parse(request.generatedAt))) {
    throw new NovelRepositoryError('novel repository: preference extractor provenance is invalid', 'NOVEL_PREFERENCE_CANDIDATE_INVALID')
  }
  if (request.summary.trim().length === 0 || request.summary.length > 1_000
    || request.guidanceMarkdown.trim().length === 0 || request.guidanceMarkdown.length > 8_000
    || request.evidence.length === 0 || request.evidence.length > 12) {
    throw new NovelRepositoryError('novel repository: preference candidate is outside bounds', 'NOVEL_PREFERENCE_CANDIDATE_INVALID')
  }
  for (const item of request.evidence) {
    if (item.before.length > 1_000 || item.after.length > 1_000
      || item.inference.trim().length === 0 || item.inference.length > 1_000) {
      throw new NovelRepositoryError('novel repository: preference evidence is outside bounds', 'NOVEL_PREFERENCE_CANDIDATE_INVALID')
    }
  }
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > maxBytes) {
    throw new NovelRepositoryError('novel repository: preference candidate is too large', 'NOVEL_ASSET_TOO_LARGE')
  }
}

function validateStoryStateCandidateInput(
  request: PutNovelStoryStateCandidateRequest,
  maxBytes: number,
): void {
  if (request.extractorVersion.length === 0 || request.extractorVersion.length > 100
    || request.extractorVersion !== request.extractorVersion.trim()
    || !Number.isFinite(Date.parse(request.generatedAt))) {
    throw new NovelRepositoryError('novel repository: Story State extractor provenance is invalid', 'NOVEL_STORY_STATE_CANDIDATE_INVALID')
  }
  if (request.summary.trim().length === 0 || request.summary.length > 1_000
    || request.replacementMarkdown.trim().length === 0
    || request.evidence.length === 0 || request.evidence.length > 12) {
    throw new NovelRepositoryError('novel repository: Story State candidate is outside bounds', 'NOVEL_STORY_STATE_CANDIDATE_INVALID')
  }
  for (const item of request.evidence) {
    if (item.quote.trim().length === 0 || item.quote.length > 1_000
      || item.update.trim().length === 0 || item.update.length > 1_000) {
      throw new NovelRepositoryError('novel repository: Story State evidence is outside bounds', 'NOVEL_STORY_STATE_CANDIDATE_INVALID')
    }
  }
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > maxBytes) {
    throw new NovelRepositoryError('novel repository: Story State candidate is too large', 'NOVEL_ASSET_TOO_LARGE')
  }
}

function staleRevision(revisionId: RevisionIdValue, cause?: unknown): NovelRepositoryError {
  return new NovelRepositoryError(
    `novel repository: Revision ${JSON.stringify(revisionId)} is not the current asset head`,
    'NOVEL_REVISION_STALE',
    cause === undefined ? undefined : { cause },
  )
}

function changedDuringScan(path: string): NovelRepositoryError {
  return new NovelRepositoryError(
    `novel repository: Asset "${path}" changed while it was being scanned`,
    'NOVEL_ASSET_CHANGED_DURING_SCAN',
  )
}

export default LocalNovelRepository
