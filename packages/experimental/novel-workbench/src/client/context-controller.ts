/** Browser focus facts used to author exact Session context worksets. */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  NovelAssetDocument,
  NovelContextWorksetDescriptor,
  NovelProjectDescriptor,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'

/** Last rendered authored Asset and whether its visible draft is retained. */
export interface NovelContextFocus {
  readonly sessionId: SessionId
  readonly project: NovelProjectDescriptor
  readonly document: NovelAssetDocument
  readonly dirty: boolean
}

/** Project readiness shared with the Session-scoped context tray without mounting the root workbench store twice. */
export interface NovelProjectStatusFocus {
  readonly sessionId: SessionId
  readonly status: 'loading' | 'uninitialized' | 'ready' | 'error'
}

/** Bounded facts from the visible cross-Workspace library home. */
export interface NovelLibraryContextFocus {
  readonly sessionId: SessionId
  /** Current Session project: the surface grants no access to the other listed books. */
  readonly projectId: NovelProjectDescriptor['id']
  readonly surface: NonNullable<NovelContextWorksetDescriptor['surface']>
}

/** Small observable bridge from the workbench canvas to the session-scoped Composer tray. */
export class NovelContextFocusController {
  #snapshot: NovelContextFocus | undefined
  readonly #listeners = new Set<() => void>()

  /** Return the last detached focus fact for React external-store reads. */
  readonly getSnapshot = (): NovelContextFocus | undefined => this.#snapshot
  /** Subscribe one listener until its returned disposer is called. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Publish the latest detached focus fact, or clear it when no Asset is open.
   * @param value Latest visible Asset focus, or undefined when the canvas has none.
   */
  set(value: NovelContextFocus | undefined): void {
    const next = value === undefined ? undefined : structuredClone(value)
    if (JSON.stringify(this.#snapshot) === JSON.stringify(next)) return
    this.#snapshot = next
    for (const listener of this.#listeners) listener()
  }
}

/** Observable bridge from the library home to the Session-owned Context Tray. */
export class NovelLibraryContextFocusController {
  #snapshot: NovelLibraryContextFocus | undefined
  readonly #listeners = new Set<() => void>()
  /** Return the latest detached library-home surface. */
  readonly getSnapshot = (): NovelLibraryContextFocus | undefined => this.#snapshot
  /** Subscribe until the returned disposer is called. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  /** Publish visible bounded library facts, or clear them when leaving home. */
  set(value: NovelLibraryContextFocus | undefined): void {
    if (value === undefined && this.#snapshot === undefined) return
    const next = value === undefined ? undefined : structuredClone(value)
    if (JSON.stringify(this.#snapshot) === JSON.stringify(next)) return
    this.#snapshot = next
    for (const listener of this.#listeners) listener()
  }
}

/** Small observable bridge for project readiness only. */
export class NovelProjectStatusController {
  #snapshot: NovelProjectStatusFocus | undefined
  readonly #listeners = new Set<() => void>()
  /** Return the last detached project readiness fact for React external-store reads. */
  readonly getSnapshot = (): NovelProjectStatusFocus | undefined => this.#snapshot
  /** Subscribe one listener until its returned disposer is called. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  /**
   * Publish the latest detached project readiness fact, or clear it with the owning surface.
   * @param value - Latest Session project readiness, or undefined when no workbench reports it.
   */
  set(value: NovelProjectStatusFocus | undefined): void {
    const next = value === undefined ? undefined : { ...value }
    if (JSON.stringify(this.#snapshot) === JSON.stringify(next)) return
    this.#snapshot = next
    for (const listener of this.#listeners) listener()
  }
}
