/**
 * Host Remote Consumer for browser-safe Novel Project Asset access.
 * @module @deepseek-ai/dsh-experimental-novel-repository-remote
 */

import { constants as bufferConstants } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import {
  ChangeSetId,
  NovelRepositoryError,
  type AssetId,
  type AssetSnapshot,
  type ChangeSet,
  type NovelAssetType,
  type NovelAssetContent,
  type NovelSelectionInput,
  type NovelProjectSnapshot,
  type RevisionId,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { formatNovelReferenceMention } from '@deepseek-ai/dsh-experimental-novel-context'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  CaptureNovelSelectionRequest,
  CreateNovelAssetRequest,
  NovelAssetDescriptor,
  NovelChangeSetDescriptor,
  NovelAssetDocument,
  NovelProjectDescriptor,
  NovelSelectionDescriptor,
  NovelWireValue,
  SaveNovelAssetRequest,
} from './types.ts'

export type {
  CaptureNovelSelectionRequest,
  CreateNovelAssetRequest,
  NovelAssetDescriptor,
  NovelChangeSetDescriptor,
  NovelAssetDocument,
  NovelProjectDescriptor,
  NovelSelectionDescriptor,
  NovelWireValue,
  SaveNovelAssetRequest,
} from './types.ts'

const DEFAULT_DESCRIPTOR_MAX_BYTES = 256 * 1024
const DEFAULT_RESPONSE_MAX_BYTES = 8 * 1024 * 1024
const MAX_DESCRIPTOR_MAX_BYTES = bufferConstants.MAX_STRING_LENGTH

/** Host projection limits. */
export interface Config {
  /** Inclusive UTF-8 byte limit for one complete project descriptor. */
  descriptorMaxBytes?: number
  /** Inclusive UTF-8 byte limit for one complete asset RPC response. */
  responseMaxBytes?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelRepositoryRemote: NovelRepositoryRemote
  }
}

/** Project browser projection consuming the provider-neutral repository service. */
export class NovelRepositoryRemote extends TypertRemoteService {
  static inject = ['novelRepository', 'fs', 'sandboxPolicy']
  static Config: z<Config> = z.object({
    descriptorMaxBytes: z.number().default(DEFAULT_DESCRIPTOR_MAX_BYTES),
    responseMaxBytes: z.number().default(DEFAULT_RESPONSE_MAX_BYTES),
  })

