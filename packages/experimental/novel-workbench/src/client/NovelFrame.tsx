/** Stable three-surface Novel shell: assets, authored canvas, and Agent conversation. */

import { useRef, useState, type CSSProperties } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createNovelFrameStore } from './store.ts'
import css from './workbench.module.css'

export type NovelFrameProps = PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'novel.explorer' | 'novel.canvas' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createNovelFrameStore>>
  & PropsLocale<'novel-workbench'>

/** Root occupant preserving the canvas while the current Session changes. */
export function NovelFrame({ renderSlot, t, useStore, actions }: NovelFrameProps) {
  const sidebarCollapsed = useStore(state => state.sidebarCollapsed)
  const explorerCollapsed = useStore(state => state.explorerCollapsed)
  const detailsOpen = useStore(state => state.detailsOpen)
  const agentWidth = useStore(state => state.agentWidth)
  const sidebarWidth = sidebarCollapsed ? 56 : 230
  const explorerWidth = explorerCollapsed ? 0 : 230
  const explorerBoundary = sidebarWidth + agentWidth + 8 + explorerWidth
  return (
    <main
      className={css.frame}
      data-novel-workbench
      data-details-open={detailsOpen || undefined}
      style={{
        gridTemplateColumns: `${sidebarWidth}px ${agentWidth}px 8px ${explorerWidth}px minmax(320px, 1fr)`,
        '--novel-workbench-left': `${sidebarWidth + agentWidth + 8}px`,
      } as CSSProperties}
    >
      <aside className={css.dshSidebar} aria-label="DeepSeek Harness">
        {renderSlot('sidebar', { collapsed: sidebarCollapsed, width: sidebarWidth })}
      </aside>
      <aside className={css.agent} aria-label={t('agent')}>
        <div className={css.agentConversation}>{renderSlot('conversation', {})}</div>
        <div className={css.agentDetails} hidden={!detailsOpen}>{renderSlot('details', {})}</div>
      </aside>
      <PanelResizer
        value={agentWidth}
        label={t('resizePanels')}
        resetLabel={t('resetPanelWidth')}
        onChange={actions.setAgentWidth}
      />
      <aside className={css.explorer} aria-label={t('assetSidebar')} data-collapsed={explorerCollapsed || undefined}>
        {renderSlot('novel.explorer', {})}
      </aside>
      <button
        type="button"
        className={css.explorerToggle}
        style={{ left: explorerBoundary }}
        aria-label={explorerCollapsed ? t('expandExplorer') : t('collapseExplorer')}
        title={explorerCollapsed ? t('expandExplorer') : t('collapseExplorer')}
        onClick={actions.toggleExplorer}
      >{explorerCollapsed ? '›' : '‹'}</button>
      <section className={css.canvas}>{renderSlot('novel.canvas', {})}</section>
      <div className={css.overlay}>{renderSlot('shell.overlay', {})}</div>
    </main>
  )
}

interface PanelResizerProps {
  readonly value: number
  readonly label: string
  readonly resetLabel: string
  readonly onChange: (width: number) => void
}

/** Accessible vertical drag handle; pointer and keyboard both update the same panel preference. */
function PanelResizer({ value, label, resetLabel, onChange }: PanelResizerProps) {
  const drag = useRef<{ pointerId: number; clientX: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={css.panelResizer}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={300}
      aria-valuemax={640}
      aria-valuenow={value}
      tabIndex={0}
      title={resetLabel}
      data-dragging={dragging || undefined}
      onDoubleClick={() => { onChange(410) }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16
        if (event.key === 'ArrowLeft') { event.preventDefault(); onChange(value - step) }
        if (event.key === 'ArrowRight') { event.preventDefault(); onChange(value + step) }
        if (event.key === 'Home') { event.preventDefault(); onChange(300) }
        if (event.key === 'End') { event.preventDefault(); onChange(640) }
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        drag.current = { pointerId: event.pointerId, clientX: event.clientX, width: value }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const origin = drag.current
        if (origin === null || origin.pointerId !== event.pointerId) return
        onChange(origin.width + event.clientX - origin.clientX)
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        drag.current = null
        setDragging(false)
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false) }}
    />
  )
}
