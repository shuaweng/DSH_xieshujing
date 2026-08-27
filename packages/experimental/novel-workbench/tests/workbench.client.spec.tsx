// @vitest-environment jsdom
/** Novel Workbench interaction contract: layout, commit barrier, and review decisions. */

import { useSyncExternalStore } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import {
  createSnapshotStore, SlotRegistry, type SessionId, type SessionListState, type ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'
import type { InputTriggerSource, ReferenceInsert } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {
  NovelChangeSetDescriptor,
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelAssetSearchResult,
  NovelAnalysisReportDescriptor,
  NovelPreferenceCandidateDescriptor,
  NovelRevisionFinalizationDescriptor,
  NovelStoryStateCandidateDescriptor,
  NovelContextWorksetDescriptor,
  NovelSelectionDescriptor,
  CreateNovelAssetRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import { NovelFrame } from '../src/client/NovelFrame.tsx'
import { WorkbenchToggle } from '../src/client/WorkbenchToggle.tsx'
import { NovelPresentationCard } from '../src/client/NovelPresentationCard.tsx'
import { Explorer } from '../src/client/Explorer.tsx'
import { Canvas, shortReferenceLabel } from '../src/client/Canvas.tsx'
import { ContextTray, humanContextLabel } from '../src/client/ContextTray.tsx'
import { NovelContextFocusController, NovelProjectStatusController } from '../src/client/context-controller.ts'
import { ChangeSetCard, type NovelChangeReview } from '../src/client/ChangeSetCard.tsx'
import { createNovelWorkbenchStore } from '../src/client/store.ts'
import { NovelWorkbenchViewController } from '../src/client/view-controller.ts'
import { zh } from '../src/client/locales.ts'
import { apply as applyWorkbench, inject as workbenchInject } from '../src/client/index.ts'
import {
  manuscriptChapterRenderer,
  NovelAssetRendererRegistry,
} from '../src/client/renderers.tsx'
import NovelWorkbenchReady from '../src/index.ts'
import * as invariant from '../src/invariant.ts'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SID = 'session-novel' as SessionId
const t = ((key: keyof typeof zh) => zh[key]) as never

function hookOf<T>(instance: { subscribe: (listener: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(select: (state: T) => S): S {
    return select(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  }
}

function useSessions<T>(select: (state: SessionListState) => T): T {
  return select({
    ids: [SID],
    byId: { [SID]: { id: SID, displayTitle: 'Novel', agentPreset: 'novel-workbench', running: false, blank: false, updatedAt: 1 } },
    current: SID,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  })
}

const renderers = { get: () => manuscriptChapterRenderer } as never

async function openStub(): Promise<NovelAssetDocument> { return chapter() }
async function createStub(): Promise<NovelAssetDocument> { return chapter() }
async function reorderStub(_sessionId: SessionId, _request: unknown): Promise<readonly NovelAssetDescriptor[]> { return [] }
const canvasAnalysisStubs = {
  initialize: async () => ({
    schema: 1 as const, id: 'project-1' as never, title: '白港', rootDisplayPath: '/story',
    manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
  }),
  revisions: async () => [],
  restore: async () => { throw new Error('not exercised') },
  analysisReports: async () => [],
  scanNoAi: async () => analysisReport('noai-scan'),
  reviewChapter: async () => analysisReport('chapter-review'),
  finalizations: async () => [],
  preferenceCandidates: async () => [],
  storyStateCandidates: async () => [],
  finalizeChapter: async () => { throw new Error('not exercised') },
  acceptPreference: async () => { throw new Error('not exercised') },
  rejectPreference: async () => { throw new Error('not exercised') },
  acceptStoryState: async () => { throw new Error('not exercised') },
  rejectStoryState: async () => { throw new Error('not exercised') },
}

function chapter(overrides: Partial<NovelAssetDocument> = {}): NovelAssetDocument {
  return {
    id: 'asset-chapter-1' as NovelAssetDocument['id'],
    projectId: 'project-1' as NovelAssetDocument['projectId'],
    type: 'manuscript.chapter',
    projectRelativePath: 'manuscript/chapter-1.md',
    revisionId: 'revision-1' as NovelAssetDocument['revisionId'],
    contentHash: `sha256:${'a'.repeat(64)}`,
    title: '第一章',
    content: { kind: 'manuscript', body: '旧句继续。' },
    ...overrides,
  }
}

function chapterOutline(overrides: Partial<NovelAssetDocument> = {}): NovelAssetDocument {
  return {
    id: 'asset-chapter-outline-1' as NovelAssetDocument['id'],
    projectId: 'project-1' as NovelAssetDocument['projectId'],
    type: 'planning.chapter-outline',
    parentId: 'asset-chapter-1' as NovelAssetDocument['id'],
    projectRelativePath: 'planning/chapter-outline-1.md',
    revisionId: 'revision-outline-1' as NovelAssetDocument['revisionId'],
    contentHash: `sha256:${'d'.repeat(64)}`,
    title: '第一章 · 章纲',
    content: { kind: 'chapter-outline', body: '' },
    ...overrides,
  }
}

function selection(overrides: Partial<NovelSelectionDescriptor> = {}): NovelSelectionDescriptor {
  return {
    version: 1,
    id: 'selection-1' as NovelSelectionDescriptor['id'],
    projectId: 'project-1' as NovelSelectionDescriptor['projectId'],
    assetId: 'asset-chapter-1' as NovelSelectionDescriptor['assetId'],
    revisionId: 'revision-2' as NovelSelectionDescriptor['revisionId'],
    selector: {
      kind: 'text-range', startUtf16: 0, endUtf16: 2,
      quoteHash: `sha256:${'b'.repeat(64)}`,
    },
    preview: '新句',
    mention: 'dsh-novel:eyJ2IjoxfQ',
    ...overrides,
  }
}

function analysisReport(kind: NovelAnalysisReportDescriptor['kind']): NovelAnalysisReportDescriptor {
  return {
    projectId: 'project-1' as never,
    assetId: 'asset-chapter-1' as never,
    revisionId: 'revision-1' as never,
    kind,
    analyzerVersion: kind === 'noai-scan' ? 'noai-rules/1' : 'chapter-review/1',
    generatedAt: '2026-08-25T08:00:00.000Z',
    data: kind === 'noai-scan'
      ? { version: 1, characterCount: 800, sampleLevel: 'usable', riskScore: 56,
        counts: { high: 1, medium: 0, low: 0 }, findings: [{ ruleId: 'not-but', label: '否定转折模板',
          severity: 'high', startUtf16: 0, endUtf16: 4, evidence: '不是…而是', advice: '直接写结果。' }] }
      : { version: 1, sampleLevel: 'usable', overallScore: 72, verdict: '推进清楚，但章末钩子偏弱。',
        dimensions: [{ id: 'hook', score: 58, summary: '新期待不足。' }],
        findings: [{ severity: 'medium', category: '章末钩子', quote: '他回家了。',
          diagnosis: '局面闭合。', suggestion: '追加真实的新行动。' }], priorities: ['先强化章末局面变化。'] },
  }
}

function finalization(): NovelRevisionFinalizationDescriptor {
  return {
    projectId: 'project-1' as never,
    assetId: 'asset-chapter-1' as never,
    revisionId: 'revision-1' as never,
    finalizedAt: '2026-08-26T08:00:00.000Z',
    finalizedBySessionId: SID,
    sourceRevisionId: 'revision-agent-1' as never,
    sourceChangeSetId: 'changeset-agent-1' as never,
    sourceSessionId: SID,
  }
}

function preference(status: NovelPreferenceCandidateDescriptor['status'] = 'pending'): NovelPreferenceCandidateDescriptor {
  return {
    id: 'preference-1' as never,
    projectId: 'project-1' as never,
    assetId: 'asset-chapter-1' as never,
    sourceRevisionId: 'revision-agent-1' as never,
    finalRevisionId: 'revision-1' as never,
    targetStyleAssetId: 'style-1' as never,
    targetStyleRevisionId: 'revision-style-1' as never,
    generatedAt: '2026-08-26T08:00:01.000Z',
    summary: '作者偏好用画面承载情绪。',
    guidanceMarkdown: '- 用具体动作和环境承载情绪，减少直接总结。',
    evidence: [{ before: '她很紧张。', after: '她把票根折了两次。', inference: '用动作替代情绪命名。' }],
    status,
  }
}

function storyCandidate(
  status: NovelStoryStateCandidateDescriptor['status'] = 'pending',
): NovelStoryStateCandidateDescriptor {
  return {
    id: 'story-state-candidate-1' as never,
    projectId: 'project-1' as never,
    assetId: 'asset-chapter-1' as never,
    finalRevisionId: 'revision-1' as never,
    targetStoryStateAssetId: 'story-state-1' as never,
    targetStoryStateRevisionId: 'revision-story-state-1' as never,
    generatedAt: '2026-08-26T08:00:02.000Z',
    summary: '林澈已经抵达白港。',
    replacementMarkdown: '# 当前事实\n\n- 林澈已经抵达白港。',
    evidence: [{ quote: '林澈抵达白港', update: '当前位置更新为白港' }],
    status,
  }
}

function changeSet(status: NovelChangeSetDescriptor['status'] = 'proposed'): NovelChangeSetDescriptor {
  return {
    id: 'changeset-1' as NovelChangeSetDescriptor['id'],
    projectId: 'project-1' as NovelChangeSetDescriptor['projectId'],
    assetId: 'asset-chapter-1' as NovelChangeSetDescriptor['assetId'],
    baseRevisionId: 'revision-1' as NovelChangeSetDescriptor['baseRevisionId'],
    summary: '让句子更克制',
    assetType: 'manuscript.chapter',
    status,
    operations: [{
      kind: 'replace-text',
      selector: {
        kind: 'text-range', startUtf16: 0, endUtf16: 2,
        quoteHash: `sha256:${'c'.repeat(64)}`,
      },
      replacement: '新句',
    }],
  }
}

function settled(meta: unknown = { kind: 'novel-change-set', changeSetId: 'changeset-1' }): ToolResultNode {
  return {
    kind: 'tool-result', seq: 1, time: 2, callId: 'call-1', callTime: 1,
    call: { name: 'novel_propose_changes', argsRaw: '{}' },
    content: [{ type: 'text', text: 'Proposal created.' }],
    isError: false, callView: null, resultView: null, subCalls: [], meta,
  }
}

describe('NovelFrame', () => {
  it('renders the elected Novel explorer and canvas inside the shipped shell', () => {
    const workbench = new NovelWorkbenchViewController()
    const calls: string[] = []
    const setAgentWidth = vi.fn()
    const renderSlot = ((name: string) => {
      calls.push(name)
      return <span data-testid={name}>surface</span>
    }) as never
    const view = render(<div data-workbench="novel">
      <NovelFrame
        renderSlot={renderSlot} t={t} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
        matched={{ id: 'novel' }} id="novel" agentWidth={410}
        workbench={workbench} setAgentWidth={setAgentWidth}
      />
    </div>)

    expect(view.container.querySelector('[data-novel-workbench]')).not.toBeNull()
    expect(view.getByLabelText(zh.assetSidebar)).toBeTruthy()
    const resizer = view.getByRole('separator', { name: zh.resizePanels })
    expect(resizer.getAttribute('aria-valuenow')).toBe('410')
    expect(calls).toEqual(['novel.explorer', 'novel.canvas'])

    fireEvent.click(view.getByRole('button', { name: zh.collapseExplorer }))
    expect(workbench.getSnapshot().explorerCollapsed).toBe(true)
    fireEvent.click(view.getByRole('button', { name: zh.expandExplorer }))
    expect(workbench.getSnapshot().explorerCollapsed).toBe(false)

    fireEvent.keyDown(resizer, { key: 'ArrowRight' })
    expect(setAgentWidth).toHaveBeenLastCalledWith(426)
    fireEvent.doubleClick(resizer)
    expect(setAgentWidth).toHaveBeenLastCalledWith(410)

    let scheduled: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => { scheduled = undefined })
    Object.assign(resizer, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    })
    setAgentWidth.mockClear()
    const host = view.container.querySelector<HTMLElement>('[data-workbench]')!
    fireEvent.pointerDown(resizer, { pointerId: 7, clientX: 400 })
    fireEvent.pointerMove(resizer, { pointerId: 7, clientX: 450 })
    expect(setAgentWidth).not.toHaveBeenCalled()
    act(() => { scheduled?.(0) })
    expect(host.style.getPropertyValue('--dsh-workbench-agent-width')).toBe('460px')
    expect(host.hasAttribute('data-workbench-resizing')).toBe(true)
    fireEvent.pointerUp(resizer, { pointerId: 7, clientX: 450 })
    expect(setAgentWidth).toHaveBeenCalledOnce()
    expect(setAgentWidth).toHaveBeenLastCalledWith(460)
    expect(host.hasAttribute('data-workbench-resizing')).toBe(false)
  })
})

describe('preset-scoped workbench activation', () => {
  it('shows the Composer toggle only for novel-workbench and applies typed Agent presentation metadata', () => {
    const layout = new LayoutController()
    const presetSelection = createSnapshotStore({ current: 'novel-workbench' })
    const sessionKit = {
      useSession: vi.fn() as never,
      useProjection: vi.fn() as never,
      useInput: vi.fn() as never,
      inputActions: {} as never,
    }
    const eligible = render(<WorkbenchToggle
      {...sessionKit}
      sessionId={SID} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      session={{ blank: false, nodes: [{}] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    const compactToggle = eligible.getByRole('button', { name: zh.openWorkbench })
    expect(compactToggle.textContent).toBe('')
    fireEvent.click(compactToggle)
    expect(layout.workbench.getSnapshot().id).toBe('novel')
    expect(eligible.getByRole('button', { name: zh.closeWorkbench }).getAttribute('aria-pressed')).toBe('true')

    const staleSeatSessions = <T,>(select: (state: SessionListState) => T): T => select({
      ids: [SID],
      byId: { [SID]: { id: SID, displayTitle: 'Novel', agentPreset: 'novel-workbench', running: false, blank: false, updatedAt: 1 } },
      current: SID, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    eligible.rerender(<WorkbenchToggle
      {...sessionKit}
      sessionId={'stale-composer-seat' as SessionId} useSessions={staleSeatSessions} useWorkspaces={vi.fn() as never}
      session={{ blank: false, nodes: [{}] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    expect(eligible.queryByRole('button')).toBeNull()

    eligible.rerender(<WorkbenchToggle
      {...sessionKit}
      sessionId={'blank-composer-seat' as SessionId} useSessions={staleSeatSessions} useWorkspaces={vi.fn() as never}
      session={{ blank: true, nodes: [] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    expect(eligible.getByRole('button', { name: zh.closeWorkbench })).toBeTruthy()

    const reusedHeroSessions = <T,>(select: (state: SessionListState) => T): T => select({
      ids: [SID],
      byId: { [SID]: { id: SID, displayTitle: 'Reused', running: false, blank: false, updatedAt: 1 } },
      current: SID, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    eligible.rerender(<WorkbenchToggle
      {...sessionKit}
      sessionId={SID} useSessions={reusedHeroSessions} useWorkspaces={vi.fn() as never}
      session={{ blank: false, nodes: [] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    expect(eligible.getByRole('button', { name: zh.closeWorkbench })).toBeTruthy()

    const noSessionYet = <T,>(select: (state: SessionListState) => T): T => select({
      ids: [], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    eligible.rerender(<WorkbenchToggle
      {...sessionKit}
      sessionId={'new-session-composer' as SessionId} useSessions={noSessionYet} useWorkspaces={vi.fn() as never}
      session={{ blank: false, nodes: [{}] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    expect(eligible.getByRole('button', { name: zh.closeWorkbench })).toBeTruthy()

    // Cold restoration can hydrate the authoritative list row as blank before
    // the conversation snapshot catches up. The staged default still governs
    // this not-yet-started Session, so the entry must remain available.
    const restoredBlankSessions = <T,>(select: (state: SessionListState) => T): T => select({
      ids: [SID],
      byId: { [SID]: { id: SID, displayTitle: 'Blank', running: false, blank: true, updatedAt: 1 } },
      current: SID, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    eligible.rerender(<WorkbenchToggle
      {...sessionKit}
      sessionId={SID} useSessions={restoredBlankSessions} useWorkspaces={vi.fn() as never}
      session={{ blank: false, nodes: [{}] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    expect(eligible.getByRole('button', { name: zh.closeWorkbench })).toBeTruthy()

    act(() => { presetSelection.set({ current: 'standard' }) })
    expect(eligible.queryByRole('button')).toBeNull()
    expect(layout.workbench.getSnapshot().id).toBeNull()

    const standardSessions = <T,>(select: (state: SessionListState) => T): T => select({
      ids: [SID],
      byId: { [SID]: { id: SID, displayTitle: 'Standard', agentPreset: 'standard', running: false, blank: false, updatedAt: 1 } },
      current: SID, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    eligible.rerender(<WorkbenchToggle
      {...sessionKit}
      sessionId={SID} useSessions={standardSessions} useWorkspaces={vi.fn() as never}
      session={{ blank: false, nodes: [{}] } as never} input={{} as never}
      useWorkbench={hookOf(layout.workbench)}
      useAgentPresetSelection={hookOf(presetSelection)}
      toggleWorkbench={() => { layout.toggleWorkbench('novel', 'novel-workbench') }} t={t}
    />)
    expect(eligible.queryByRole('button')).toBeNull()

    eligible.unmount()
    act(() => { layout.closeWorkbench() })
    render(<NovelPresentationCard
      {...sessionKit}
      block={settled({ kind: 'novel-presentation', intent: 'open-workbench' })}
      callId="call-1" toolName="novel_present" sessionId={SID}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      present={(intent) => {
        if (intent === 'open-workbench') layout.openWorkbench('novel', 'novel-workbench')
        else layout.closeWorkbench()
      }}
      t={t} openFile={vi.fn()} cwd="/story"
    />)
    expect(layout.workbench.getSnapshot().id).toBe('novel')
  })
})

describe('Canvas', () => {
  it('turns an uninitialized folder into a ready Novel Project from one quiet empty state', async () => {
    const store = createNovelWorkbenchStore().create()
    act(() => { store.actions.uninitialized() })
    const initialized = {
      schema: 1 as const, id: 'project-new' as never, title: '国运擂台', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml',
      contentRootDisplayPaths: { manuscript: '/story/manuscript', planning: '/story/planning' },
    }
    const initialize = vi.fn(async () => initialized)
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      initialize={initialize}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)

    expect(view.getByRole('heading', { name: zh.initializeProjectTitle })).toBeTruthy()
    expect(view.queryByRole('alert')).toBeNull()
    fireEvent.change(view.getByLabelText(zh.projectTitleLabel), { target: { value: '国运擂台' } })
    fireEvent.click(view.getByRole('button', { name: zh.initializeProject }))

    await waitFor(() => { expect(initialize).toHaveBeenCalledWith(SID, '国运擂台') })
    await waitFor(() => { expect(store.getSnapshot()).toMatchObject({
      projectStatus: 'ready', project: { id: 'project-new', title: '国运擂台' }, reload: 1,
    }) })
  })

  it('flushes a dirty draft before freezing and mentioning its exact Revision', async () => {
    const store = createNovelWorkbenchStore().create()
    act(() => {
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '新句继续。' })
      store.actions.select({ kind: 'text-range', startUtf16: 0, endUtf16: 2 })
    })
    const saved = chapter({
      revisionId: 'revision-2' as NovelAssetDocument['revisionId'],
      content: { kind: 'manuscript', body: '新句继续。' },
    })
    const frozen = selection()
    const order: string[] = []
    const save = vi.fn(async () => { order.push('save'); return saved })
    const capture = vi.fn(async () => { order.push('capture'); return frozen })
    const appendReference = vi.fn(() => { order.push('reference') })

    const view = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never}
      actions={store.actions}
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      save={save}
      capture={capture}
      appendReference={appendReference}
      renderers={renderers}
      t={t}
    />)
    fireEvent.click(view.getByText(zh.reference))

    await waitFor(() => { expect(appendReference).toHaveBeenCalledWith(SID, frozen, '[新句]') })
    expect(order).toEqual(['save', 'capture', 'reference'])
    expect(save).toHaveBeenCalledWith(SID, {
      assetId: saved.id, baseRevisionId: 'revision-1', title: '第一章',
      content: { kind: 'manuscript', body: '新句继续。' },
    })
    expect(capture).toHaveBeenCalledWith(SID, {
      assetId: saved.id, revisionId: saved.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 2 },
    })
    expect(view.getByLabelText(zh.readerSettings)).toBeTruthy()
    expect(view.queryByText('DSH 当前上下文')).toBeNull()
    expect(store.getSnapshot().document?.revisionId).toBe(saved.revisionId)
  })

  it('saves manually and renders the empty canvas without a chapter', async () => {
    const store = createNovelWorkbenchStore().create()
    const empty = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={vi.fn()} appendReference={vi.fn()} t={t}
      renderers={renderers}
    />)
    expect(empty.getByText(zh.noChapter)).toBeTruthy()
    empty.unmount()

    act(() => {
      store.actions.open(chapter())
      store.actions.editTitle('雨夜归人')
      store.actions.edit({ kind: 'manuscript', body: '手动保存' })
      store.actions.select({ kind: 'text-range', startUtf16: 1, endUtf16: 3 })
    })
    const save = vi.fn(async () => chapter({
      title: '雨夜归人',
      content: { kind: 'manuscript', body: '手动保存' },
      revisionId: 'revision-2' as NovelAssetDocument['revisionId'],
    }))
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={save} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)
    expect((view.getByLabelText(zh.chapterTitle) as HTMLInputElement).value).toBe('雨夜归人')
    fireEvent.click(view.getByText(zh.save))
    await waitFor(() => { expect(save).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(view.getByText(zh.saved)).toBeTruthy() })
    expect(store.getSnapshot()).toMatchObject({
      dirty: false,
      selection: { kind: 'text-range', startUtf16: 1, endUtf16: 3 },
      document: { revisionId: 'revision-2' },
      titleDraft: '雨夜归人',
    })
    expect(save).toHaveBeenCalledWith(SID, expect.objectContaining({ title: '雨夜归人' }))
    expect((view.getByText(zh.reference).closest('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('surfaces save failures and never captures a dirty selection against an old Revision', async () => {
    const store = createNovelWorkbenchStore().create()
    act(() => {
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '尚未保存的新正文' })
      store.actions.select({ kind: 'text-range', startUtf16: 0, endUtf16: 4 })
    })
    const capture = vi.fn()
    const appendReference = vi.fn()
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={async () => { throw new Error('workspace write denied') }} capture={capture} appendReference={appendReference}
      renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByText(zh.reference))

    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('workspace write denied') })
    expect(capture).not.toHaveBeenCalled()
    expect(appendReference).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({
      dirty: true,
      selection: { kind: 'text-range', startUtf16: 0, endUtf16: 4 },
    })
  })

  it('keeps clean selections exact, handles editor events, and ignores incomplete context', async () => {
    const store = createNovelWorkbenchStore().create()
    const { preview: _preview, ...selectionWithoutPreview } = selection()
    const capture = vi.fn(async () => selectionWithoutPreview)
    const appendReference = vi.fn()
    const save = vi.fn()
    act(() => {
      store.actions.open(chapter())
      store.actions.select({ kind: 'text-range', startUtf16: 0, endUtf16: 2 })
    })
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={save} capture={capture} appendReference={appendReference} renderers={renderers} t={t}
    />)
    fireEvent.click(view.getByText(zh.reference))
    await waitFor(() => { expect(capture).toHaveBeenCalledWith(SID, expect.objectContaining({ revisionId: 'revision-1' })) })
    await waitFor(() => { expect(appendReference).toHaveBeenCalledWith(SID, selectionWithoutPreview, '[第一章]') })
    const textarea = view.getByLabelText(/第一章/u)
    fireEvent.change(textarea, { target: { value: '键盘编辑' } })
    fireEvent.change(textarea, { target: { value: '键盘编辑继续' } })
    Object.defineProperties(textarea, { selectionStart: { value: 1, configurable: true }, selectionEnd: { value: 3, configurable: true } })
    fireEvent.select(textarea)
    expect(store.getSnapshot()).toMatchObject({
      draft: { kind: 'manuscript', body: '键盘编辑继续' },
      dirty: true,
      selection: { kind: 'text-range', startUtf16: 1, endUtf16: 3 },
    })
    expect(save).not.toHaveBeenCalled()
    expect(store.getSnapshot().document?.revisionId).toBe('revision-1')
    view.unmount()

    const noSession = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions}
      useSessions={((select: (state: SessionListState) => unknown) => select({
        ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      })) as never}
      useWorkspaces={vi.fn() as never} save={vi.fn()} capture={vi.fn()} appendReference={vi.fn()}
      renderers={renderers} t={t}
    />)
    fireEvent.click(noSession.getByText(zh.save))
    fireEvent.click(noSession.getByText(zh.reference))
  })

  it('presents reader skin and typography popovers with Unicode-safe short references', () => {
    const store = createNovelWorkbenchStore().create()
    act(() => { store.actions.open(chapter()) })
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByRole('button', { name: zh.skinSettings }))
    expect(view.getByRole('dialog', { name: zh.chooseSkin })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: zh.green }))
    fireEvent.click(view.getByRole('button', { name: zh.typography }))
    expect(view.getByRole('dialog', { name: zh.typography })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: zh.fontKai }))
    fireEvent.click(view.getByRole('button', { name: zh.increaseFont }))
    expect(store.getSnapshot()).toMatchObject({ readerFont: 'kai', readerFontSize: 19, readerSkin: 'green' })
    expect(view.container.querySelector('[data-reader-skin="green"][data-reader-font="kai"]')).not.toBeNull()
    expect(shortReferenceLabel('一二三四五六七八九十十一十二')).toBe('[一二三四五六七八九十…]')
    expect(shortReferenceLabel('😀 一\n二')).toBe('[😀 一 二]')
  })

  it('creates a chapter-bound freeform plan from the manuscript bar and references it to the Agent', async () => {
    const store = createNovelWorkbenchStore().create()
    const document = chapter()
    act(() => {
      store.actions.loaded({ title: '白港' } as never, [{ ...document, content: undefined }] as never)
      store.actions.open(document)
    })
    const created = chapterOutline({ content: { kind: 'chapter-outline', body: '## 情绪目标\n\n悬念感。' } })
    const saved = chapterOutline({ revisionId: 'revision-outline-2' as never })
    const frozen = selection({ assetId: created.id, revisionId: saved.revisionId, preview: '情绪目标' })
    const create = vi.fn(async (_sessionId: SessionId, _request: CreateNovelAssetRequest) => created)
    const save = vi.fn(async () => saved)
    const capture = vi.fn(async () => frozen)
    const appendReference = vi.fn()
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      open={vi.fn(async () => created)} create={create} save={save} capture={capture} appendReference={appendReference}
      renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByRole('button', { name: zh.chapterOutline }))
    const dialog = view.getByRole('dialog', { name: zh.chapterOutline })
    fireEvent.click(within(dialog).getByText(`＋ ${zh.insertChapterOutlineTemplate}`))
    const editor = within(dialog).getByLabelText(zh.chapterOutlineBody) as HTMLTextAreaElement
    expect(editor.value).toContain('## 情绪目标')
    fireEvent.click(within(dialog).getByText(zh.save))
    await waitFor(() => { expect(create).toHaveBeenCalledTimes(1) })
    const [, request] = create.mock.calls[0]!
    expect(request.type).toBe('planning.chapter-outline')
    expect(request.parentId).toBe(document.id)
    expect(request.content).toMatchObject({ kind: 'chapter-outline' })
    expect((request.content as { body: string }).body).toContain('## 情绪目标')
    expect(store.getSnapshot().assets).toContainEqual(expect.objectContaining({ id: created.id, parentId: document.id }))

    const selectedStart = editor.value.indexOf('情绪目标')
    Object.defineProperties(editor, {
      selectionStart: { configurable: true, value: selectedStart },
      selectionEnd: { configurable: true, value: selectedStart + 4 },
    })
    fireEvent.select(editor)
    fireEvent.click(within(dialog).getByText(zh.reference))
    await waitFor(() => { expect(save).toHaveBeenCalled() })
    await waitFor(() => { expect(capture).toHaveBeenCalledWith(SID, expect.objectContaining({ assetId: created.id })) })
    expect(appendReference).toHaveBeenCalledWith(SID, frozen, '[情绪目标]')
  })

  it('compares and restores a historical Revision as a new current head', async () => {
    const store = createNovelWorkbenchStore().create()
    const current = chapter({ revisionId: 'revision-2' as never, content: { kind: 'manuscript', body: '当前正文' } })
    const historical = chapter({ revisionId: 'revision-1' as never, content: { kind: 'manuscript', body: '历史正文' } })
    act(() => {
      store.actions.loaded({ title: '白港' } as never, [{ ...current, content: undefined }] as never)
      store.actions.open(current)
    })
    const open = vi.fn(async (_sessionId: SessionId, _assetId: string, revisionId?: string) => (
      revisionId === historical.revisionId ? historical : current
    ))
    const restored = chapter({ revisionId: 'revision-3' as never, content: historical.content })
    let didRestore = false
    const revisions = vi.fn(async () => [
      ...(didRestore ? [{ id: restored.revisionId, projectId: restored.projectId, assetId: restored.id,
        contentHash: restored.contentHash, origin: 'user-edit' as const, createdAt: '2026-08-25T10:00:00.000Z',
        parentRevisionId: current.revisionId, restoredFromRevisionId: historical.revisionId,
        restoredBySessionId: SID }] : []),
      { id: current.revisionId, projectId: current.projectId, assetId: current.id, contentHash: current.contentHash,
        origin: 'user-edit' as const, createdAt: '2026-08-25T09:00:00.000Z', parentRevisionId: historical.revisionId },
      { id: historical.revisionId, projectId: historical.projectId, assetId: historical.id, contentHash: historical.contentHash,
        origin: 'initial-scan' as const, createdAt: '2026-08-25T08:00:00.000Z' },
    ])
    const restore = vi.fn(async () => {
      didRestore = true
      return { document: restored, conflictedChangeSetCount: 2, storyStateReviewRecommended: true }
    })
    const save = vi.fn()
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      revisions={revisions} restore={restore} open={open} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={save} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)

    await waitFor(() => { expect(view.getByLabelText(zh.revisionHistory)).toBeTruthy() })
    fireEvent.change(view.getByLabelText(zh.revisionHistory), { target: { value: historical.revisionId } })
    await waitFor(() => { expect((view.getByLabelText(/第一章/u) as HTMLTextAreaElement).value).toBe('历史正文') })
    expect((view.getByLabelText(/第一章/u) as HTMLTextAreaElement).readOnly).toBe(true)
    expect((view.getByLabelText(zh.chapterTitle) as HTMLInputElement).readOnly).toBe(true)
    expect(view.getByText(zh.historicalReadOnly)).toBeTruthy()
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole('button', { name: zh.restoreRevision }))
    const dialog = await view.findByRole('dialog', { name: zh.restoreTitle })
    expect(within(dialog).getByLabelText(`${zh.restoreCurrentVersion} · 第一章`))
      .toHaveProperty('value', '当前正文')
    expect(within(dialog).getByLabelText(`${zh.restoreSelectedVersion} · 第一章`))
      .toHaveProperty('value', '历史正文')
    expect(restore).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: zh.confirmRestore }))
    await waitFor(() => { expect(restore).toHaveBeenCalledWith(SID, {
      assetId: current.id, baseRevisionId: current.revisionId, sourceRevisionId: historical.revisionId,
    }) })
    await waitFor(() => { expect((view.getByLabelText(/第一章/u) as HTMLTextAreaElement).value).toBe('历史正文') })
    expect((view.getByLabelText(/第一章/u) as HTMLTextAreaElement).readOnly).toBe(false)
    expect(view.getByRole('status').textContent).toContain(zh.restoreComplete)
    expect(view.getByRole('status').textContent).toContain(`${zh.restoreConflictedChangeSets} 2`)
    expect(view.getByRole('status').textContent).toContain(zh.restoreStoryStateWarning)
    await waitFor(() => { expect(view.getByLabelText(zh.revisionHistory).textContent).toContain(zh.revisionRestored) })
  })

  it('flushes dirty prose before Revision-bound NOAI and review reports', async () => {
    const store = createNovelWorkbenchStore().create()
    const current = chapter()
    act(() => {
      store.actions.loaded({ title: '白港' } as never, [{ ...current, content: undefined }] as never)
      store.actions.open(current)
      store.actions.edit({ kind: 'manuscript', body: '不是普通变化，而是真正改变命运。' })
    })
    const saved = chapter({ revisionId: 'revision-2' as never, content: { kind: 'manuscript', body: '不是普通变化，而是真正改变命运。' } })
    const save = vi.fn(async () => saved)
    const scanNoAi = vi.fn(async () => ({ ...analysisReport('noai-scan'), revisionId: saved.revisionId }))
    const reviewChapter = vi.fn(async () => ({ ...analysisReport('chapter-review'), revisionId: saved.revisionId }))
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      revisions={async () => [{ id: saved.revisionId, projectId: saved.projectId, assetId: saved.id,
        contentHash: saved.contentHash, origin: 'user-edit', createdAt: '2026-08-25T09:00:00.000Z' }]}
      analysisReports={async () => []} scanNoAi={scanNoAi} reviewChapter={reviewChapter}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={save} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByRole('button', { name: zh.noAiScan }))
    await waitFor(() => { expect(scanNoAi).toHaveBeenCalledWith(SID, saved.id, saved.revisionId) })
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(scanNoAi.mock.invocationCallOrder[0]!)
    const noAi = view.getByRole('dialog', { name: zh.noAiScan })
    expect(within(noAi).getByText('56')).toBeTruthy()
    expect(within(noAi).getByText('否定转折模板')).toBeTruthy()
    fireEvent.click(within(noAi).getByText(`${zh.collapseChapterOutline} ›`))

    fireEvent.click(view.getByRole('button', { name: zh.chapterReview }))
    const review = view.getByRole('dialog', { name: zh.chapterReview })
    expect(reviewChapter).not.toHaveBeenCalled()
    fireEvent.click(within(review).getByRole('button', { name: zh.startReview }))
    await waitFor(() => { expect(reviewChapter).toHaveBeenCalledWith(SID, saved.id, saved.revisionId) })
    expect(within(review).getByText('72')).toBeTruthy()
    expect(within(review).getByText('推进清楚，但章末钩子偏弱。')).toBeTruthy()
  })

  it('opens an existing Revision review without starting a replacement run', async () => {
    const store = createNovelWorkbenchStore().create()
    const current = chapter()
    act(() => {
      store.actions.loaded({ title: '白港' } as never, [{ ...current, content: undefined }] as never)
      store.actions.open(current)
    })
    const reviewChapter = vi.fn(async () => analysisReport('chapter-review'))
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      analysisReports={async () => [analysisReport('chapter-review')]}
      reviewChapter={reviewChapter}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByRole('button', { name: zh.chapterReview }))
    const review = await view.findByRole('dialog', { name: zh.chapterReview })
    await waitFor(() => { expect(within(review).getByText('72')).toBeTruthy() })
    expect(reviewChapter).not.toHaveBeenCalled()
  })

  it('marks the exact Revision final and keeps preference and Story State candidates inert', async () => {
    const store = createNovelWorkbenchStore().create()
    const current = chapter()
    act(() => {
      store.actions.loaded({ title: '白港' } as never, [{ ...current, content: undefined }] as never)
      store.actions.open(current)
    })
    const finalizeChapter = vi.fn(async () => ({
      finalization: finalization(), candidate: preference(), storyCandidate: storyCandidate(),
    }))
    const acceptPreference = vi.fn(async () => preference('accepted'))
    const rejectPreference = vi.fn(async () => preference('rejected'))
    const acceptStoryState = vi.fn(async () => storyCandidate('accepted'))
    const rejectStoryState = vi.fn(async () => storyCandidate('rejected'))
    const view = render(<Canvas
      {...canvasAnalysisStubs}
      finalizations={async () => []}
      preferenceCandidates={async () => []}
      storyStateCandidates={async () => []}
      finalizeChapter={finalizeChapter}
      acceptPreference={acceptPreference}
      rejectPreference={rejectPreference}
      acceptStoryState={acceptStoryState}
      rejectStoryState={rejectStoryState}
      open={openStub} create={createStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={vi.fn()} appendReference={vi.fn()} renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByRole('button', { name: zh.markFinal }))
    await waitFor(() => {
      expect(finalizeChapter).toHaveBeenCalledWith(SID, current.id, current.revisionId)
    })
    const drawer = await view.findByRole('dialog', { name: zh.preferenceLearning })
    expect(within(drawer).getByText('作者偏好用画面承载情绪。')).toBeTruthy()
    expect(within(drawer).getByText('她很紧张。')).toBeTruthy()
    expect(within(drawer).getByText('她把票根折了两次。')).toBeTruthy()
    expect(within(drawer).getByText('林澈已经抵达白港。')).toBeTruthy()
    expect(within(drawer).getByText('当前位置更新为白港')).toBeTruthy()
    expect(acceptPreference).not.toHaveBeenCalled()

    fireEvent.click(within(drawer).getByRole('button', { name: zh.acceptPreference }))
    await waitFor(() => { expect(acceptPreference).toHaveBeenCalledWith(SID, 'preference-1') })
    await waitFor(() => { expect(within(drawer).getByText(zh.preferenceAccepted)).toBeTruthy() })
    expect(within(drawer).queryByRole('button', { name: zh.acceptPreference })).toBeNull()
    expect(rejectPreference).not.toHaveBeenCalled()

    fireEvent.click(within(drawer).getByRole('button', { name: zh.acceptStoryState }))
    await waitFor(() => { expect(acceptStoryState).toHaveBeenCalledWith(SID, 'story-state-candidate-1') })
    await waitFor(() => { expect(within(drawer).getAllByText(zh.preferenceAccepted)).toHaveLength(2) })
    expect(rejectStoryState).not.toHaveBeenCalled()
  })
})

describe('ContextTray', () => {
  const project = {
    schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
    manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
  } as never

  function statusHook(status: 'loading' | 'uninitialized' | 'ready' | 'error' = 'ready') {
    const controller = new NovelProjectStatusController()
    act(() => { controller.set({ sessionId: SID, status }) })
    return hookOf(controller) as never
  }

  it('shows compact human labels while keeping coordinates out of visible tray text', () => {
    expect(humanContextLabel('第一章 觉醒老爷爷')).toBe('第一章：觉醒老爷爷')
    expect(humanContextLabel('白港 · 全书大纲')).toBe('白港 · 全书大纲')
  })

  it('shows a neutral project hint and performs no context RPC before initialization', () => {
    const search = vi.fn()
    const replace = vi.fn()
    const view = render(<ContextTray
      session={{} as never} input={{} as never} sessionId={SID}
      useSessions={useSessions as never} useProjection={() => null}
      useContextFocus={hookOf(new NovelContextFocusController()) as never}
      useProjectStatus={statusHook('uninitialized')}
      search={search} replace={replace} t={t}
      useSession={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      useWorkspaces={vi.fn() as never}
    />)
    expect(view.getByText(zh.contextProjectUninitialized)).toBeTruthy()
    expect(view.queryByText(`＋ ${zh.searchContext}`)).toBeNull()
    expect(search).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('is preset-scoped and replaces live follow plus exact searched pinned worksets', async () => {
    const focus = new NovelContextFocusController()
    act(() => { focus.set({ sessionId: SID, project, document: chapter(), dirty: false }) })
    const replace = vi.fn(async (workset: NovelContextWorksetDescriptor) => workset)
    const result: NovelAssetSearchResult = {
      id: 'asset-outline-1' as never, projectId: 'project-1' as never, type: 'planning.outline',
      projectRelativePath: 'planning/main.md', revisionId: 'revision-outline-1' as never,
      contentHash: `sha256:${'c'.repeat(64)}`, title: '全书大纲', excerpt: '主角抵达白港。', score: 500,
    }
    const search = vi.fn(async () => [result])
    const view = render(<ContextTray
      session={{} as never} input={{} as never}
      sessionId={SID} useSessions={useSessions as never} useProjection={() => null}
      useContextFocus={hookOf(focus) as never} useProjectStatus={statusHook()} search={search} replace={replace} t={t}
      useSession={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      useWorkspaces={vi.fn() as never}
    />)

    await waitFor(() => { expect(replace).toHaveBeenCalledWith({
      version: 2, projectId: 'project-1', items: [{
        projectId: 'project-1', assetId: 'asset-chapter-1',
        label: '第一章', mode: 'follow', origin: 'active-asset',
      }],
    }) })
    fireEvent.click(view.getByText(`＋ ${zh.searchContext}`))
    fireEvent.change(view.getByPlaceholderText(zh.searchContextPlaceholder), { target: { value: '白港' } })
    fireEvent.click(view.getByText(zh.search))
    await waitFor(() => { expect(view.getByText('全书大纲')).toBeTruthy() })
    fireEvent.click(view.getByText('全书大纲'))
    await waitFor(() => { expect(replace).toHaveBeenCalledWith({
      version: 2, projectId: 'project-1', items: [{
        projectId: 'project-1', assetId: 'asset-chapter-1',
        label: '第一章', mode: 'follow', origin: 'active-asset',
      }, {
        projectId: 'project-1', assetId: 'asset-outline-1', revisionId: 'revision-outline-1',
        label: '全书大纲', mode: 'pinned', origin: 'search',
      }],
    }) })
    expect(search).toHaveBeenCalledWith({ query: '白港', limit: 8 })

    view.unmount()
    const hidden = render(<ContextTray
      session={{} as never} input={{} as never}
      sessionId={SID}
      useSessions={((select: (state: SessionListState) => unknown) => select({
        ids: [SID], byId: { [SID]: { id: SID, agentPreset: 'code' } }, current: SID,
        phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      } as never)) as never}
      useProjection={() => null} useContextFocus={hookOf(focus) as never} useProjectStatus={statusHook()}
      search={search} replace={replace} t={t} useSession={vi.fn() as never}
      useInput={vi.fn() as never} inputActions={{} as never} useWorkspaces={vi.fn() as never}
    />)
    expect(hidden.container.innerHTML).toBe('')
  })

  it('retains the last saved Revision while the active editor is dirty', () => {
    const focus = new NovelContextFocusController()
    act(() => { focus.set({ sessionId: SID, project, document: chapter(), dirty: true }) })
    const workset: NovelContextWorksetDescriptor = {
      version: 2, projectId: 'project-1' as never, items: [{
        projectId: 'project-1' as never, assetId: 'asset-chapter-1' as never,
        label: '第一章', mode: 'follow', origin: 'active-asset',
      }],
    }
    const replace = vi.fn(async (value: NovelContextWorksetDescriptor) => value)
    const view = render(<ContextTray
      session={{} as never} input={{} as never}
      sessionId={SID} useSessions={useSessions as never} useProjection={() => workset}
      useContextFocus={hookOf(focus) as never} useProjectStatus={statusHook()} search={vi.fn()} replace={replace} t={t}
      useSession={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      useWorkspaces={vi.fn() as never}
    />)
    expect(view.getAllByText(zh.contextNeedsSave).length).toBeGreaterThan(0)
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('Explorer', () => {
  function sessionHook(current: SessionId | undefined) {
    return function useCurrent<T>(select: (state: SessionListState) => T): T {
      return select({
        ids: current === undefined ? [] : [current], byId: {}, current, phase: 'ready',
        subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      })
    }
  }

  it('loads a project, preserves the active chapter across refresh, and opens another chapter', async () => {
    const store = createNovelWorkbenchStore().create()
    const first = chapter()
    const second = chapter({ id: 'asset-chapter-2' as never, title: '第二章', projectRelativePath: 'manuscript/chapter-2.md' })
    const assets = [
      { ...first, content: undefined },
      { ...second, content: undefined },
    ] as never
    const project = {
      schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
    } as never
    const load = vi.fn(async () => ({ project, assets }))
    const open = vi.fn(async (_sid: SessionId, id: string) => id === first.id ? first : second)
    let refresh: (() => void) | undefined
    const onRefresh = vi.fn((listener: () => void) => { refresh = listener; return () => { refresh = undefined } })
    const view = render(<Explorer
      create={createStub} reorder={reorderStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers} load={load} open={open} onRefresh={onRefresh} t={t}
    />)
    await waitFor(() => { expect(view.getByText('第一章')).toBeTruthy() })
    await waitFor(() => { expect(store.getSnapshot().document?.id).toBe(first.id) })
    expect(view.getByText(zh.chapters).parentElement?.textContent).toContain('2 章')
    expect(view.getByText(zh.outline).parentElement?.textContent).toContain('0 项')
    fireEvent.click(view.getByText('第二章'))
    await waitFor(() => { expect(store.getSnapshot().document?.id).toBe(second.id) })
    await waitFor(() => { expect(view.getByText('第二章').closest('button')?.getAttribute('data-active')).toBe('true') })
    act(() => { refresh?.() })
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
    await waitFor(() => { expect(open).toHaveBeenLastCalledWith(SID, second.id) })
    expect(view.getByText('第二章').closest('button')?.getAttribute('data-active')).toBe('true')
  })

  it('creates a blank chapter from the manuscript group and opens it for editing', async () => {
    const store = createNovelWorkbenchStore().create()
    const created = chapter({
      id: 'asset-new-chapter' as never,
      title: zh.newChapterTitle,
      projectRelativePath: 'manuscript/new-chapter.md',
      content: { kind: 'manuscript', body: '' },
    })
    const create = vi.fn(async () => created)
    const view = render(<Explorer
      reorder={reorderStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers} load={async () => ({ project: { title: '国运擂台' } as never, assets: [] })}
      open={vi.fn()} create={create} onRefresh={() => () => {}} t={t}
    />)

    await waitFor(() => { expect(view.getByText(`＋ ${zh.addChapter}`)).toBeTruthy() })
    fireEvent.click(view.getByText(`＋ ${zh.addChapter}`))
    await waitFor(() => { expect(create).toHaveBeenCalledWith(SID, {
      type: 'manuscript.chapter',
      title: zh.newChapterTitle,
      content: { kind: 'manuscript', body: '' },
    }) })
    expect(store.getSnapshot().document?.id).toBe(created.id)
    expect(view.getByText(zh.newChapterTitle)).toBeTruthy()
  })

  it('reorders chapters from the dragged row and keeps the returned catalog order', async () => {
    const store = createNovelWorkbenchStore().create()
    const first = chapter()
    const second = chapter({
      id: 'asset-chapter-2' as never,
      title: '第二章',
      projectRelativePath: 'manuscript/chapter-2.md',
    })
    const descriptors = [first, second].map(({ content: _content, ...descriptor }) => descriptor)
    const reorder = vi.fn(async (_sid: SessionId, request: { orderedAssetIds: readonly string[] }) =>
      request.orderedAssetIds.map(id => descriptors.find(asset => asset.id === id)!))
    const view = render(<Explorer
      create={createStub} reorder={reorder as never}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers} load={async () => ({ project: { title: '白港' } as never, assets: descriptors })}
      open={async (_sid, id) => id === first.id ? first : second} onRefresh={() => () => {}} t={t}
    />)
    await waitFor(() => { expect(view.getByText('第二章')).toBeTruthy() })
    const dataTransfer = { effectAllowed: 'none', dropEffect: 'none', setData: vi.fn() }
    fireEvent.dragStart(view.getByText('第一章').closest('button')!, { dataTransfer })
    const secondButton = view.getByText('第二章').closest('button')!
    fireEvent.dragOver(secondButton, { dataTransfer })
    await waitFor(() => { expect(secondButton.getAttribute('data-drop-position')).toBe('after') })
    fireEvent.drop(secondButton, { dataTransfer })
    await waitFor(() => { expect(reorder).toHaveBeenCalledWith(SID, {
      type: 'manuscript.chapter',
      orderedAssetIds: [second.id, first.id],
    }) })
    expect(store.getSnapshot().assets.map(asset => asset.id)).toEqual([second.id, first.id])
  })

  it('shows absent-project and load/open failures, including non-Error failures', async () => {
    async function mountWith(load: () => Promise<never> | Promise<{ assets: never[] }>, open = vi.fn()) {
      const store = createNovelWorkbenchStore().create()
      const view = render(<Explorer
        create={createStub} reorder={reorderStub}
        useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
        renderers={renderers} load={load as never} open={open} onRefresh={() => () => {}} t={t}
      />)
      return { store, view }
    }
    const absent = await mountWith(async () => ({ assets: [] }))
    await waitFor(() => { expect(absent.view.getByText(zh.projectNotInitialized)).toBeTruthy() })
    absent.view.unmount()
    const error = await mountWith(async () => { throw new Error('load failed') })
    await waitFor(() => { expect(error.view.getByText('load failed')).toBeTruthy() })
    error.view.unmount()
    const stringError = await mountWith(async () => { throw 'string load failure' })
    await waitFor(() => { expect(stringError.view.getByText('string load failure')).toBeTruthy() })
    stringError.view.unmount()

    const store = createNovelWorkbenchStore().create()
    const descriptor = { ...chapter(), content: undefined } as never
    const openFailure = render(<Explorer
      create={createStub} reorder={reorderStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers}
      load={async () => ({ project: {} as never, assets: [descriptor] })}
      open={async () => { throw new Error('open failed') }} onRefresh={() => () => {}} t={t}
    />)
    await waitFor(() => { expect(openFailure.getByText('第一章')).toBeTruthy() })
    fireEvent.click(openFailure.getByText('第一章'))
    await waitFor(() => { expect(store.getSnapshot().error).toBe('open failed') })
  })

  it('renders the semantic book-to-volume hierarchy and creates a freeform volume outline', async () => {
    const store = createNovelWorkbenchStore().create()
    const manuscript = chapter()
    const { parentId: _chapterParent, ...book } = chapterOutline({
      id: 'outline-book' as never,
      type: 'planning.outline',
      title: '全书大纲',
      projectRelativePath: 'planning/book.md',
      content: { kind: 'outline', level: 'book', body: '自由总纲' },
    })
    const volume = chapterOutline({
      id: 'outline-volume' as never,
      type: 'planning.outline',
      parentId: book.id,
      title: '第一卷卷纲',
      projectRelativePath: 'planning/volume.md',
      content: { kind: 'outline', level: 'volume', body: '自由卷纲' },
    })
    const created = chapterOutline({
      id: 'outline-volume-2' as never,
      type: 'planning.outline',
      parentId: book.id,
      title: '新卷纲',
      projectRelativePath: 'planning/new-volume.md',
      content: { kind: 'outline', level: 'volume', body: '' },
    })
    const descriptors = [manuscript, book, volume].map(({ content: _content, ...descriptor }) => descriptor)
    const create = vi.fn(async () => created)
    const open = vi.fn(async (_sid: SessionId, id: string) => [manuscript, book, volume, created].find(asset => asset.id === id)!)
    const view = render(<Explorer
      reorder={reorderStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers} load={async () => ({ project: { title: '白港' } as never, assets: descriptors })}
      open={open} create={create} onRefresh={() => () => {}} t={t}
    />)
    await waitFor(() => { expect(view.getByText('全书大纲')).toBeTruthy() })
    expect(view.getByText('第一卷卷纲')).toBeTruthy()
    fireEvent.click(view.getByText(`＋ ${zh.addVolumeOutline}`))
    await waitFor(() => { expect(create).toHaveBeenCalledWith(SID, {
      type: 'planning.outline', title: zh.newVolumeOutlineTitle, parentId: book.id,
      content: { kind: 'outline', level: 'volume', body: '' },
    }) })
    expect(store.getSnapshot().document?.id).toBe(created.id)
  })

  it('renders project-level book guidance and lets the author create each singleton Asset', async () => {
    const store = createNovelWorkbenchStore().create()
    const manuscript = chapter()
    const createdBrief = chapter({
      id: 'book-brief' as never,
      type: 'book.brief',
      title: zh.newBookBriefTitle,
      projectRelativePath: 'planning/book-brief.md',
      content: { kind: 'book-brief', body: '' },
    })
    const createdStyle = chapter({
      id: 'book-style' as never,
      type: 'book.style-profile',
      title: zh.newBookStyleProfileTitle,
      projectRelativePath: 'planning/book-style.md',
      content: { kind: 'book-style-profile', body: '' },
    })
    const createdStoryState = chapter({
      id: 'story-state' as never,
      type: 'book.story-state',
      title: zh.newBookStoryStateTitle,
      projectRelativePath: 'planning/story-state.md',
      content: { kind: 'book-story-state', body: '' },
    })
    const create = vi.fn(async (_sid: SessionId, request: CreateNovelAssetRequest) =>
      request.type === 'book.brief' ? createdBrief
        : request.type === 'book.style-profile' ? createdStyle : createdStoryState)
    const view = render(<Explorer
      reorder={reorderStub}
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers}
      load={async () => ({ project: { title: '白港' } as never, assets: [{ ...manuscript, content: undefined }] as never })}
      open={async () => manuscript} create={create} onRefresh={() => () => {}} t={t}
    />)
    await waitFor(() => { expect(view.getByText(zh.bookGuidance)).toBeTruthy() })
    expect(view.getByText(zh.bookGuidance).parentElement?.textContent).toContain('0 项')
    fireEvent.click(view.getByText(`＋ ${zh.addBookBrief}`))
    await waitFor(() => { expect(create).toHaveBeenCalledWith(SID, {
      type: 'book.brief', title: zh.newBookBriefTitle, content: { kind: 'book-brief', body: '' },
    }) })
    expect(view.getByText(zh.newBookBriefTitle)).toBeTruthy()
    fireEvent.click(view.getByText(`＋ ${zh.addBookStyleProfile}`))
    await waitFor(() => { expect(create).toHaveBeenCalledWith(SID, {
      type: 'book.style-profile', title: zh.newBookStyleProfileTitle,
      content: { kind: 'book-style-profile', body: '' },
    }) })
    expect(view.getByText(zh.newBookStyleProfileTitle)).toBeTruthy()
    fireEvent.click(view.getByText(`＋ ${zh.addBookStoryState}`))
    await waitFor(() => { expect(create).toHaveBeenCalledWith(SID, {
      type: 'book.story-state', title: zh.newBookStoryStateTitle,
      content: { kind: 'book-story-state', body: '' },
    }) })
    expect(view.getAllByText(zh.newBookStoryStateTitle)).toHaveLength(2)
    expect(view.getByText(zh.bookGuidance).parentElement?.textContent).toContain('3 项')
  })

  it('cancels late load outcomes and ignores chapter clicks without a Session', async () => {
    let resolveLoad!: (value: { project: never; assets: never[] }) => void
    let rejectLoad!: (reason: unknown) => void
    for (const pending of ['resolve', 'reject'] as const) {
      const store = createNovelWorkbenchStore().create()
      const promise = new Promise<{ project: never; assets: never[] }>((resolve, reject) => {
        resolveLoad = resolve; rejectLoad = reject
      })
      const view = render(<Explorer
        create={createStub} reorder={reorderStub}
        useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
        renderers={renderers} load={() => promise} open={vi.fn()} onRefresh={() => () => {}} t={t}
      />)
      view.unmount()
      if (pending === 'resolve') resolveLoad({ project: {} as never, assets: [] })
      else rejectLoad(new Error('late'))
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      expect(store.getSnapshot().error).toBeUndefined()
    }

    const store = createNovelWorkbenchStore().create()
    act(() => { store.actions.loaded({} as never, [{ ...chapter(), content: undefined }] as never) })
    const open = vi.fn()
    const view = render(<Explorer
      create={createStub} reorder={reorderStub}
      useStore={hookOf(store)} actions={{ ...store.actions, reset: vi.fn() }}
      useSessions={sessionHook(undefined) as never} useWorkspaces={vi.fn() as never}
      renderers={renderers} load={vi.fn()} open={open} onRefresh={() => () => {}} t={t}
    />)
    fireEvent.click(view.getByText('第一章'))
    expect(open).not.toHaveBeenCalled()
  })
})

describe('ChangeSetCard', () => {
  it('shows the proposed diff and applies it only after an explicit decision', async () => {
    const read = vi.fn(async () => ({ changeSet: changeSet(), before: { kind: 'manuscript' as const, body: '旧句继续。' } }))
    const applyChange = vi.fn(async () => changeSet('applied'))
    const refreshWorkbench = vi.fn()
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={read} applyChange={applyChange} rejectChange={vi.fn()} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)

    await waitFor(() => { expect(view.getByText('旧句')).toBeTruthy() })
    expect(view.getByText('新句')).toBeTruthy()
    fireEvent.click(view.getByText(zh.accept))
    await waitFor(() => { expect(view.getByText(zh.applied)).toBeTruthy() })
    expect(applyChange).toHaveBeenCalledWith(SID, 'changeset-1')
    expect(refreshWorkbench).toHaveBeenCalledTimes(1)
  })

  it('renders an insertion proposal for an empty chapter', async () => {
    const insertion = {
      ...changeSet(),
      operations: [
        { kind: 'update-title', title: '第1章 华夏无神' },
        { kind: 'insert-text', atUtf16: 0, text: '天门外鼓声骤起。' },
      ],
    } as NovelChangeSetDescriptor
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({
        changeSet: insertion, before: { kind: 'manuscript', body: '' }, beforeTitle: '未命名章节',
      })}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(view.getByText('第1章 华夏无神')).toBeTruthy() })
    await waitFor(() => { expect(view.getByText('天门外鼓声骤起。')).toBeTruthy() })
  })

  it('rejects without refreshing and falls back for unrelated tool metadata', async () => {
    const rejectChange = vi.fn(async () => changeSet('rejected'))
    const refreshWorkbench = vi.fn()
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={vi.fn()} rejectChange={rejectChange} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(view.getByText(zh.reject)).toBeTruthy() })
    fireEvent.click(view.getByText(zh.reject))
    await waitFor(() => { expect(view.getByText(zh.rejected)).toBeTruthy() })
    expect(refreshWorkbench).not.toHaveBeenCalled()
    view.unmount()

    const fallback = render(<ChangeSetCard
      block={settled({ kind: 'other' })} sessionId={SID} toolName="other" callId="call-2"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={vi.fn()} applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)
    expect(fallback.getByText(zh.proposal)).toBeTruthy()
  })

  it('does not refresh when an apply decision resolves as conflicted', async () => {
    const refreshWorkbench = vi.fn()
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1" openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={async () => changeSet('conflicted')} rejectChange={vi.fn()} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(view.getByText(zh.accept)).toBeTruthy() })
    fireEvent.click(view.getByText(zh.accept))
    await waitFor(() => { expect(view.getByText(zh.conflicted)).toBeTruthy() })
    expect(refreshWorkbench).not.toHaveBeenCalled()
  })

  it('surfaces read and decision failures without mutating authored state', async () => {
    const readFailure = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => { throw new Error('cannot read proposal') }}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()} renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(readFailure.getByText('cannot read proposal')).toBeTruthy() })
    readFailure.unmount()

    const decisionFailure = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={async () => { throw new Error('apply failed safely') }} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(decisionFailure.getByText(zh.accept)).toBeTruthy() })
    fireEvent.click(decisionFailure.getByText(zh.accept))
    await waitFor(() => { expect(decisionFailure.getByText('apply failed safely')).toBeTruthy() })

    decisionFailure.unmount()
    const nonError = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => { throw 'string failure' }}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()} renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(nonError.getByText('string failure')).toBeTruthy() })
    nonError.unmount()

    const nonErrorDecision = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1" openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={async () => { throw 'string decision failure' }} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(nonErrorDecision.getByText(zh.accept)).toBeTruthy() })
    fireEvent.click(nonErrorDecision.getByText(zh.accept))
    await waitFor(() => { expect(nonErrorDecision.getByText('string decision failure')).toBeTruthy() })
  })

  it('renders conflict state and safely ignores every malformed metadata carrier', async () => {
    const conflict = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet('conflicted'), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()} renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(conflict.getByText(zh.conflicted)).toBeTruthy() })
    conflict.unmount()
    for (const block of [
      {} as ToolResultNode,
      settled(null),
      settled('text'),
      settled({ kind: 'novel-change-set', changeSetId: 1 }),
    ]) {
      const fallback = render(<ChangeSetCard
        block={block} sessionId={SID} toolName="other" callId="call-x" openFile={vi.fn()}
        useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
        useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
        read={vi.fn()} applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
        renderers={renderers} t={t}
      />)
      expect(fallback.getByText(zh.proposal)).toBeTruthy()
      fallback.unmount()
    }
  })

  it('drops late read resolution and rejection after unmount', async () => {
    for (const outcome of ['resolve', 'reject'] as const) {
      let settle!: (value: NovelChangeReview) => void
      const pending = new Promise<NovelChangeReview>((resolve, reject) => {
        settle = outcome === 'resolve' ? resolve : () => { reject(new Error('late failure')) }
      })
      const view = render(<ChangeSetCard
        block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1" openFile={vi.fn()}
        useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
        useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
        read={() => pending} applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
        renderers={renderers} t={t}
      />)
      view.unmount()
      settle({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
    }
  })
})

