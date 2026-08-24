/** Preset-gated Composer control for opening and closing the whole Novel workbench. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NOVEL_WORKBENCH_ID, NOVEL_WORKBENCH_PRESET } from './constants.ts'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchViewState } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AgentPresetSelection } from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import css from './WorkbenchToggle.module.css'

export interface WorkbenchToggleInjected {
  hooks: {
    workbench: HostObservable<WorkbenchViewState>
    agentPresetSelection: AgentPresetSelection
  }
  toggleWorkbench: () => void
}

type WorkbenchToggleProps = PropsRuntime<'conversation.input.left'>
  & PropsLocale<'novel-workbench'>
  & InjectFace<WorkbenchToggleInjected>

/** Render nothing outside the exact Novel preset; active state is browser-local presentation only. */
export function WorkbenchToggle({
  sessionId, session, useSessions, useWorkbench, useAgentPresetSelection, toggleWorkbench, t,
}: WorkbenchToggleProps) {
  // Eligibility belongs to this exact Composer scope. Falling back to the
  // globally selected Session leaks the previous preset into a new-session
  // draft while its own preset is being chosen.
  const committedPreset = useSessions(state => state.byId[sessionId]?.agentPreset)
  const stagedPreset = useAgentPresetSelection(state => state.current)
  // A started Session only trusts its committed composition. The blank hero
  // may precede its session-list row, so only that state may read the chooser's
  // staged value.
  const preset = committedPreset ?? (session.blank ? stagedPreset : undefined)
  const open = useWorkbench(state => state.id === NOVEL_WORKBENCH_ID)
  if (preset !== NOVEL_WORKBENCH_PRESET) return null
  const label = open ? t('closeWorkbench') : t('openWorkbench')
  return (
    <button
      type="button"
      className={css.toggle}
      data-open={open || undefined}
      aria-label={label}
      aria-pressed={open}
      title={label}
      onClick={toggleWorkbench}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
        <path d="M2.25 2.75h11.5v10.5H2.25zM5.5 3v10M6 6.25h5.4M6 8.2h4.25M6 10.15h3.1" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
