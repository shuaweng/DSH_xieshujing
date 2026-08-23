/** Stable three-surface Novel shell: assets, authored canvas, and Agent conversation. */

import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createNovelFrameStore } from './store.ts'
import css from './workbench.module.css'

export type NovelFrameProps = PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'novel.explorer' | 'novel.canvas' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createNovelFrameStore>>
  & PropsLocale<'novel-workbench'>

/** Root occupant preserving the canvas while the current Session changes. */
export function NovelFrame({ renderSlot, t, useStore }: NovelFrameProps) {
  const sidebarCollapsed = useStore(state => state.sidebarCollapsed)
  const detailsOpen = useStore(state => state.detailsOpen)
  const sidebarWidth = sidebarCollapsed ? 56 : 230
  return (
    <main
      className={css.frame}
      data-novel-workbench
      data-details-open={detailsOpen || undefined}
      style={{ gridTemplateColumns: `${sidebarWidth}px minmax(340px, 410px) 230px minmax(420px, 1fr)` }}
    >
      <aside className={css.dshSidebar} aria-label="DeepSeek Harness">
        {renderSlot('sidebar', { collapsed: sidebarCollapsed, width: sidebarWidth })}
      </aside>
      <aside className={css.agent} aria-label={t('agent')}>
        <div className={css.agentConversation}>{renderSlot('conversation', {})}</div>
        <div className={css.agentDetails} hidden={!detailsOpen}>{renderSlot('details', {})}</div>
      </aside>
      <aside className={css.explorer} aria-label={t('chapters')}>
        {renderSlot('novel.explorer', {})}
      </aside>
      <section className={css.canvas}>{renderSlot('novel.canvas', {})}</section>
      <div className={css.overlay}>{renderSlot('shell.overlay', {})}</div>
    </main>
  )
}
