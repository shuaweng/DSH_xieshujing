/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry itself lives in the root entry's layout store (stores.ts);
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (sidebar toggle from ui-sidebar,
 * details open/close from ui-conversation) — writes stay inside the store's
 * declared action set, delivered as the registration's bound actions.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from './stores.ts'

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/** Browser-local shell takeover selected by a domain workbench. */
export interface WorkbenchViewState {
  /** Registered workbench id, or null while the ordinary DSH frame is visible. */
  readonly id: string | null
  /** Agent preset allowed to retain this workbench. */
  readonly agentPreset: string | null
  /** Width of the conversation column while a workbench is visible. */
  readonly agentWidth: number
}

/**
 * The outward layout face (`ctx.layout`): the panel transitions other
 * plugins may trigger — and exactly what a test fake must supply. The
 * attachPanels wiring hook stays on the concrete class (root-entry assembly
 * only).
 */
export interface ILayout {
  /** Reactive browser-local workbench selection. */
  readonly workbench: HostObservable<WorkbenchViewState>
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /** Open the details panel (no-op when already open). */
  openDetails(): void
  /** Close the details panel. */
  closeDetails(): void
  /** Open one workbench for the named Agent preset. */
  openWorkbench(id: string, agentPreset: string): void
  /** Return to the ordinary DSH frame. */
  closeWorkbench(): void
  /** Toggle one workbench without changing authored or Session state. */
  toggleWorkbench(id: string, agentPreset: string): void
  /** Resize the Agent conversation column while a workbench is visible. */
  setWorkbenchAgentWidth(width: number): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  #panels: PanelActions | undefined
  #workbench: WorkbenchViewState = { id: null, agentPreset: null, agentWidth: 410 }
  readonly #workbenchListeners = new Set<() => void>()

  readonly workbench: HostObservable<WorkbenchViewState> = {
    getSnapshot: () => this.#workbench,
    subscribe: (listener) => {
      this.#workbenchListeners.add(listener)
      return () => { this.#workbenchListeners.delete(listener) }
    },
  }

  /**
   * Adopt the root entry's bound store actions. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render; on entry re-register the
   * fresh actions overwrite the stale set.
   * @param actions - bound actions of the entry's layout store instance.
   */
  attachPanels(actions: PanelActions): void {
    this.#panels = actions
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  /** Open the details panel (no-op when already open). */
  openDetails(): void {
    this.#require().openDetails()
  }

  /** Close the details panel. */
  closeDetails(): void {
    this.#require().closeDetails()
  }

  /** Open one workbench for the named Agent preset. */
  openWorkbench(id: string, agentPreset: string): void {
    this.#setWorkbench({ id, agentPreset })
  }

  /** Return to the ordinary DSH frame. */
  closeWorkbench(): void {
    this.#setWorkbench({ id: null, agentPreset: null })
  }

  /** Toggle one workbench without changing authored or Session state. */
  toggleWorkbench(id: string, agentPreset: string): void {
    if (this.#workbench.id === id) this.closeWorkbench()
    else this.openWorkbench(id, agentPreset)
  }

  /** Resize the Agent conversation column while a workbench is visible. */
  setWorkbenchAgentWidth(width: number): void {
    this.#setWorkbench({ agentWidth: Math.min(640, Math.max(300, Math.round(width))) })
  }

  #require(): PanelActions {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }

  #setWorkbench(patch: Partial<WorkbenchViewState>): void {
    const next = { ...this.#workbench, ...patch }
    if (next.id === this.#workbench.id
      && next.agentPreset === this.#workbench.agentPreset
      && next.agentWidth === this.#workbench.agentWidth) return
    this.#workbench = next
    for (const listener of this.#workbenchListeners) listener()
  }
}