  private readonly descriptorMaxBytes: number
  private readonly responseMaxBytes: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'novelRepositoryRemote', { namespace: 'novelRepository' })
    const descriptorMaxBytes = config.descriptorMaxBytes ?? DEFAULT_DESCRIPTOR_MAX_BYTES
    const responseMaxBytes = config.responseMaxBytes ?? DEFAULT_RESPONSE_MAX_BYTES
    validateByteBound('descriptorMaxBytes', descriptorMaxBytes)
    validateByteBound('responseMaxBytes', responseMaxBytes)
    this.descriptorMaxBytes = descriptorMaxBytes
    this.responseMaxBytes = responseMaxBytes
  }

  /**
   * Discover a project at the addressed Agent's Session working directory.
   * @param agent - addressed Agent whose working directory bounds discovery.
   * @param signal - caller cancellation.
   * @returns browser-safe project values, or `undefined` when `novel.yaml` is absent.
   * @throws {NovelRepositoryError} when the Session has no working directory or discovery fails.
   */
  @Remote('discover')
  async discover(agent: Agent, signal: AbortSignal): Promise<NovelProjectDescriptor | undefined> {
    const project = await this.projectFor(agent, signal)
    if (project === undefined) return undefined
    const descriptor = projectDescriptor(project)
    assertResponseBytes(descriptor, this.descriptorMaxBytes, 'project descriptor')
    return descriptor
  }

  /**
   * List the reconciled Asset catalog for the addressed Session project.
   * @param agent - addressed Agent whose Session selects the project root.
   * @param signal - caller cancellation.
   * @returns browser-safe current Asset descriptors.
   */
  @Remote('assets')
  async assets(agent: Agent, signal: AbortSignal): Promise<NovelAssetDescriptor[]> {
    const project = await this.requireProject(agent, signal)
    const assets = (await this.ctx.novelRepository.listAssets(
      project,
      signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )).map(summary => ({
      id: summary.asset.id,
      projectId: summary.asset.projectId,
      type: summary.asset.type,
      ...(summary.asset.parentId === undefined ? {} : { parentId: summary.asset.parentId }),
      projectRelativePath: summary.asset.projectRelativePath,
      revisionId: summary.revisionId,
      contentHash: summary.contentHash,
      title: summary.title,
    }))
    assertResponseBytes(assets, this.responseMaxBytes, 'asset catalog')
    return assets
  }

  /**
   * Create one new typed Asset below its registered project content root.
   * @param agent - addressed Agent whose Session selects the project root and write policy.
   * @param request - semantic type, title, optional parent, and typed content.
   * @param signal - caller cancellation before publication.
   * @returns the browser-safe initial Revision.
   */
  @Remote('createAsset')
  async createAsset(
    agent: Agent,
    request: CreateNovelAssetRequest,
    signal: AbortSignal,
  ): Promise<NovelAssetDocument> {
    const project = await this.requireProject(agent, signal)
    const snapshot = await this.ctx.novelRepository.createAsset(
      project,
      {
        type: request.type as NovelAssetType,
        title: request.title,
        ...(request.parentId === undefined ? {} : { parentId: request.parentId }),
        content: request.content as unknown as NovelAssetContent,
        actor: { kind: 'user', sessionId: agent.id },
      },
      signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    const result = assetDocument(snapshot)
    assertResponseBytes(result, this.responseMaxBytes, 'Asset document')
    return result
  }

  /**
   * Read one current or retained typed Asset document.
   * @param agent - addressed Agent whose Session selects the project root.
   * @param assetId - stable Asset identity.
   * @param revisionId - exact retained Revision, or `null` for current.
   * @param signal - caller cancellation.
   * @returns a browser-safe Revision-bound typed Asset document.
   */
  @Remote('asset')
  async asset(
    agent: Agent,
    assetId: AssetId,
    revisionId: RevisionId | null,
    signal: AbortSignal,
  ): Promise<NovelAssetDocument> {
    const project = await this.requireProject(agent, signal)
    const snapshot = await this.ctx.novelRepository.readAsset(
      project,
      assetId,
      revisionId ?? undefined,
      signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    const result = assetDocument(snapshot)
    assertResponseBytes(result, this.responseMaxBytes, 'Asset document')
    return result
  }

  /**
   * Guardedly save one complete authored typed content value.
   * @param agent - addressed Agent whose Session selects the project root.
   * @param request - stable target, base Revision, and complete typed content.
   * @param signal - caller cancellation.
   * @returns the new browser-safe Revision-bound Asset document.
   */
  @Remote('saveAsset')
  async saveAsset(
    agent: Agent,
    request: SaveNovelAssetRequest,
    signal: AbortSignal,
  ): Promise<NovelAssetDocument> {
    const project = await this.requireProject(agent, signal)
    const snapshot = await this.ctx.novelRepository.saveAssetContent(
      project,
      {
        assetId: request.assetId,
        baseRevisionId: request.baseRevisionId,
        ...(request.title === undefined ? {} : { title: request.title }),
        // The Remote codec proves lossless JSON; the exact type definition performs
        // the semantic validation before any authored bytes are materialized.
        content: request.content as unknown as NovelAssetContent,
      },
      signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    const result = assetDocument(snapshot)
    assertResponseBytes(result, this.responseMaxBytes, 'Asset document')
    return result
  }

  /**
   * Freeze one exact type-defined selection over a retained Revision.
   * @param agent - addressed Agent whose Session selects the project root.
   * @param request - exact Revision and type-defined selection input.
   * @param signal - caller cancellation.
   * @returns a durable browser-safe SelectionRef.
   */
  @Remote('captureSelection')
  async captureSelection(
    agent: Agent,
    request: CaptureNovelSelectionRequest,
    signal: AbortSignal,
  ): Promise<NovelSelectionDescriptor> {
    const project = await this.requireProject(agent, signal)
    const selection = await this.ctx.novelRepository.captureSelection(project, {
      assetId: request.assetId,
      revisionId: request.revisionId,
      // As above, selection semantics belong to the registered exact Asset type.
      selector: request.selector as unknown as NovelSelectionInput,
    }, signal)
    const result: NovelSelectionDescriptor = {
      version: selection.version,
      id: selection.id,
      projectId: selection.projectId,
      assetId: selection.assetId,
      revisionId: selection.revisionId,
      selector: wireValue(selection.selector, 'Selection selector'),
      ...(selection.preview === undefined ? {} : { preview: selection.preview }),
      mention: formatNovelReferenceMention({
        projectId: selection.projectId,
        assetId: selection.assetId,
        revisionId: selection.revisionId,
        selector: selection.selector,
        label: selection.preview === undefined ? selection.assetId : selection.preview,
      }),
    }
    assertResponseBytes(result, this.responseMaxBytes, 'selection reference')
    return result
  }

  /**
   * Read one durable ChangeSet for browser review.
   * @param agent - addressed Agent whose Session selects the project root.
   * @param changeSetId - durable ChangeSet identity to review.
   * @param signal - caller cancellation.
   * @returns a browser-safe ChangeSet descriptor.
   */
  @Remote('changeSet')
  async changeSet(agent: Agent, changeSetId: ChangeSetId, signal: AbortSignal): Promise<NovelChangeSetDescriptor> {
    const project = await this.requireProject(agent, signal)
    const result = changeSetDescriptor(await this.ctx.novelRepository.readChangeSet(project, changeSetId, signal))
    assertResponseBytes(result, this.responseMaxBytes, 'ChangeSet')
    return result
  }

  /**
   * Explicitly accept one Session-owned ChangeSet.
   * @param agent - addressed Agent authorizing publication through its Session identity.
   * @param changeSetId - durable proposal identity to apply.
   * @param signal - caller cancellation before publication begins.
   * @returns the browser-safe terminal or applying result.
   */
  @Remote('applyChangeSet')
  async applyChangeSet(agent: Agent, changeSetId: ChangeSetId, signal: AbortSignal): Promise<NovelChangeSetDescriptor> {
    const project = await this.requireProject(agent, signal)
    const result = changeSetDescriptor(await this.ctx.novelRepository.applyChangeSet(
      project,
      changeSetId,
      { sessionId: agent.id },
      signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    ))
    assertResponseBytes(result, this.responseMaxBytes, 'ChangeSet')
    return result
  }

  /**
   * Explicitly reject one Session-owned ChangeSet.
   * @param agent - addressed Agent authorizing rejection through its Session identity.
   * @param changeSetId - durable proposal identity to reject.
   * @param signal - caller cancellation before durable rejection.
   * @returns the browser-safe rejected or already terminal result.
   */
  @Remote('rejectChangeSet')
  async rejectChangeSet(agent: Agent, changeSetId: ChangeSetId, signal: AbortSignal): Promise<NovelChangeSetDescriptor> {
    const project = await this.requireProject(agent, signal)
    const result = changeSetDescriptor(await this.ctx.novelRepository.rejectChangeSet(
      project,
      changeSetId,
      { sessionId: agent.id },
      signal,
    ))
    assertResponseBytes(result, this.responseMaxBytes, 'ChangeSet')
    return result
  }

  private async projectFor(agent: Agent, signal: AbortSignal): Promise<NovelProjectSnapshot | undefined> {
    const cwd = agent.session.header.cwd
    if (cwd === undefined) {
      throw new NovelRepositoryError(
        `novel repository remote: agent session "${agent.id}" has no working directory`,
        'NOVEL_PROJECT_ROOT_INVALID',
      )
    }
    const root = await this.ctx.fs.resolve(cwd, { signal })
    return await this.ctx.novelRepository.discoverProject(root, signal)
  }

  private async requireProject(agent: Agent, signal: AbortSignal): Promise<NovelProjectSnapshot> {
    const project = await this.projectFor(agent, signal)
    if (project === undefined) {
      throw new NovelRepositoryError(
        `novel repository remote: agent session "${agent.id}" is not rooted at a Novel Project`,
        'NOVEL_PROJECT_ROOT_INVALID',
      )
    }
    return project
  }
}

function validateByteBound(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DESCRIPTOR_MAX_BYTES) {
    throw new Error(`novel-repository-remote: ${name} must be an integer between 1 and ${MAX_DESCRIPTOR_MAX_BYTES}`)
  }
}

function assertResponseBytes(value: unknown, maxBytes: number, subject: string): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
  if (bytes > maxBytes) {
    throw new NovelRepositoryError(
      `novel repository remote: ${subject} exceeds ${maxBytes} bytes`,
      subject === 'project descriptor' ? 'NOVEL_PROJECT_DESCRIPTOR_TOO_LARGE' : 'NOVEL_RESPONSE_TOO_LARGE',
    )
  }
}

