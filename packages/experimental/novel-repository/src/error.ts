/** Typed Novel Repository failures shared by providers and consumers. */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { NovelRepositoryErrorCode } from './types.ts'

/** Failure to locate or validate a Novel Project without guessing a repair. */
export class NovelRepositoryError extends HarnessError {
  override readonly code: NovelRepositoryErrorCode

  constructor(message: string, code: NovelRepositoryErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
  }
}
