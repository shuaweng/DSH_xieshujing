/** Stable Novel workbench surface: Asset explorer plus authored canvas. */

import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useNovelWorkbenchView } from './view-controller.ts'
import type { NovelWorkbenchViewController } from './view-controller.ts'
import css from './workbench.module.css'

export interface NovelFrameInjected {
  workbench: NovelWorkbenchViewController
  setAgentWidth: (width: number) => void
}

export type NovelFrameProps = PropsRuntime<'shell.workbench'>
  & { matched: { id: 'novel' } }
  & PropsRenderSlots<'novel.explorer' | 'novel.canvas'>
  & PropsLocale<'novel-workbench'>
  & InjectFace<NovelFrameInjected>

/** Elected domain surface preserving the canvas while the current Session changes. */
export function NovelFrame({ renderSlot, t, workbench, agentWidth, setAgentWidth }: NovelFrameProps) {
  const explorerCollapsed = useNovelWorkbenchView(workbench, state => state.explorerCollapsed)
  const explorerWidth = explorerCollapsed ? 0 : 230
  const explorerBoundary = explorerWidth
  return (
    <main
      className={css.frame}
      data-novel-workbench
      style={{
        gridTemplateColumns: `${explorerWidth}px minmax(320px, 1fr)`,
      }}
    >
      <PanelResizer
        value={agentWidth}
        label={t('resizePanels')}
        resetLabel={t('resetPanelWidth')}
        onChange={setAgentWidth}
      />
      <aside
        className={css.explorer}
        aria-label={t('assetSidebar')}
        data-collapsed={explorerCollapsed || undefined}
        data-novel-chrome="explorer"
      >
        {renderSlot('novel.explorer', {})}
      </aside>
      <button
        type="button"
        className={css.explorerToggle}
        style={{ left: explorerBoundary }}
        data-novel-chrome="explorer-toggle"
        aria-label={explorerCollapsed ? t('expandExplorer') : t('collapseExplorer')}
        title={explorerCollapsed ? t('expandExplorer') : t('collapseExplorer')}
        onClick={() => { workbench.toggleExplorer() }}
      >{explorerCollapsed ? '›' : '‹'}</button>
      <section className={css.canvas}>{renderSlot('novel.canvas', {})}</section>
    </main>
  )
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
const AGENT_WIDTH_PROPERTY = '--dsh-workbench-agent-width'

interface PanelDrag {
  readonly pointerId: number
  readonly clientX: number
  readonly width: number
  readonly host: HTMLElement
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
    return width
  }
  const cancelDrag = (): void => {
    const active = drag.current
    cancelFrame()
    if (active !== null) {
      active.host.style.setProperty(AGENT_WIDTH_PROPERTY, `${value}px`)
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
        const host = event.currentTarget.closest<HTMLElement>('[data-workbench]')
        if (host === null) return
        drag.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          latestClientX: event.clientX,
          width: value,
          host,
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
