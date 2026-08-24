/** Browser-local presentation state owned by the elected Novel surface. */

import { useSyncExternalStore } from 'react'

/** Transient geometry and visibility for one browser's Novel workbench presentation. */
export interface NovelWorkbenchViewState {
  readonly explorerCollapsed: boolean
}

/** Small observable controller: presentation state never enters authored Assets or Session projections. */
export class NovelWorkbenchViewController {
  #snapshot: NovelWorkbenchViewState = { explorerCollapsed: false }
  readonly #listeners = new Set<() => void>()

  /**
   * Read the current immutable presentation snapshot.
   * @returns the current immutable presentation snapshot.
   */
  readonly getSnapshot = (): NovelWorkbenchViewState => this.#snapshot
  /**
   * Subscribe to presentation changes.
   * @param listener - callback invoked after the snapshot changes.
   * @returns a disposer that removes the callback.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Toggle the Asset explorer while the Novel frame is open. */
  toggleExplorer(): void { this.#update({ explorerCollapsed: !this.#snapshot.explorerCollapsed }) }

  #update(patch: Partial<NovelWorkbenchViewState>): void {
    const next = { ...this.#snapshot, ...patch }
    if (next.explorerCollapsed === this.#snapshot.explorerCollapsed) return
    this.#snapshot = next
    for (const listener of this.#listeners) listener()
  }
}

/**
 * Read a selected presentation value without introducing a second framework Store axis.
 * @param controller - browser-local workbench presentation controller.
 * @param selector - pure projection from the current presentation snapshot.
 * @returns the selected value, refreshed after controller updates.
 */
export function useNovelWorkbenchView<T>(
  controller: NovelWorkbenchViewController,
  selector: (state: NovelWorkbenchViewState) => T,
): T {
  return selector(useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot))
}