function assetDocument(snapshot: AssetSnapshot): NovelAssetDocument {
  const novel = snapshot.frontmatter['novel']
  const title: unknown = typeof novel === 'object' && novel !== null && !Array.isArray(novel)
    ? Reflect.get(novel, 'title')
    : undefined
  if (typeof title !== 'string') {
    throw new NovelRepositoryError('novel repository remote: Asset title is missing', 'NOVEL_HISTORY_CORRUPT')
  }
  return {
    id: snapshot.asset.id,
    projectId: snapshot.asset.projectId,
    type: snapshot.asset.type,
    ...(snapshot.asset.parentId === undefined ? {} : { parentId: snapshot.asset.parentId }),
    projectRelativePath: snapshot.asset.projectRelativePath,
    revisionId: snapshot.revisionId,
    contentHash: snapshot.contentHash,
    title,
    content: wireValue(snapshot.content, 'Asset content'),
  }
}

function changeSetDescriptor(value: ChangeSet): NovelChangeSetDescriptor {
  return {
    id: value.id,
    projectId: value.projectId,
    assetId: value.assetId,
    assetType: value.assetType,
    baseRevisionId: value.baseRevisionId,
    summary: value.summary,
    status: value.status,
    ...(value.resultRevisionId === undefined ? {} : { resultRevisionId: value.resultRevisionId }),
    operations: value.operations.map(operation => wireValue(operation, 'ChangeSet operation')),
  }
}

