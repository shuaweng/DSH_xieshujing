/** Browser-local presentation state owned by the elected Novel surface. */

import { useSyncExternalStore } from 'react'

/** Transient geometry and visibility for one browser's Novel workbench presentation. */
export interface NovelWorkbenchViewState {
  /** Whether the additive Novel surface currently occupies the shell overlay. */
  readonly visible: boolean
  /** Width kept available for the underlying Agent surface at the left edge. */
  readonly agentWidth: number
  readonly explorerCollapsed: boolean
  /** Browser-local surface selection; authored project data never stores it. */
  readonly page: 'home' | 'book'
  /** One-shot cross-Workspace navigation request consumed by the explorer. */
  readonly requestedAssetId: string | undefined
}

/** Small observable controller: presentation state never enters authored Assets or Session projections. */
export class NovelWorkbenchViewController {
  #snapshot: NovelWorkbenchViewState
  readonly #listeners = new Set<() => void>()

  /**
   * @param initialPage - first surface shown when the workbench is elected.
   * Production starts at the library home; isolated component tests and
   * embedders may retain the historical book-first behavior.
   */
  constructor(initialPage: NovelWorkbenchViewState['page'] = 'book') {
    this.#snapshot = {
      visible: false,
      agentWidth: 410,
      explorerCollapsed: false,
      page: initialPage,
      requestedAssetId: undefined,
    }
  }

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

  /** Show the Novel surface without changing the selected page or Asset. */
  open(): void { this.#update({ visible: true }) }

  /** Hide the Novel surface while retaining browser-local navigation state. */
  close(): void { this.#update({ visible: false }) }

  /** Toggle the Novel surface from the Composer affordance. */
  toggle(): void { this.#update({ visible: !this.#snapshot.visible }) }

  /** Commit the Agent/workbench split after a pointer or keyboard gesture. */
  setAgentWidth(agentWidth: number): void {
    this.#update({ agentWidth: Math.min(640, Math.max(300, Math.round(agentWidth))) })
  }

  /** Return to the cross-Workspace Novel library home. */
  openHome(): void { this.#update({ page: 'home', requestedAssetId: undefined }) }

  /** Enter one book, optionally requesting an exact Asset after Session navigation. */
  openBook(assetId?: string): void {
    this.#update({ visible: true, page: 'book', requestedAssetId: assetId })
  }

  /** Clear a navigation request after the target book has resolved it. */
  clearRequestedAsset(assetId: string): void {
    if (this.#snapshot.requestedAssetId !== assetId) return
    this.#update({ requestedAssetId: undefined })
  }

  #update(patch: Partial<NovelWorkbenchViewState>): void {
    const next = { ...this.#snapshot, ...patch }
    if (next.visible === this.#snapshot.visible
      && next.agentWidth === this.#snapshot.agentWidth
      && next.explorerCollapsed === this.#snapshot.explorerCollapsed
      && next.page === this.#snapshot.page
      && next.requestedAssetId === this.#snapshot.requestedAssetId) return
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
