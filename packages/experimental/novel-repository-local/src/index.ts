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
import NovelRepository, {
  NovelRepositoryError,
  RevisionId,
  SelectionRefId,
  type Asset,
  type AssetId,
  type AssetRevision,
  type AssetSnapshot,
  type AssetSummary,
  type CaptureSelectionRequest,
  type NovelProjectSnapshot,
  type ProjectId,
  type RevisionId as RevisionIdValue,
  type RevisionOrigin,
  type SaveChapterBodyRequest,
  type SelectionRef,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import {
  containsUnpairedSurrogate,
  contentHash,
  parseChapter,
  splitsSurrogatePair,
  type ParsedChapter,
} from './content.ts'
import { NovelHistory, openHistory } from './history.ts'
import { parseProjectManifest } from './manifest.ts'

const PROJECT_MANIFEST = 'novel.yaml'
const HISTORY_PATH = '.novel/history.sqlite'
const DEFAULT_MANIFEST_MAX_BYTES = 64 * 1024
const DEFAULT_ASSET_MAX_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_ASSETS = 10_000
const DEFAULT_SCAN_MAX_DEPTH = 64
const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_SELECTION_CONTEXT_CHARS = 32
const DEFAULT_SELECTION_PREVIEW_CHARS = 160
const MAX_BUFFER_BYTES = Math.min(bufferConstants.MAX_LENGTH, bufferConstants.MAX_STRING_LENGTH)

/** Local provider bounds and SQLite lock policy. */
export interface Config {
  /** Inclusive byte limit for the complete `novel.yaml`; defaults to 64 KiB. */
  manifestMaxBytes?: number
  /** Inclusive byte limit for one complete chapter file; defaults to 4 MiB. */
  assetMaxBytes?: number
  /** Maximum chapter assets accepted from one scan; defaults to 10,000. */
  maxAssets?: number
  /** Maximum directory nesting below the manuscript root; defaults to 64. */
  scanMaxDepth?: number
  /** Maximum SQLite lock wait; defaults to five seconds. */
  busyTimeoutMs?: number
  /** Prefix and suffix UTF-16 units retained on a SelectionRef; defaults to 32. */
  selectionContextChars?: number
  /** Maximum UTF-16 units retained in selection preview; defaults to 160. */
  selectionPreviewChars?: number
}

interface ResolvedConfig {
  manifestMaxBytes: number
  assetMaxBytes: number
  maxAssets: number
  scanMaxDepth: number
  busyTimeoutMs: number
  selectionContextChars: number
  selectionPreviewChars: number
}

interface ObservedAsset {
  readonly target: FsTarget
  readonly version: FsVersion
  readonly parsed: ParsedChapter
  readonly snapshot: AssetSnapshot
  readonly summary: AssetSummary
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
  static inject = ['fs']
  static Config: z<Config> = z.object({
    manifestMaxBytes: z.number().default(DEFAULT_MANIFEST_MAX_BYTES),
    assetMaxBytes: z.number().default(DEFAULT_ASSET_MAX_BYTES),
    maxAssets: z.number().default(DEFAULT_MAX_ASSETS),
    scanMaxDepth: z.number().default(DEFAULT_SCAN_MAX_DEPTH),
    busyTimeoutMs: z.number().default(DEFAULT_BUSY_TIMEOUT_MS),
    selectionContextChars: z.number().default(DEFAULT_SELECTION_CONTEXT_CHARS),
    selectionPreviewChars: z.number().default(DEFAULT_SELECTION_PREVIEW_CHARS),
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
    }
  }

  override async listAssets(project: NovelProjectSnapshot, signal?: AbortSignal): Promise<readonly AssetSummary[]> {
    return await this.withProject(project, async (state) => {
      const catalog = await this.scan(project, state, signal)
      return [...catalog.values()]
        .sort((left, right) => left.summary.asset.projectRelativePath.localeCompare(right.summary.asset.projectRelativePath))
        .map(value => cloneSummary(value.summary))
    })
  }

  override async readAsset(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId?: RevisionIdValue,
    signal?: AbortSignal,
  ): Promise<AssetSnapshot> {
    return await this.withProject(project, async (state) => {
      signal?.throwIfAborted()
      if (revisionId === undefined) {
        const asset = (await this.scan(project, state, signal)).get(assetId)
        if (asset === undefined) throw assetNotFound(assetId)
        return cloneSnapshot(asset.snapshot)
      }
      return this.snapshotFromHistory(project, state, assetId, revisionId)
    })
  }

  override async saveChapterBody(
    project: NovelProjectSnapshot,
    request: SaveChapterBodyRequest,
    signal?: AbortSignal,
  ): Promise<AssetSnapshot> {
    return await this.withProject(project, async (state) => {
      if (containsUnpairedSurrogate(request.body)) {
        throw new NovelRepositoryError('novel repository: chapter body contains an unpaired UTF-16 surrogate', 'NOVEL_ASSET_INVALID')
      }
      const current = (await this.scan(project, state, signal)).get(request.assetId)
      if (current === undefined) throw assetNotFound(request.assetId)
      if (current.snapshot.revisionId !== request.baseRevisionId) throw staleRevision(request.baseRevisionId)
      const beforeText = new TextDecoder().decode(current.snapshot.serializedUtf8)
      const serializedText = `${beforeText.slice(0, current.parsed.bodyStartUtf16)}${request.body}`
      const bytes = new TextEncoder().encode(serializedText)
      if (bytes.byteLength > this.config.assetMaxBytes) {
        throw new NovelRepositoryError(
          `novel repository: chapter asset exceeds ${this.config.assetMaxBytes} bytes`,
          'NOVEL_ASSET_TOO_LARGE',
        )
      }
      const parsed = parseChapter(bytes, current.summary.asset.projectRelativePath)
      /* v8 ignore next 3 -- a body-only rewrite cannot alter the retained Frontmatter prefix. */
      if (parsed.id !== request.assetId) {
        throw new NovelRepositoryError('novel repository: body save changed the asset identity', 'NOVEL_ASSET_INVALID')
      }
      let outcome
      try {
        outcome = await this.ctx.fs.writeText(
          current.target,
          serializedText,
          { kind: 'replaceIfVersion', version: current.version },
          signal,
        )
      } catch (error: unknown) {
        if (!(error instanceof FsError) || error.code !== 'FS_STALE_VERSION') throw error
        await this.scan(project, state, signal)
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
        parsed,
        revision,
      )
      state.catalog.set(request.assetId, observed)
      return cloneSnapshot(observed.snapshot)
    })
  }

  override async captureSelection(
    project: NovelProjectSnapshot,
    request: CaptureSelectionRequest,
    signal?: AbortSignal,
  ): Promise<SelectionRef> {
    return await this.withProject(project, (state) => {
      signal?.throwIfAborted()
      const snapshot = this.snapshotFromHistory(project, state, request.assetId, request.revisionId)
      const { body } = snapshot
      const { startUtf16, endUtf16 } = request
      if (
        !Number.isSafeInteger(startUtf16)
        || !Number.isSafeInteger(endUtf16)
        || startUtf16 < 0
        || endUtf16 <= startUtf16
        || endUtf16 > body.length
        || splitsSurrogatePair(body, startUtf16)
        || splitsSurrogatePair(body, endUtf16)
      ) {
        throw new NovelRepositoryError(
          'novel repository: selection must be a non-empty UTF-16 range on code-point boundaries',
          'NOVEL_SELECTION_INVALID',
        )
      }
      const quote = body.slice(startUtf16, endUtf16)
      return {
        version: 1,
        id: SelectionRefId(`selection_${randomUUID()}`),
        projectId: project.id,
        assetId: request.assetId,
        revisionId: request.revisionId,
        selector: {
          kind: 'text-range',
          startUtf16,
          endUtf16,
          quoteHash: contentHash(new TextEncoder().encode(quote)),
          ...boundedBefore(body, startUtf16, this.config.selectionContextChars),
          ...boundedAfter(body, endUtf16, this.config.selectionContextChars),
        },
        preview: boundedSlice(quote, this.config.selectionPreviewChars),
      }
    })
  }

  private async scan(
    project: NovelProjectSnapshot,
    state: ProjectState,
    signal?: AbortSignal,
  ): Promise<Map<AssetId, ObservedAsset>> {
    const files = await this.scanFiles(project, signal)
    const catalog = new Map<AssetId, ObservedAsset>()
    for (const file of files) {
      if (catalog.has(file.parsed.id)) {
        throw new NovelRepositoryError(
          `novel repository: duplicate asset id ${JSON.stringify(file.parsed.id)}`,
          'NOVEL_ASSET_DUPLICATE_ID',
        )
      }
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
    state.catalog = catalog
    return catalog
  }

  private async scanFiles(project: NovelProjectSnapshot, signal?: AbortSignal): Promise<Array<{
    target: FsTarget
    version: FsVersion
    projectRelativePath: string
    parsed: ParsedChapter
    bytes: Uint8Array
  }>> {
    const manuscript = project.contentRoots['manuscript']
    if (manuscript === undefined) {
      throw new NovelRepositoryError('novel repository: project has no manuscript content root', 'NOVEL_PROJECT_MANIFEST_INVALID')
    }
    const directories = new Set<string>()
    const files = new Map<string, string>()
    const result: Array<{
      target: FsTarget
      version: FsVersion
      projectRelativePath: string
      parsed: ParsedChapter
      bytes: Uint8Array
    }> = []
    const visit = async (directory: FsTarget, depth: number): Promise<void> => {
      signal?.throwIfAborted()
      if (depth > this.config.scanMaxDepth) {
        throw new NovelRepositoryError(
          `novel repository: manuscript tree exceeds depth ${this.config.scanMaxDepth}`,
          'NOVEL_ASSET_INVALID',
        )
      }
      /* v8 ignore next -- canonical directory targets can repeat only through a provider alias/cycle. */
      if (directories.has(directory.targetKey)) return
      directories.add(directory.targetKey)
      for (const entry of await this.ctx.fs.listDir(directory, signal)) {
        if (!this.ctx.fs.contains(project.root, entry.target)) {
          throw new NovelRepositoryError(
            `novel repository: manuscript entry "${entry.target.displayPath}" escapes the project root`,
            'NOVEL_PROJECT_PATH_ESCAPE',
          )
        }
        if (entry.type === 'directory') {
          await visit(entry.target, depth + 1)
          continue
        }
        if (entry.type !== 'file' || !entry.name.toLocaleLowerCase().endsWith('.md')) continue
        const projectRelativePath = relativeProjectPath(project, entry.target, this.ctx.fs.processPath.bind(this.ctx.fs))
        const priorPath = files.get(entry.target.targetKey)
        /* v8 ignore next -- canonical FsTargets derive one canonical project-relative path. */
        if (priorPath !== undefined && priorPath !== projectRelativePath) {
          throw new NovelRepositoryError(
            `novel repository: one chapter file appears through both "${priorPath}" and "${projectRelativePath}"`,
            'NOVEL_ASSET_INVALID',
          )
        }
        files.set(entry.target.targetKey, projectRelativePath)
        if (result.length >= this.config.maxAssets) {
          throw new NovelRepositoryError(
            `novel repository: project contains more than ${this.config.maxAssets} chapter assets`,
            'NOVEL_ASSET_INVALID',
          )
        }
        const before = await this.ctx.fs.stat(entry.target, signal)
        if (before?.type !== 'file') throw changedDuringScan(projectRelativePath)
        const bytes = await this.readBounded(entry.target, this.config.assetMaxBytes, 'NOVEL_ASSET_TOO_LARGE', signal)
        const after = await this.ctx.fs.stat(entry.target, signal)
        if (after?.type !== 'file' || before.version !== after.version) throw changedDuringScan(projectRelativePath)
        result.push({
          target: entry.target,
          version: after.version,
          projectRelativePath,
          parsed: parseChapter(bytes, projectRelativePath),
          bytes,
        })
      }
    }
    await visit(manuscript, 0)
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
    const parsed = parseChapter(retained.revision.serializedUtf8, retained.projectRelativePath)
    if (parsed.id !== assetId) {
      throw new NovelRepositoryError('novel repository: retained Revision Frontmatter identity is corrupt', 'NOVEL_HISTORY_CORRUPT')
    }
    return snapshot(project, retained.projectRelativePath, parsed, retained.revision)
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
  }
  for (const [name, value] of Object.entries(resolved)) {
    const upper = name === 'manifestMaxBytes' || name === 'assetMaxBytes'
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
  }
}

function snapshot(
  project: NovelProjectSnapshot,
  projectRelativePath: string,
  parsed: ParsedChapter,
  revision: AssetRevision,
): AssetSnapshot {
  const asset: Asset = {
    id: parsed.id,
    projectId: project.id,
    type: 'manuscript.chapter',
    projectRelativePath,
  }
  return {
    asset,
    revisionId: revision.id,
    serializedUtf8: new Uint8Array(revision.serializedUtf8),
    contentHash: revision.contentHash,
    frontmatter: structuredClone(parsed.frontmatter),
    body: parsed.body,
  }
}

function observedAsset(
  project: NovelProjectSnapshot,
  projectRelativePath: string,
  target: FsTarget,
  version: FsVersion,
  parsed: ParsedChapter,
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

function cloneSnapshot(value: AssetSnapshot): AssetSnapshot {
  return {
    ...value,
    asset: { ...value.asset },
    serializedUtf8: new Uint8Array(value.serializedUtf8),
    frontmatter: structuredClone(value.frontmatter),
  }
}

function cloneSummary(value: AssetSummary): AssetSummary {
  return { ...value, asset: { ...value.asset } }
}

function assetNotFound(assetId: AssetId): NovelRepositoryError {
  return new NovelRepositoryError(
    `novel repository: asset ${JSON.stringify(assetId)} is not in the current project catalog`,
    'NOVEL_ASSET_NOT_FOUND',
  )
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
    `novel repository: chapter asset "${path}" changed while it was being scanned`,
    'NOVEL_ASSET_CHANGED_DURING_SCAN',
  )
}

function boundedSlice(text: string, maxUtf16: number): string {
  if (text.length <= maxUtf16) return text
  let end = maxUtf16
  if (splitsSurrogatePair(text, end)) end -= 1
  return `${text.slice(0, end)}…`
}

function boundedBefore(text: string, offset: number, maxUtf16: number): { prefix?: string } {
  let start = Math.max(0, offset - maxUtf16)
  if (splitsSurrogatePair(text, start)) start += 1
  const prefix = text.slice(start, offset)
  return prefix === '' ? {} : { prefix }
}

function boundedAfter(text: string, offset: number, maxUtf16: number): { suffix?: string } {
  let end = Math.min(text.length, offset + maxUtf16)
  if (splitsSurrogatePair(text, end)) end -= 1
  const suffix = text.slice(offset, end)
  return suffix === '' ? {} : { suffix }
}

export default LocalNovelRepository
