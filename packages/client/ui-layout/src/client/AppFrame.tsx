/**
 * Shell frame registered into the built-in `root` slot. In ordinary mode it
 * owns the shipped sidebar | conversation | details grid and its drag/
 * concession behavior. When `ctx.layout` selects a domain workbench it keeps
 * the sidebar, seats conversation in the Agent column, and renders the elected
 * `shell.workbench` surface as the primary canvas. Pure component: everything
 * arrives through framework shares — zero Cordis access or self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import type { LayoutRootInjected } from './index.ts'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay' | 'shell.workbench'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & InjectFace<LayoutRootInjected>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The ordinary/workbench shell frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
  renderSlotChain,
  useWorkbench,
  closeWorkbench,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const currentSession = useSessions((s) => {
    const current = s.current
    if (current === undefined) return undefined
    const session = s.byId[current]
    return session === undefined ? undefined : {
      id: session.blank ? undefined : current,
      agentPreset: session.agentPreset,
    }
  })
  const detailsSession = currentSession?.id
  const workbench = useWorkbench(state => state)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  // The separator previews this private CSS variable without notifying React
  // on every pointermove. Normal state changes synchronize it before paint;
  // an in-flight gesture owns it until the final width is committed.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (frame === null) return
    if (workbench.id === null) frame.style.removeProperty('--dsh-workbench-agent-width')
    else if (!frame.hasAttribute('data-workbench-resizing')) {
      frame.style.setProperty('--dsh-workbench-agent-width', `${workbench.agentWidth}px`)
    }
  }, [workbench.agentWidth, workbench.id])

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  useEffect(() => {
    if (workbench.id === null) return
    // The no-Session hero can deliberately open a preset-gated workbench
    // before its first prompt creates a Session. The owning toggle closes it
    // if the staged preset moves away, so the generic shell must not race that
    // hand-off merely because no committed row exists yet.
    if (currentSession === undefined) return
    // The preset-gated owner decides whether an uncommitted/legacy row may
    // open and also closes when its staged choice moves away. The shell only
    // vetoes a workbench once the Session names a different committed preset;
    // treating an absent value as a mismatch races the before-first-prompt
    // hand-off and makes a valid entry appear to do nothing.
    if (currentSession.agentPreset === undefined) return
    if (currentSession.agentPreset !== workbench.agentPreset) closeWorkbench()
  }, [closeWorkbench, currentSession?.agentPreset, workbench.agentPreset, workbench.id])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const cols = computeColumns(
    viewport,
    sidebarPreference,
    workbench.id === null && detailsSession !== undefined ? panels.details : 0,
  )
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns: workbench.id === null
          ? `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`
          : `${cols.sidebar}px var(--dsh-workbench-agent-width) minmax(320px, 1fr)`,
      }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-workbench={workbench.id ?? undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.sidebarCol}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })}
      </div>
      {workbench.id === null ? <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; the strict details entry naturally renders
            empty while no session is current. */}
        <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn>{renderSlot('details', {})}</DetailsColumn>
      </> : <>
        <div className={css.workbenchAgentCol} data-details-open={panels.details > 0 || undefined}>
          <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
          <DetailsColumn>{renderSlot('details', {})}</DetailsColumn>
        </div>
        <div className={css.workbenchCol}>
          {renderSlotChain('shell.workbench', {
            id: workbench.id,
            agentWidth: workbench.agentWidth,
          })}
        </div>
      </>}
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {workbench.id === null && cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