describe('Novel workbench stores and browser assembly', () => {
  it('keeps Client renderers exact and effect-scoped for independently contributed Asset types', async () => {
    const ctx = new Context()
    const registryFiber = ctx.plugin(NovelAssetRendererRegistry)
    await registryFiber
    const chapterFiber = ctx.plugin({
      inject: ['novelAssetRenderers'],
      apply(scope: Context) { scope.novelAssetRenderers.register(manuscriptChapterRenderer) },
    })
    await chapterFiber
    const testRenderer = { ...manuscriptChapterRenderer, type: 'bible.test' }
    const testFiber = ctx.plugin({
      inject: ['novelAssetRenderers'],
      apply(scope: Context) { scope.novelAssetRenderers.register(testRenderer) },
    })
    await testFiber

    expect(ctx.novelAssetRenderers.list().map(value => value.type)).toEqual(['bible.test', 'manuscript.chapter'])
    expect(ctx.novelAssetRenderers.get('bible.test')).toBe(testRenderer)
    expect(() => ctx.novelAssetRenderers.register(testRenderer)).toThrow(/already registered/u)
    expect(() => ctx.novelAssetRenderers.register({ ...testRenderer, type: 'Test' })).toThrow(/dotted lowercase/u)
    expect(() => ctx.novelAssetRenderers.register({ ...testRenderer, type: 'bible.missing', renderDiff: undefined } as never))
      .toThrow(/missing renderDiff/u)
    await testFiber.dispose()
    expect(() => ctx.novelAssetRenderers.get('bible.test')).toThrow(/no registered Client renderer/u)
    await chapterFiber.dispose()
    await registryFiber.dispose()
  })

  it('covers every shared state transition and frame action', () => {
    const store = createNovelWorkbenchStore().create()
    const project = {
      schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
    } as never
    const assets = [{ id: 'asset-1', title: '第一章' }] as never
    act(() => {
      store.actions.loaded(project, assets)
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '旧句继续。' })
      store.actions.select({ kind: 'text-range', startUtf16: 1, endUtf16: 2 })
      store.actions.setReaderSkin('night')
      store.actions.setReaderFont('sans')
      store.actions.setReaderFontSize(99)
      store.actions.saved(chapter({ revisionId: 'revision-2' as never, content: { kind: 'manuscript', body: '旧句继续。' } }))
      store.actions.fail('failed')
      store.actions.refresh()
    })
    expect(store.getSnapshot()).toMatchObject({
      error: 'failed', reload: 1, dirty: false, readerSkin: 'night', readerFont: 'sans', readerFontSize: 28,
    })
    act(() => { store.actions.reset() })
    expect(store.getSnapshot()).toEqual({
      projectStatus: 'loading', assets: [], dirty: false, readerSkin: 'night', readerFont: 'sans', readerFontSize: 28,
      loading: true, reload: 1,
    })

    const frame = new NovelWorkbenchViewController()
    act(() => {
      frame.toggleExplorer()
    })
    expect(frame.getSnapshot()).toEqual({ explorerCollapsed: true })
  })

  it('wires slots, remotes, Composer mentions, reviews, layout, locale, and theme teardown', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.slots
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    const sessionScope: { value?: object } = {}
    ctx.provide('sessions', { scope: () => sessionScope.value } as never)
    let referenceSource: InputTriggerSource | undefined
    ctx.provide('inputTriggers', {
      registerSource: (source: InputTriggerSource) => { referenceSource = source; return () => { referenceSource = undefined } },
    } as never)
    const project = {
      schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
    }
    const asset = {
      id: 'asset-chapter-1', projectId: 'project-1', type: 'manuscript.chapter',
      projectRelativePath: 'manuscript/chapter-1.md', revisionId: 'revision-1',
      contentHash: `sha256:${'a'.repeat(64)}`, title: '第一章',
    }
    let discoverValue: unknown = project
    let failAsset = false
    const remote = {
      discover: vi.fn(async () => ({ ok: true as const, value: discoverValue })),
      initialize: vi.fn(async () => ({ ok: true as const, value: project })),
      assets: vi.fn(async () => ({ ok: true as const, value: [asset] })),
      asset: vi.fn(async (
        _sid: unknown,
        _aid: unknown,
        revision: NovelAssetDocument['revisionId'] | undefined,
      ) => failAsset
        ? { ok: false as const, error: { code: 'REMOTE_FAILED', message: 'offline', name: 'Error' } }
        : { ok: true as const, value: chapter({ revisionId: revision ?? chapter().revisionId }) }),
      saveAsset: vi.fn(async () => ({ ok: true as const, value: chapter({ revisionId: 'revision-2' as never }) })),
      captureSelection: vi.fn(async () => ({ ok: true as const, value: selection() })),
      changeSet: vi.fn(async () => ({ ok: true as const, value: changeSet() })),
      applyChangeSet: vi.fn(async () => ({ ok: true as const, value: changeSet('applied') })),
      rejectChangeSet: vi.fn(async () => ({ ok: true as const, value: changeSet('rejected') })),
      search: vi.fn(async () => ({ ok: true as const, value: [] })),
      replaceContextWorkset: vi.fn(async (_sid: unknown, value: NovelContextWorksetDescriptor) => ({ ok: true as const, value })),
    }
    ctx.provide('remote', { novelRepository: remote } as never)
    const layout = new LayoutController()
    ctx.provide('layout', layout as never)
    const presetSelection = createSnapshotStore({ current: 'novel-workbench' })
    ctx.provide('agentPresetSelection', presetSelection)
    let theme: ThemeSnapshot = {
      preference: 'light', active: { id: 'light', colorScheme: 'light', tokens: { '--novel-old': '1px' } },
      themes: [], revision: 0,
    }
    ctx.provide('theme', { getTheme: () => theme } as never)
    const declareTool = slots.register({
      name: 'root',
      priority: 10,
      children: {
        'tool.call.toolview': { kind: 'keyed', scope: 'session' },
        'conversation.input.left': { kind: 'list', scope: 'session' },
        'conversation.input.dock': { kind: 'list', scope: 'session' },
        'shell.workbench': { kind: 'chain', scope: 'root' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({
      // The production client module loader understands dotted Remote facets;
      // this direct Cordis bench provides the complete remote object itself.
      inject: workbenchInject.filter(name => name !== 'remote.novelRepository'),
      apply: applyWorkbench,
    })
    await fiber.await()

    expect(slots.entries('root')).toHaveLength(1)
    const workbenchEntry = slots.entries('shell.workbench').find(entry => entry.component === NovelFrame)!
    const workbenchFace = (workbenchEntry.inject as () => {
      workbench: NovelWorkbenchViewController
      setAgentWidth: (width: number) => void
    })()
    expect(workbenchFace.workbench).toBeInstanceOf(NovelWorkbenchViewController)
    workbenchFace.setAgentWidth(480)
    expect(layout.workbench.getSnapshot().agentWidth).toBe(480)

    const toggle = slots.entries('conversation.input.left').find(entry => entry.component === WorkbenchToggle)!
    const toggleFace = (toggle.inject as () => {
      hooks: { workbench: typeof layout.workbench; agentPresetSelection: typeof presetSelection }
      toggleWorkbench: () => void
    })()
    expect(toggleFace.hooks.workbench).toBe(layout.workbench)
    expect(toggleFace.hooks.agentPresetSelection).toBe(presetSelection)
    toggleFace.toggleWorkbench()
    expect(layout.workbench.getSnapshot()).toMatchObject({ id: 'novel', agentPreset: 'novel-workbench' })
    toggleFace.toggleWorkbench()
    expect(layout.workbench.getSnapshot().id).toBeNull()

    const tray = slots.entries('conversation.input.dock').find(entry => entry.component === ContextTray)!
    const trayFace = (tray.inject as (sessionId: SessionId) => {
      hooks: { contextFocus: NovelContextFocusController; projectStatus: NovelProjectStatusController }
      search: (request: unknown) => Promise<unknown>
      replace: (workset: NovelContextWorksetDescriptor) => Promise<unknown>
    })(SID)
    await expect(trayFace.search({ query: '白港' })).resolves.toEqual([])
    const workset: NovelContextWorksetDescriptor = { version: 2, projectId: 'project-1' as never, items: [] }
    await expect(trayFace.replace(workset)).resolves.toEqual(workset)

    const explorer = slots.entries('novel.explorer')[0]!.inject as () => {
      load: (id: SessionId) => Promise<unknown>
      open: (id: SessionId, assetId: string) => Promise<unknown>
      onRefresh: (listener: () => void) => () => void
    }
    const explorerFace = explorer()
    await expect(explorerFace.load(SID)).resolves.toMatchObject({ project, assets: [asset] })
    const assetsCalls = remote.assets.mock.calls.length
    discoverValue = undefined
    await expect(explorerFace.load(SID)).resolves.toEqual({ assets: [] })
    expect(remote.assets).toHaveBeenCalledTimes(assetsCalls)
    await expect(explorerFace.open(SID, 'asset-chapter-1')).resolves.toMatchObject({ title: '第一章' })

    const canvas = slots.entries('novel.canvas')[0]!.inject as () => {
      initialize: (id: SessionId, title: string) => Promise<unknown>
      save: (id: SessionId, request: unknown) => Promise<unknown>
      capture: (id: SessionId, request: unknown) => Promise<unknown>
      appendReference: (id: SessionId, reference: NovelSelectionDescriptor, label: string) => void
      reportContextFocus: (value?: Parameters<NovelContextFocusController['set']>[0]) => void
      reportProjectStatus: (value?: Parameters<NovelProjectStatusController['set']>[0]) => void
    }
    const canvasFace = canvas()
    canvasFace.reportProjectStatus({ sessionId: SID, status: 'uninitialized' })
    expect(trayFace.hooks.projectStatus.getSnapshot()).toEqual({ sessionId: SID, status: 'uninitialized' })
    await expect(canvasFace.initialize(SID, '白港')).resolves.toMatchObject({ title: '白港' })
    canvasFace.reportContextFocus({ sessionId: SID, project: project as never, document: chapter(), dirty: false })
    expect(trayFace.hooks.contextFocus.getSnapshot()).toMatchObject({ sessionId: SID, document: { id: 'asset-chapter-1' } })
    await expect(canvasFace.save(SID, {})).resolves.toMatchObject({ revisionId: 'revision-2' })
    await expect(canvasFace.capture(SID, {})).resolves.toMatchObject({ id: 'selection-1' })
    expect(() => { canvasFace.appendReference(SID, selection(), '[新句]') }).toThrow(/no browser scope/u)
    sessionScope.value = {}
    expect(() => { canvasFace.appendReference(SID, selection(), '[新句]') }).toThrow(/conversation service is unavailable/u)
    let draft = '前后'
    let draftRev = 0
    const insertReferenceAtSelection = vi.fn((reference: ReferenceInsert) => {
      draft = `${draft.slice(0, 1)}@${reference.label} ${draft.slice(1)}`
      draftRev += 1
      return true
    })
    ctx.provide('conversation', {
      input: { for: () => ({ state: { getSnapshot: () => ({ draft, draftRev }) }, insertReferenceAtSelection }) },
    } as never)
    canvasFace.appendReference(SID, selection(), '[新句]')
    expect(draft).toBe('前@[新句] 后')
    const inserted = insertReferenceAtSelection.mock.calls[0]![0]
    expect(inserted).toMatchObject({ source: 'novel-selection', label: '[新句]', clipboardText: '@[新句]' })
    if (referenceSource?.codec === undefined) throw new Error('Novel reference source was not registered')
    await expect(referenceSource.codec.serialize(inserted.ref, new AbortController().signal)).resolves.toBe(selection().mention)
    expect(referenceSource.codec.clipboardText(inserted.ref)).toBe('@[新句]')

    const card = slots.entries('tool.call.toolview').find(entry => entry.component === ChangeSetCard)!
    const review = (card.inject as () => {
      read: (sid: string, id: string) => Promise<NovelChangeReview>
      applyChange: (sid: string, id: string) => Promise<NovelChangeSetDescriptor>
      rejectChange: (sid: string, id: string) => Promise<NovelChangeSetDescriptor>
      refreshWorkbench: () => void
    })()
    await expect(review.read(SID, 'changeset-1')).resolves.toMatchObject({
      changeSet: { id: 'changeset-1' },
      before: { kind: 'manuscript', body: '旧句继续。' },
    })
    await expect(review.applyChange(SID, 'changeset-1')).resolves.toMatchObject({ status: 'applied' })
    await expect(review.rejectChange(SID, 'changeset-1')).resolves.toMatchObject({ status: 'rejected' })
    const refreshed = vi.fn()
    const offRefresh = explorerFace.onRefresh(refreshed)
    review.refreshWorkbench()
    expect(refreshed).toHaveBeenCalledOnce()
    offRefresh()
    review.refreshWorkbench()
    expect(refreshed).toHaveBeenCalledOnce()

    const presentation = slots.entries('tool.call.toolview').find(entry => entry.component === NovelPresentationCard)!
    const presentationFace = (presentation.inject as () => {
      present: (intent: 'open-workbench' | 'close-workbench') => void
    })()
    presentationFace.present('open-workbench')
    expect(layout.workbench.getSnapshot().id).toBe('novel')
    presentationFace.present('close-workbench')
    expect(layout.workbench.getSnapshot().id).toBeNull()

    failAsset = true
    await expect(explorerFace.open(SID, 'asset-chapter-1')).rejects.toThrow('open Novel Asset failed: REMOTE_FAILED: offline')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.style.getPropertyValue('--novel-old')).toBe('1px')
    theme = {
      preference: 'dark', active: { id: 'dark', colorScheme: 'dark', tokens: { '--novel-old': '3px', '--novel-new': '2px' } },
      themes: [], revision: 1,
    }
    ctx.emit('theme/change', theme)
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    expect(document.body.style.getPropertyValue('--novel-old')).toBe('3px')
    theme = {
      preference: 'dark', active: { id: 'dark', colorScheme: 'dark', tokens: { '--novel-new': '2px' } },
      themes: [], revision: 2,
    }
    ctx.emit('theme/change', theme)
    expect(document.body.style.getPropertyValue('--novel-old')).toBe('')
    expect(document.body.style.getPropertyValue('--novel-new')).toBe('2px')

    await fiber.dispose()
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(document.body.style.getPropertyValue('--novel-new')).toBe('')
    declareTool()
  })

  it('publishes its Host readiness marker after the repository client and registers its invariant companion', async () => {
    const host = new Context()
    const fiber = host.plugin(NovelWorkbenchReady)
    expect(host.get('novelWorkbenchReady')).toBeUndefined()
    const disposeClient = host.provide('novelRepositoryClientReady', {} as never)
    await fiber.await()
    expect(host.novelWorkbenchReady).toBeInstanceOf(NovelWorkbenchReady)
    await fiber.dispose()
    expect(host.get('novelWorkbenchReady')).toBeUndefined()
    disposeClient()

    const register = vi.fn().mockReturnValue(() => {})
    const dispose = await invariant.apply({ invariants: { register } } as never)
    expect(invariant.name).toBe('novel-workbench-invariant')
    expect(invariant.inject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-experimental-novel-workbench', expect.any(Function))
    expect(() => { (register.mock.calls[0]![1] as () => void)() }).not.toThrow()
    expect(dispose).toBeTypeOf('function')
  })
})
