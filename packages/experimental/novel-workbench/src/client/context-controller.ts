/** Browser focus facts used to author exact Session context worksets. */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  NovelAssetDocument,
  NovelProjectDescriptor,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'

/** Last rendered authored Asset and whether its visible draft is retained. */
export interface NovelContextFocus {
  readonly sessionId: SessionId
  readonly project: NovelProjectDescriptor
  readonly document: NovelAssetDocument
  readonly dirty: boolean
}

/** Small observable bridge from the workbench canvas to the session-scoped Composer tray. */
export class NovelContextFocusController {
  #snapshot: NovelContextFocus | undefined
  readonly #listeners = new Set<() => void>()

  readonly getSnapshot = (): NovelContextFocus | undefined => this.#snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Publish the latest detached focus fact, or clear it when no Asset is open. */
  set(value: NovelContextFocus | undefined): void {
    const next = value === undefined ? undefined : structuredClone(value)
    if (JSON.stringify(this.#snapshot) === JSON.stringify(next)) return
    this.#snapshot = next
    for (const listener of this.#listeners) listener()
  }
}
