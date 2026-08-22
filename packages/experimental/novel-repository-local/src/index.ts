/**
 * Local-filesystem Novel Repository provider. It recognizes a versioned
 * `novel.yaml` marker and resolves every declared content root through `ctx.fs`.
 * @module @deepseek-ai/dsh-experimental-novel-repository-local
 */

import { constants as bufferConstants } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FsError, type FsTarget } from '@deepseek-ai/dsh-fs'
import NovelRepository, {
  NovelRepositoryError,
  type NovelProjectSnapshot,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { parseProjectManifest } from './manifest.ts'

const PROJECT_MANIFEST = 'novel.yaml'
const DEFAULT_MANIFEST_MAX_BYTES = 64 * 1024
const MAX_MANIFEST_MAX_BYTES = Math.min(bufferConstants.MAX_LENGTH, bufferConstants.MAX_STRING_LENGTH)

/** Local provider limits. */
export interface Config {
  /** Inclusive byte limit for the complete `novel.yaml`; defaults to 64 KiB. */
  manifestMaxBytes?: number
}

/** Local provider for version-one Novel Project discovery. */
export class LocalNovelRepository extends NovelRepository {
  static inject = ['fs']
  static Config: z<Config> = z.object({
    manifestMaxBytes: z.number().default(DEFAULT_MANIFEST_MAX_BYTES),
  })

  /** Validated complete-manifest byte bound. */
  readonly manifestMaxBytes: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const maxBytes = config.manifestMaxBytes ?? DEFAULT_MANIFEST_MAX_BYTES
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_MANIFEST_MAX_BYTES) {
      throw new Error(
        `novel-repository-local: manifestMaxBytes must be an integer between 1 and ${MAX_MANIFEST_MAX_BYTES}`,
      )
    }
    this.manifestMaxBytes = maxBytes
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

    let bytes: Uint8Array
    try {
      bytes = await this.ctx.fs.readBytes(manifest, signal, this.manifestMaxBytes)
    } catch (error) {
      if (error instanceof FsError && error.code === 'FS_TOO_LARGE') {
        throw new NovelRepositoryError(
          `novel repository: project manifest "${manifest.displayPath}" exceeds ${this.manifestMaxBytes} bytes`,
          'NOVEL_PROJECT_MANIFEST_TOO_LARGE',
          { cause: error },
        )
      }
      throw error
    }
    if (bytes.includes(0)) {
      throw new NovelRepositoryError(
        `novel repository: project manifest "${manifest.displayPath}" contains a NUL byte`,
        'NOVEL_PROJECT_MANIFEST_INVALID',
      )
    }

    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (error) {
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

    return {
      schema: 1,
      id: parsed.id,
      title: parsed.title,
      root: { ...root },
      manifest: { ...manifest },
      contentRoots,
    }
  }
}

export default LocalNovelRepository
