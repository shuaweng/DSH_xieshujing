/**
 * Read-only Host Remote Consumer for Novel Project discovery.
 * @module @deepseek-ai/dsh-experimental-novel-repository-remote
 */

import { constants as bufferConstants } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  NovelRepositoryError,
  type NovelProjectSnapshot,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type { NovelProjectDescriptor } from './types.ts'

export type { NovelProjectDescriptor } from './types.ts'

const DEFAULT_DESCRIPTOR_MAX_BYTES = 256 * 1024
const MAX_DESCRIPTOR_MAX_BYTES = bufferConstants.MAX_STRING_LENGTH

/** Host projection limits. */
export interface Config {
  /** Inclusive UTF-8 byte limit for one complete project descriptor. */
  descriptorMaxBytes?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelRepositoryRemote: NovelRepositoryRemote
  }
}

/** Project browser projection consuming the provider-neutral repository service. */
export class NovelRepositoryRemote extends TypertRemoteService {
  static inject = ['novelRepository', 'fs']
  static Config: z<Config> = z.object({
    descriptorMaxBytes: z.number().default(DEFAULT_DESCRIPTOR_MAX_BYTES),
  })

  private readonly descriptorMaxBytes: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'novelRepositoryRemote', { namespace: 'novelRepository' })
    const descriptorMaxBytes = config.descriptorMaxBytes ?? DEFAULT_DESCRIPTOR_MAX_BYTES
    if (
      !Number.isSafeInteger(descriptorMaxBytes)
      || descriptorMaxBytes < 1
      || descriptorMaxBytes > MAX_DESCRIPTOR_MAX_BYTES
    ) {
      throw new Error(
        `novel-repository-remote: descriptorMaxBytes must be an integer between 1 and ${MAX_DESCRIPTOR_MAX_BYTES}`,
      )
    }
    this.descriptorMaxBytes = descriptorMaxBytes
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
    const cwd = agent.session.header.cwd
    if (cwd === undefined) {
      throw new NovelRepositoryError(
        `novel repository remote: agent session "${agent.id}" has no working directory`,
        'NOVEL_PROJECT_ROOT_INVALID',
      )
    }
    const root = await this.ctx.fs.resolve(cwd, { signal })
    const project = await this.ctx.novelRepository.discoverProject(root, signal)
    if (project === undefined) return undefined
    const descriptor = projectDescriptor(project)
    const bytes = new TextEncoder().encode(JSON.stringify(descriptor)).byteLength
    if (bytes > this.descriptorMaxBytes) {
      throw new NovelRepositoryError(
        `novel repository remote: project descriptor exceeds ${this.descriptorMaxBytes} bytes`,
        'NOVEL_PROJECT_DESCRIPTOR_TOO_LARGE',
      )
    }
    return descriptor
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
