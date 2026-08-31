/** Stable Novel workbench surface: Asset explorer plus authored canvas. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useNovelWorkbenchView } from './view-controller.ts'
import type { NovelWorkbenchViewController } from './view-controller.ts'
import css from './workbench.module.css'

export interface NovelFrameInjected {
  workbench: NovelWorkbenchViewController
}

export type NovelFrameProps = PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<'novel.explorer' | 'novel.canvas'>
  & PropsLocale<'novel-workbench'>
  & InjectFace<NovelFrameInjected>

/** Elected domain surface preserving the canvas while the current Session changes. */
export function NovelFrame({ renderSlot, t, workbench }: NovelFrameProps) {
  const visible = useNovelWorkbenchView(workbench, state => state.visible)
  const agentWidth = useNovelWorkbenchView(workbench, state => state.agentWidth)
  const page = useNovelWorkbenchView(workbench, state => state.page)
  const explorerCollapsed = useNovelWorkbenchView(workbench, state => state.explorerCollapsed)
  const explorerHidden = page === 'home' || explorerCollapsed
  const explorerWidth = explorerHidden ? 0 : 230
  const explorerBoundary = explorerWidth
  const frameRef = useRef<HTMLElement | null>(null)
  useNativeConversationSplit(frameRef, visible, agentWidth)
  if (!visible) return null
  return (
    <main
      ref={frameRef}
      className={css.frame}
      data-novel-workbench
      data-novel-page={page}
      style={{
        '--novel-agent-width': `${agentWidth}px`,
        gridTemplateColumns: `${explorerWidth}px minmax(320px, 1fr)`,
      } as React.CSSProperties}
    >
      <PanelResizer
        value={agentWidth}
        label={t('resizePanels')}
        resetLabel={t('resetPanelWidth')}
        onChange={(width) => { workbench.setAgentWidth(width) }}
      />
      <aside
        className={css.explorer}
        aria-label={t('assetSidebar')}
        aria-hidden={page === 'home' || undefined}
        data-collapsed={explorerHidden || undefined}
        data-novel-chrome="explorer"
      >
        {renderSlot('novel.explorer', {})}
      </aside>
      {page === 'book' && <button
        type="button"
        className={css.explorerToggle}
        style={{ left: explorerBoundary }}
        data-novel-chrome="explorer-toggle"
        aria-label={explorerCollapsed ? t('expandExplorer') : t('collapseExplorer')}
        title={explorerCollapsed ? t('expandExplorer') : t('collapseExplorer')}
        onClick={() => { workbench.toggleExplorer() }}
      >{explorerCollapsed ? '›' : '‹'}</button>}
      <section className={css.canvas}>{renderSlot('novel.canvas', {})}</section>
      <div className={css.statusHost} data-novel-status-host />
    </main>
  )
}

const SHELL_SIDEBAR_PROPERTY = '--novel-shell-sidebar-track'
const SHELL_CONVERSATION_PROPERTY = '--novel-shell-conversation-track'

/** Resolve the Host shell without depending on Cordis slot wrapper depth. */
function resolveHostShell(frame: HTMLElement | null): HTMLElement | null {
  const overlay = frame?.closest<HTMLElement>('[data-shell-overlay]')
  return overlay?.parentElement ?? null
}

/**
 * Adapt the public `shell.overlay` seat to a native conversation/workbench split.
 *
 * DSH 0.1.2 exposes the shell seat but no cross-plugin column API. Keeping this
 * compatibility adapter inside the plugin avoids requiring a patched Host: it
 * temporarily overrides only the shell's rendered grid while the workbench is
 * visible, follows the Host sidebar track, and removes every marker on teardown.
 */
function useNativeConversationSplit(
  frameRef: React.RefObject<HTMLElement | null>,
  visible: boolean,
  preferredWidth: number,
): void {
  useLayoutEffect(() => {
    const shell = resolveHostShell(frameRef.current)
    if (!visible || shell === null) return

    const sync = (): void => {
      const sidebar = shell.style.gridTemplateColumns.match(/^([0-9.]+)px\b/u)?.[1] ?? '0'
      const available = shell.clientWidth > 0
        ? Math.max(AGENT_WIDTH_MIN, shell.clientWidth - Number(sidebar) - 320)
        : AGENT_WIDTH_MAX
      const conversation = Math.min(clampAgentWidth(preferredWidth), available)
      const sidebarTrack = `${sidebar}px`
      const conversationTrack = `${conversation}px`
      if (shell.style.getPropertyValue(SHELL_SIDEBAR_PROPERTY) !== sidebarTrack) {
        shell.style.setProperty(SHELL_SIDEBAR_PROPERTY, sidebarTrack)
      }
      if (shell.style.getPropertyValue(SHELL_CONVERSATION_PROPERTY) !== conversationTrack) {
        shell.style.setProperty(SHELL_CONVERSATION_PROPERTY, conversationTrack)
      }
    }

    shell.setAttribute('data-novel-workbench-shell', '')
    sync()
    const mutations = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(sync)
    mutations?.observe(shell, { attributes: true, attributeFilter: ['style'] })
    const resize = new ResizeObserver(sync)
    resize.observe(shell)
    return () => {
      mutations?.disconnect()
      resize.disconnect()
      shell.removeAttribute('data-novel-workbench-shell')
      shell.style.removeProperty(SHELL_SIDEBAR_PROPERTY)
      shell.style.removeProperty(SHELL_CONVERSATION_PROPERTY)
    }
  }, [frameRef, preferredWidth, visible])
}

