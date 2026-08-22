/**
 * Experimental Novel Repository Service Definition. Providers locate and
 * validate Novel Projects without making paths or browser state their identity.
 * @module @deepseek-ai/dsh-experimental-novel-repository
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { NovelRepositoryError } from './error.ts'
import type { NovelProjectSnapshot } from './types.ts'

export { ProjectId } from './brand.ts'
export { NovelRepositoryError }
export type {
  NovelProjectSnapshot,
  NovelRepositoryErrorCode,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelRepository: NovelRepository
  }
}

/** Provider-neutral access to validated Novel Project declarations. */
export abstract class NovelRepository extends Service {
  constructor(ctx: Context) {
    super(ctx, 'novelRepository')
  }

  /**
   * Discover and validate the Novel Project rooted at one filesystem target.
   * @param root - Canonical candidate project directory from the active filesystem provider.
   * @param signal - Optional cancellation for all provider I/O.
   * @returns the validated project, or `undefined` when `novel.yaml` is absent.
   * @throws {NovelRepositoryError} when the root or present manifest is invalid or unsupported.
   */
  abstract discoverProject(root: FsTarget, signal?: AbortSignal): Promise<NovelProjectSnapshot | undefined>
}

export default NovelRepository