function wireValue(value: unknown, subject: string, ancestors = new Set<object>(), depth = 0): NovelWireValue {
  if (depth > 64) {
    throw new NovelRepositoryError(`novel repository remote: ${subject} is nested too deeply`, 'NOVEL_HISTORY_CORRUPT')
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value
    throw new NovelRepositoryError(`novel repository remote: ${subject} contains a non-JSON number`, 'NOVEL_HISTORY_CORRUPT')
  }
  if (typeof value !== 'object') {
    throw new NovelRepositoryError(`novel repository remote: ${subject} is not lossless JSON`, 'NOVEL_HISTORY_CORRUPT')
  }
  if (ancestors.has(value)) {
    throw new NovelRepositoryError(`novel repository remote: ${subject} is cyclic`, 'NOVEL_HISTORY_CORRUPT')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return value.map(item => wireValue(item, subject, ancestors, depth + 1))
    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype !== Object.prototype && prototype !== null) {
      throw new NovelRepositoryError(`novel repository remote: ${subject} has a non-JSON object`, 'NOVEL_HISTORY_CORRUPT')
    }
    const output: Record<string, NovelWireValue> = Object.create(null) as Record<string, NovelWireValue>
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: wireValue(item, subject, ancestors, depth + 1),
        writable: true,
      })
    }
    return output
  } finally {
    ancestors.delete(value)
  }
}

/** Convert provider targets into display-only browser values. */
function projectDescriptor(project: NovelProjectSnapshot): NovelProjectDescriptor {
  return {
    schema: project.schema,
    id: project.id,
    title: project.title,
    rootDisplayPath: project.root.displayPath,
    manifestDisplayPath: project.manifest.displayPath,
    contentRootDisplayPaths: Object.fromEntries(
      Object.entries(project.contentRoots).map(([name, target]) => [name, target.displayPath]),
    ),
  }
}

export default NovelRepositoryRemote