interface PanelResizerProps {
  readonly value: number
  readonly label: string
  readonly resetLabel: string
  readonly onChange: (width: number) => void
}

const AGENT_WIDTH_MIN = 300
const AGENT_WIDTH_MAX = 640
const AGENT_WIDTH_DEFAULT = 410
const AGENT_WIDTH_PROPERTY = '--novel-agent-width'

interface PanelDrag {
  readonly pointerId: number
  readonly clientX: number
  readonly width: number
  readonly host: HTMLElement
  readonly shell: HTMLElement | null
  latestClientX: number
}

function clampAgentWidth(width: number): number {
  return Math.min(AGENT_WIDTH_MAX, Math.max(AGENT_WIDTH_MIN, Math.round(width)))
}

/** Accessible vertical drag handle; pointer and keyboard both update the same panel preference. */
function PanelResizer({ value, label, resetLabel, onChange }: PanelResizerProps) {
  const drag = useRef<PanelDrag | null>(null)
  const frame = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const cancelFrame = (): void => {
    if (frame.current === null) return
    cancelAnimationFrame(frame.current)
    frame.current = null
  }
  const preview = (active: PanelDrag, clientX: number): number => {
    const width = clampAgentWidth(active.width + clientX - active.clientX)
    active.host.style.setProperty(AGENT_WIDTH_PROPERTY, `${width}px`)
    active.shell?.style.setProperty(SHELL_CONVERSATION_PROPERTY, `${width}px`)
    return width
  }
  const cancelDrag = (): void => {
    const active = drag.current
    cancelFrame()
    if (active !== null) {
      active.host.style.setProperty(AGENT_WIDTH_PROPERTY, `${value}px`)
      active.shell?.style.setProperty(SHELL_CONVERSATION_PROPERTY, `${value}px`)
      active.host.removeAttribute('data-workbench-resizing')
    }
    drag.current = null
    setDragging(false)
  }

  useEffect(() => () => {
    cancelFrame()
    drag.current?.host.removeAttribute('data-workbench-resizing')
  }, [])

  return (
    <div
      className={css.panelResizer}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={AGENT_WIDTH_MIN}
      aria-valuemax={AGENT_WIDTH_MAX}
      aria-valuenow={value}
      tabIndex={0}
      title={resetLabel}
      data-dragging={dragging || undefined}
      onDoubleClick={() => { onChange(AGENT_WIDTH_DEFAULT) }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16
        if (event.key === 'ArrowLeft') { event.preventDefault(); onChange(value - step) }
        if (event.key === 'ArrowRight') { event.preventDefault(); onChange(value + step) }
        if (event.key === 'Home') { event.preventDefault(); onChange(AGENT_WIDTH_MIN) }
        if (event.key === 'End') { event.preventDefault(); onChange(AGENT_WIDTH_MAX) }
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        const host = event.currentTarget.closest<HTMLElement>('[data-novel-workbench]')
        if (host === null) return
        drag.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          latestClientX: event.clientX,
          width: value,
          host,
          shell: resolveHostShell(host),
        }
        host.setAttribute('data-workbench-resizing', '')
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const active = drag.current
        if (active === null || active.pointerId !== event.pointerId) return
        active.latestClientX = event.clientX
        frame.current ??= requestAnimationFrame(() => {
          frame.current = null
          const current = drag.current
          if (current !== null) preview(current, current.latestClientX)
        })
      }}
      onPointerUp={(event) => {
        const active = drag.current
        if (active?.pointerId !== event.pointerId) return
        cancelFrame()
        const width = preview(active, event.clientX)
        drag.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
        active.host.removeAttribute('data-workbench-resizing')
        onChange(width)
      }}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
    />
  )
}
